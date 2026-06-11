"""Competitive services: ladder tiers, decay, duels, sparring matcher,
meta tracker, tier list, heatmap, bounty bracket.

Tier de un jugador se deriva del rating Glicko-2 actual:
  rating < 1300  → BRONZE
  1300-1450      → SILVER
  1450-1600      → GOLD
  1600-1750      → PLATINUM
  1750-1900      → DIAMOND
  1900-2050      → MASTER
  >= 2050        → GRANDMASTER
"""
from __future__ import annotations

import logging
from collections import defaultdict
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone

from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.orm import Session

from app.models import (
    BountyBracketState, ChallengeDuel, EventRegistration, EventSpecialMode,
    GuildWar, GuildWarMatch, MatchResult, PlayerDeck, PlayerProfile,
    PlayerRating, SparringQueueEntry,
)

log = logging.getLogger("competitive")


# ═══════════════════════════════════════════════════════════════════════
# LADDER TIERS
# ═══════════════════════════════════════════════════════════════════════


@dataclass(frozen=True)
class TierDef:
    key: str
    label: str
    min_rating: float
    max_rating: float
    color: str   # tailwind hint
    emoji: str


TIERS: list[TierDef] = [
    TierDef("BRONZE",      "Bronce",      0,      1300, "amber",  "🥉"),
    TierDef("SILVER",      "Plata",       1300,   1450, "slate",  "🥈"),
    TierDef("GOLD",        "Oro",         1450,   1600, "yellow", "🥇"),
    TierDef("PLATINUM",    "Platino",     1600,   1750, "cyan",   "💎"),
    TierDef("DIAMOND",     "Diamante",    1750,   1900, "blue",   "💠"),
    TierDef("MASTER",      "Master",      1900,   2050, "violet", "🌟"),
    TierDef("GRANDMASTER", "Grandmaster", 2050,   9999, "rose",   "👑"),
]


def tier_for_rating(rating: float) -> TierDef:
    for t in TIERS:
        if t.min_rating <= rating < t.max_rating:
            return t
    return TIERS[-1]


def progress_in_tier(rating: float, tier: TierDef) -> float:
    """0.0 - 1.0: cuán cerca está el jugador de ascender al siguiente tier."""
    span = tier.max_rating - tier.min_rating
    if span <= 0:
        return 1.0
    return max(0.0, min(1.0, (rating - tier.min_rating) / span))


# ═══════════════════════════════════════════════════════════════════════
# RANKED DECAY — aplica a jugadores inactivos sin freeze
# ═══════════════════════════════════════════════════════════════════════


DECAY_AFTER_DAYS = 14    # tras 14 días sin match
DECAY_RATE_PER_DAY = 2.0  # -2 rating por día de inactividad
DECAY_FLOOR = 1500.0      # nunca baja de 1500 por decay (pelearlo abajo, sí)


def apply_decay_to_all(db: Session) -> int:
    """Aplica decay a player_ratings inactivos. Returns número de filas afectadas.
    Pensado para correr 1x/día desde scheduler."""
    now = datetime.now(timezone.utc)
    cutoff = now - timedelta(days=DECAY_AFTER_DAYS)
    candidates = list(db.scalars(select(PlayerRating).where(
        PlayerRating.last_match_at.is_not(None),
        PlayerRating.last_match_at < cutoff,
        PlayerRating.rating > DECAY_FLOOR,
    )))
    affected = 0
    for r in candidates:
        if r.freeze_until and r.freeze_until > now:
            continue  # frozen
        days = (now - r.last_match_at).days
        decay = (days - DECAY_AFTER_DAYS) * DECAY_RATE_PER_DAY
        new_rating = max(DECAY_FLOOR, r.rating - decay)
        if new_rating < r.rating:
            r.rating = new_rating
            affected += 1
    db.commit()
    log.info("decay applied to %d ratings", affected)
    return affected


def freeze_decay(db: Session, *, player_id: int, game_id: int, days: int) -> PlayerRating:
    """Pone freeze por N días. Tope duro 365 — el cap por rol (30 no-member)
    lo valida el endpoint."""
    if days <= 0 or days > 365:
        raise ValueError("days must be 1-365")
    r = db.scalar(select(PlayerRating).where(
        PlayerRating.player_id == player_id, PlayerRating.game_id == game_id,
    ))
    if not r:
        raise ValueError("Rating no encontrado")
    now = datetime.now(timezone.utc)
    base = r.freeze_until if (r.freeze_until and r.freeze_until > now) else now
    r.freeze_until = base + timedelta(days=days)
    db.commit()
    return r


# ═══════════════════════════════════════════════════════════════════════
# SPARRING MATCHMAKER — corre cada 30s desde scheduler
# ═══════════════════════════════════════════════════════════════════════


def run_sparring_matchmaker(db: Session) -> int:
    """Empareja jugadores en cola por game + rating range overlap.
    Devuelve cantidad de matches creados.
    """
    waiting = list(db.scalars(select(SparringQueueEntry).where(
        SparringQueueEntry.matched_at.is_(None)
    ).order_by(SparringQueueEntry.created_at)))
    if not waiting:
        return 0

    by_game: dict[int, list[SparringQueueEntry]] = defaultdict(list)
    for w in waiting:
        by_game[w.game_id].append(w)

    paired = 0
    now = datetime.now(timezone.utc)
    for game_id, entries in by_game.items():
        # Greedy: dos primeros se emparejan si tienen ratings compatibles
        i = 0
        while i < len(entries) - 1:
            a = entries[i]
            if a.matched_at:
                i += 1
                continue
            # Buscar partner compatible
            for j in range(i + 1, len(entries)):
                b = entries[j]
                if b.matched_at:
                    continue
                if a.player_id == b.player_id:
                    continue
                # Rating overlap check
                ra = db.scalar(select(PlayerRating).where(
                    PlayerRating.player_id == a.player_id, PlayerRating.game_id == game_id,
                ))
                rb = db.scalar(select(PlayerRating).where(
                    PlayerRating.player_id == b.player_id, PlayerRating.game_id == game_id,
                ))
                ra_val = ra.rating if ra else 1500
                rb_val = rb.rating if rb else 1500
                # Si alguno tiene min/max preference, respetar
                if a.rating_min and rb_val < a.rating_min: continue
                if a.rating_max and rb_val > a.rating_max: continue
                if b.rating_min and ra_val < b.rating_min: continue
                if b.rating_max and ra_val > b.rating_max: continue
                # Match!
                a.matched_with_id = b.player_id
                b.matched_with_id = a.player_id
                a.matched_at = now
                b.matched_at = now
                paired += 1
                break
            i += 1

    db.commit()
    if paired:
        log.info("sparring matcher created %d pairs", paired)
    return paired


# ═══════════════════════════════════════════════════════════════════════
# META TRACKER — archetypes win rates & matchup matrix
# ═══════════════════════════════════════════════════════════════════════


def compute_meta_snapshot(db: Session, *, game_id: int | None = None, days: int = 30) -> dict:
    """Devuelve un snapshot del meta de los últimos N días.

    Output:
      {
        "archetypes": [
          {"name": "UW Control", "games_played": 24, "wins": 14, "win_rate": 0.583, "share_pct": 12.5},
          ...
        ],
        "matchups": [
          {"a": "UW Control", "b": "Mono Red", "a_wins": 5, "b_wins": 3, "draws": 1, "a_winrate": 0.555},
          ...
        ],
        "total_matches": int,
      }
    """
    since = datetime.now(timezone.utc) - timedelta(days=days)
    # Match results recientes con player decks asociados via EventRegistration.deck_id
    stmt = select(MatchResult).where(
        MatchResult.reported_at.is_not(None),
        MatchResult.reported_at >= since,
        MatchResult.is_bye.is_(False),
    )
    matches = list(db.scalars(stmt))

    # Encontrar decks de cada jugador en cada match via EventRegistration
    archetype_stats: dict[str, dict] = defaultdict(lambda: {"games": 0, "wins": 0})
    matchup_stats: dict[tuple[str, str], dict] = defaultdict(lambda: {"a_wins": 0, "b_wins": 0, "draws": 0})

    for m in matches:
        reg_a = db.scalar(select(EventRegistration).where(
            EventRegistration.event_id == m.event_id,
            EventRegistration.player_id == m.player_a_id,
        ))
        reg_b = db.scalar(select(EventRegistration).where(
            EventRegistration.event_id == m.event_id,
            EventRegistration.player_id == m.player_b_id,
        )) if m.player_b_id else None
        deck_a = db.get(PlayerDeck, reg_a.deck_id) if reg_a and reg_a.deck_id else None
        deck_b = db.get(PlayerDeck, reg_b.deck_id) if reg_b and reg_b.deck_id else None
        # Filtrar por game si se pidió
        if game_id is not None:
            if deck_a and deck_a.game_id != game_id and deck_b and deck_b.game_id != game_id:
                continue
        arc_a = (deck_a.archetype if deck_a else None) or "Unknown"
        arc_b = (deck_b.archetype if deck_b else None) or "Unknown"

        archetype_stats[arc_a]["games"] += 1
        archetype_stats[arc_b]["games"] += 1
        if not m.is_draw and m.winner_id == m.player_a_id:
            archetype_stats[arc_a]["wins"] += 1
        elif not m.is_draw and m.winner_id == m.player_b_id:
            archetype_stats[arc_b]["wins"] += 1

        a_key, b_key = sorted([arc_a, arc_b])
        flip = (a_key != arc_a)
        if m.is_draw:
            matchup_stats[(a_key, b_key)]["draws"] += 1
        elif (not flip and m.winner_id == m.player_a_id) or (flip and m.winner_id == m.player_b_id):
            matchup_stats[(a_key, b_key)]["a_wins"] += 1
        else:
            matchup_stats[(a_key, b_key)]["b_wins"] += 1

    total_games = sum(s["games"] for s in archetype_stats.values())
    arch_out = []
    for name, s in sorted(archetype_stats.items(), key=lambda x: -x[1]["games"]):
        if s["games"] == 0:
            continue
        arch_out.append({
            "name": name,
            "games_played": s["games"],
            "wins": s["wins"],
            "win_rate": round(s["wins"] / s["games"], 3),
            "share_pct": round(s["games"] / max(1, total_games) * 100, 1),
        })

    matchup_out = []
    for (a, b), s in matchup_stats.items():
        total = s["a_wins"] + s["b_wins"] + s["draws"]
        if total < 2:
            continue
        matchup_out.append({
            "a": a, "b": b,
            "a_wins": s["a_wins"], "b_wins": s["b_wins"], "draws": s["draws"],
            "a_winrate": round(s["a_wins"] / total, 3),
            "games": total,
        })
    matchup_out.sort(key=lambda x: -x["games"])

    return {
        "archetypes": arch_out[:30],
        "matchups": matchup_out[:50],
        "total_matches": len(matches),
        "since_days": days,
    }


# ═══════════════════════════════════════════════════════════════════════
# PLAYER TIER LIST — S/A/B/C basado en rating + actividad + recencia
# ═══════════════════════════════════════════════════════════════════════


def compute_tier_list(db: Session, *, game_id: int | None = None, limit: int = 100) -> list[dict]:
    """Devuelve players ordenados con su tier."""
    stmt = select(PlayerRating)
    if game_id:
        stmt = stmt.where(PlayerRating.game_id == game_id)
    stmt = stmt.order_by(desc(PlayerRating.rating)).limit(limit)
    rows = list(db.scalars(stmt))
    out = []
    for r in rows:
        t = tier_for_rating(r.rating)
        p = db.get(PlayerProfile, r.player_id)
        if not p:
            continue
        out.append({
            "player_id": p.id,
            "alias": p.alias,
            "elite_id_code": p.elite_id_code,
            "rating": round(r.rating, 1),
            "rd": round(r.rd, 1),
            "tier_key": t.key,
            "tier_label": t.label,
            "tier_emoji": t.emoji,
            "tier_progress": round(progress_in_tier(r.rating, t), 3),
            "peak_rating": round(r.peak_rating, 1),
            "matches_played": r.matches_played,
            "last_match_at": r.last_match_at.isoformat() if r.last_match_at else None,
            "is_frozen": bool(r.freeze_until and r.freeze_until > datetime.now(timezone.utc)),
        })
    return out


# ═══════════════════════════════════════════════════════════════════════
# PLAYER HEATMAP — performance por ronda, archetype, día
# ═══════════════════════════════════════════════════════════════════════


def compute_player_heatmap(db: Session, *, player_id: int) -> dict:
    """Performance del jugador: matches por ronda, por día semana, mejor matchup."""
    matches = list(db.scalars(select(MatchResult).where(
        or_(MatchResult.player_a_id == player_id, MatchResult.player_b_id == player_id),
        MatchResult.reported_at.is_not(None),
    )))

    by_round: dict[int, dict] = defaultdict(lambda: {"wins": 0, "losses": 0, "draws": 0})
    by_weekday: dict[int, dict] = defaultdict(lambda: {"wins": 0, "losses": 0, "draws": 0})
    by_opp_archetype: dict[str, dict] = defaultdict(lambda: {"wins": 0, "losses": 0, "draws": 0})

    for m in matches:
        if m.is_bye:
            continue
        is_a = m.player_a_id == player_id
        opp_id = m.player_b_id if is_a else m.player_a_id
        if m.is_draw:
            outcome = "draws"
        elif m.winner_id == player_id:
            outcome = "wins"
        else:
            outcome = "losses"
        by_round[m.round_number][outcome] += 1
        if m.reported_at:
            by_weekday[m.reported_at.weekday()][outcome] += 1
        # Opponent archetype
        opp_reg = db.scalar(select(EventRegistration).where(
            EventRegistration.event_id == m.event_id,
            EventRegistration.player_id == opp_id,
        )) if opp_id else None
        deck = db.get(PlayerDeck, opp_reg.deck_id) if opp_reg and opp_reg.deck_id else None
        arc = (deck.archetype if deck else None) or "Unknown"
        by_opp_archetype[arc][outcome] += 1

    return {
        "by_round": [{"round": r, **stats} for r, stats in sorted(by_round.items())],
        "by_weekday": [{"weekday": d, **stats} for d, stats in sorted(by_weekday.items())],
        "by_opp_archetype": sorted(
            [{"archetype": a, **stats, "total": sum(stats.values())} for a, stats in by_opp_archetype.items()],
            key=lambda x: -x["total"]
        )[:15],
        "total_matches": sum(1 for m in matches if not m.is_bye),
    }


# ═══════════════════════════════════════════════════════════════════════
# DUEL HELPERS
# ═══════════════════════════════════════════════════════════════════════


def settle_duel(db: Session, *, duel: ChallengeDuel) -> None:
    """Al settle: aplica EXP del stake al ganador, Glicko si is_ranked, marca completed."""
    from app.services import exp as exp_svc
    if duel.status != "ACCEPTED":
        raise ValueError("Duel no está aceptado")
    if not duel.winner_id:
        raise ValueError("Falta winner_id")

    duel.status = "COMPLETED"
    duel.completed_at = datetime.now(timezone.utc)

    # Stake EXP transfer: el loser ya descontó al aceptar, le sumamos doble al winner
    if duel.stake_exp > 0:
        try:
            exp_svc.award_exp(
                db, player_id=duel.winner_id, reason_code="duel_win",
                amount=duel.stake_exp * 2,
                reason=f"Duel #{duel.id} ganado",
            )
        except Exception:
            log.exception("duel win EXP failed")

    # Ranked: Glicko + promotion series check
    if duel.is_ranked:
        try:
            from app.services import rating as rating_svc
            rating_svc.apply_match_rating(
                db, event_id=None,
                player_a_id=duel.challenger_id, player_b_id=duel.challenged_id,
                winner_id=duel.winner_id, is_draw=False,
                game_id_override=duel.game_id,
            )
            # Post-rating: chequear promotion series + demotion shield
            _check_promotion_after_match(db, player_id=duel.winner_id, game_id=duel.game_id, won=True)
            loser_id = duel.challenger_id if duel.winner_id == duel.challenged_id else duel.challenged_id
            _check_promotion_after_match(db, player_id=loser_id, game_id=duel.game_id, won=False)
        except Exception:
            log.exception("duel rating apply failed")

    # Anti-collusion check post-settle
    try:
        _check_duel_collusion(db, duel=duel)
    except Exception:
        log.exception("collusion check failed")

    db.flush()


def report_duel_dual(db: Session, *, duel: ChallengeDuel, reporter_id: int,
                     winner_id: int, games_c: int, games_d: int) -> dict:
    """Dual-confirm: ambos players reportan. Si coinciden → settle. Si difieren → dispute."""
    from datetime import datetime as _dt
    now = _dt.now(timezone.utc)
    if reporter_id not in (duel.challenger_id, duel.challenged_id):
        raise ValueError("No es parte del duelo")
    if duel.status != "ACCEPTED":
        raise ValueError(f"Estado {duel.status} no permite reportar")
    if winner_id not in (duel.challenger_id, duel.challenged_id):
        raise ValueError("Winner inválido")

    if reporter_id == duel.challenger_id:
        duel.challenger_reported_winner_id = winner_id
        duel.challenger_reported_at = now
    else:
        duel.challenged_reported_winner_id = winner_id
        duel.challenged_reported_at = now

    duel.games_challenger = games_c
    duel.games_challenged = games_d

    both = (duel.challenger_reported_winner_id is not None
            and duel.challenged_reported_winner_id is not None)
    if not both:
        return {"status": "PENDING_OPPONENT", "waiting_for": duel.challenged_id if reporter_id == duel.challenger_id else duel.challenger_id}

    if duel.challenger_reported_winner_id != duel.challenged_reported_winner_id:
        duel.is_disputed = True
        # Trust impact suave a ambos por dispute
        for pid in (duel.challenger_id, duel.challenged_id):
            adjust_trust_score(db, player_id=pid, game_id=duel.game_id, delta=-0.03)
        db.flush()
        return {"status": "DISPUTED",
                "challenger_says": duel.challenger_reported_winner_id,
                "challenged_says": duel.challenged_reported_winner_id}

    # Coinciden: settle
    duel.winner_id = winner_id
    settle_duel(db, duel=duel)
    return {"status": "COMPLETED", "winner_id": winner_id}


def admin_resolve_dispute(db: Session, *, duel: ChallengeDuel, winner_id: int) -> None:
    """Admin resuelve un duelo en disputa forzando winner."""
    if not duel.is_disputed:
        raise ValueError("Duel no está en disputa")
    if winner_id not in (duel.challenger_id, duel.challenged_id):
        raise ValueError("Winner inválido")
    duel.is_disputed = False
    duel.winner_id = winner_id
    settle_duel(db, duel=duel)


# ═══════════════════════════════════════════════════════════════════════
# TIMEOUTS — scheduler
# ═══════════════════════════════════════════════════════════════════════


def cleanup_pending_duels(db: Session) -> int:
    """Auto-expire duels PENDING vencidos. Auto-cancel ACCEPTED sin reporte en 24h."""
    from app.services import exp as exp_svc
    now = datetime.now(timezone.utc)
    affected = 0

    # PENDING expirados (expires_at < now)
    expired = list(db.scalars(select(ChallengeDuel).where(
        ChallengeDuel.status == "PENDING",
        ChallengeDuel.expires_at < now,
    )))
    for d in expired:
        d.status = "EXPIRED"
        if d.stake_exp > 0:
            try:
                exp_svc.award_exp(db, player_id=d.challenger_id,
                                  reason_code="duel_refund", amount=d.stake_exp,
                                  reason=f"Duel #{d.id} expirado")
            except Exception:
                log.exception("refund expired duel %s", d.id)
        affected += 1

    # ACCEPTED sin reportar en 24h post-accept → auto-cancel + refund ambos
    accepted_cutoff = now - timedelta(hours=24)
    stale = list(db.scalars(select(ChallengeDuel).where(
        ChallengeDuel.status == "ACCEPTED",
        ChallengeDuel.accepted_at < accepted_cutoff,
        ChallengeDuel.winner_id.is_(None),
    )))
    for d in stale:
        d.status = "CANCELLED"
        if d.stake_exp > 0:
            for pid in (d.challenger_id, d.challenged_id):
                try:
                    exp_svc.award_exp(db, player_id=pid, reason_code="duel_refund",
                                      amount=d.stake_exp,
                                      reason=f"Duel #{d.id} timeout 24h, refund")
                except Exception:
                    log.exception("refund stale duel %s", d.id)
            # Trust hit por ghosting
            adjust_trust_score(db, player_id=d.challenger_id, game_id=d.game_id, delta=-0.02)
            adjust_trust_score(db, player_id=d.challenged_id, game_id=d.game_id, delta=-0.02)
        affected += 1

    db.commit()
    if affected:
        log.info("cleanup_pending_duels affected=%d", affected)
    return affected


def cleanup_sparring_queue(db: Session) -> int:
    """Purge sparring entries antiguos: unmatched >30min, matched >2h."""
    now = datetime.now(timezone.utc)
    unmatched_cutoff = now - timedelta(minutes=30)
    matched_cutoff = now - timedelta(hours=2)
    stale_unmatched = list(db.scalars(select(SparringQueueEntry).where(
        SparringQueueEntry.matched_at.is_(None),
        SparringQueueEntry.created_at < unmatched_cutoff,
    )))
    stale_matched = list(db.scalars(select(SparringQueueEntry).where(
        SparringQueueEntry.matched_at.is_not(None),
        SparringQueueEntry.matched_at < matched_cutoff,
    )))
    total = 0
    for s in (*stale_unmatched, *stale_matched):
        db.delete(s)
        total += 1
    db.commit()
    if total:
        log.info("sparring cleanup removed=%d", total)
    return total


# ═══════════════════════════════════════════════════════════════════════
# GUILD WAR auto-resolve
# ═══════════════════════════════════════════════════════════════════════


def resolve_expired_wars(db: Session) -> int:
    """Cierra wars ACTIVE cuyo ends_at ya pasó. Compute winner + paga EXP a miembros."""
    from app.models import GuildMembership
    from app.services import exp as exp_svc
    now = datetime.now(timezone.utc)
    expired = list(db.scalars(select(GuildWar).where(
        GuildWar.status == "ACTIVE",
        GuildWar.ends_at < now,
    )))
    closed = 0
    for w in expired:
        if w.score_a > w.score_b:
            w.winner_guild_id = w.guild_a_id
        elif w.score_b > w.score_a:
            w.winner_guild_id = w.guild_b_id
        else:
            w.winner_guild_id = None  # tie
        w.status = "FINISHED"
        if w.winner_guild_id:
            members = list(db.scalars(select(GuildMembership).where(
                GuildMembership.guild_id == w.winner_guild_id,
            )))
            for m in members:
                if not m.user_id:
                    continue
                # Buscar player profile del user
                from app.models import User
                u = db.get(User, m.user_id)
                if u and u.profile:
                    try:
                        exp_svc.award_exp(
                            db, player_id=u.profile.id,
                            reason_code="guild_war_win", amount=150,
                            reason=f"Guild War #{w.id} ganada",
                        )
                    except Exception:
                        log.exception("guild war EXP failed")
        closed += 1
    db.commit()
    if closed:
        log.info("guild wars closed=%d", closed)
    return closed


# ═══════════════════════════════════════════════════════════════════════
# SPONSOR + BOUNTY hooks (llamados desde tournament.finalize_positions)
# ═══════════════════════════════════════════════════════════════════════


def pay_sponsor_bonuses(db: Session, *, event_id: int) -> int:
    """Hook al finalizar evento: paga bonus EXP a ambassadors según posición."""
    from app.models import Season, SponsorAmbassador, Sponsor
    from app.services import exp as exp_svc
    season = db.scalar(select(Season).where(Season.status == "ACTIVE"))
    regs = list(db.scalars(select(EventRegistration).where(
        EventRegistration.event_id == event_id,
        EventRegistration.final_position.is_not(None),
        EventRegistration.final_position <= 8,
    )))
    paid = 0
    for r in regs:
        ambs = list(db.scalars(select(SponsorAmbassador).where(
            SponsorAmbassador.player_id == r.player_id,
            SponsorAmbassador.is_active.is_(True),
            (SponsorAmbassador.season_id == (season.id if season else None)) | (SponsorAmbassador.season_id.is_(None)),
        )))
        for amb in ambs:
            bonus = amb.bonus_exp_per_champion if r.final_position == 1 else amb.bonus_exp_per_top8
            if bonus <= 0:
                continue
            try:
                exp_svc.award_exp(
                    db, player_id=r.player_id, reason_code="sponsor_bonus",
                    amount=bonus, related_event_id=event_id,
                    reason=f"Sponsor bonus (pos #{r.final_position})",
                )
                sponsor = db.get(Sponsor, amb.sponsor_id)
                if sponsor:
                    sponsor.total_paid_exp += bonus
                paid += 1
            except Exception:
                log.exception("sponsor bonus failed")
    if paid:
        log.info("sponsor bonuses paid=%d for event %d", paid, event_id)
    return paid


def transfer_bounty_on_kill(db: Session, *, match: MatchResult) -> bool:
    """Hook en report_match: si winner mata a player con bounty activo, le transfiere."""
    if not match.winner_id or match.is_draw or match.is_bye:
        return False
    loser_id = match.player_a_id if match.winner_id == match.player_b_id else match.player_b_id
    if not loser_id:
        return False
    loser_state = db.scalar(select(BountyBracketState).where(
        BountyBracketState.event_id == match.event_id,
        BountyBracketState.player_id == loser_id,
    ))
    if not loser_state or loser_state.own_bounty_exp + loser_state.accumulated_exp == 0:
        return False
    total = loser_state.own_bounty_exp + loser_state.accumulated_exp
    # Transfer al winner
    winner_state = db.scalar(select(BountyBracketState).where(
        BountyBracketState.event_id == match.event_id,
        BountyBracketState.player_id == match.winner_id,
    ))
    if not winner_state:
        winner_state = BountyBracketState(event_id=match.event_id, player_id=match.winner_id)
        db.add(winner_state)
    winner_state.accumulated_exp += total
    loser_state.own_bounty_exp = 0
    loser_state.accumulated_exp = 0
    log.info("bounty %d EXP transferred from player %d → %d in event %d",
             total, loser_id, match.winner_id, match.event_id)
    return True


# ═══════════════════════════════════════════════════════════════════════
# PROMOTION SERIES + DEMOTION SHIELD
# ═══════════════════════════════════════════════════════════════════════


def _check_promotion_after_match(db: Session, *, player_id: int, game_id: int, won: bool) -> None:
    """Después de un match ranked, evalúa promotion series + demotion shield."""
    r = db.scalar(select(PlayerRating).where(
        PlayerRating.player_id == player_id, PlayerRating.game_id == game_id
    ))
    if not r:
        return
    current_tier = tier_for_rating(r.rating)

    # 1. Demotion shield consume si pierde
    if not won and r.demotion_shield_active:
        # Restituir rating al floor del tier actual
        r.rating = max(r.rating, current_tier.min_rating)
        r.demotion_shield_active = False
        log.info("demotion shield used for player %d", player_id)
        return

    # 2. Si en promotion series, sumar resultado
    if r.promo_series_target_tier:
        r.promo_series_total += 1
        if won:
            r.promo_series_wins += 1
        if r.promo_series_total >= 3:
            if r.promo_series_wins >= 2:
                # Promoted! Activar shield, resetear series
                target = next((t for t in TIERS if t.key == r.promo_series_target_tier), None)
                if target:
                    r.rating = max(r.rating, target.min_rating + 5)
                r.demotion_shield_active = True
            r.promo_series_wins = 0
            r.promo_series_total = 0
            r.promo_series_target_tier = None
        return

    # 3. Si el rating cruzó el threshold superior del tier actual, iniciar promo series
    if won and r.rating >= current_tier.max_rating - 20:
        # Entrando al tier siguiente — iniciar series
        next_idx = TIERS.index(current_tier) + 1
        if next_idx < len(TIERS):
            r.promo_series_target_tier = TIERS[next_idx].key
            r.promo_series_wins = 0
            r.promo_series_total = 0
            log.info("promotion series started for player %d → %s",
                     player_id, r.promo_series_target_tier)


# ═══════════════════════════════════════════════════════════════════════
# TRUST SCORE
# ═══════════════════════════════════════════════════════════════════════


def adjust_trust_score(db: Session, *, player_id: int, game_id: int, delta: float) -> None:
    """Ajusta trust_score con clamping 0.0-1.0."""
    r = db.scalar(select(PlayerRating).where(
        PlayerRating.player_id == player_id, PlayerRating.game_id == game_id
    ))
    if not r:
        return
    new_score = max(0.0, min(1.0, r.trust_score + delta))
    r.trust_score = new_score
    db.flush()


def get_trust_score(db: Session, *, player_id: int, game_id: int | None = None) -> float:
    """Devuelve trust promedio si game_id=None, sino del juego específico."""
    stmt = select(PlayerRating).where(PlayerRating.player_id == player_id)
    if game_id:
        stmt = stmt.where(PlayerRating.game_id == game_id)
    rows = list(db.scalars(stmt))
    if not rows:
        return 1.0
    return sum(r.trust_score for r in rows) / len(rows)


# ═══════════════════════════════════════════════════════════════════════
# ANTI-COLLUSION
# ═══════════════════════════════════════════════════════════════════════


def _check_duel_collusion(db: Session, *, duel: ChallengeDuel) -> None:
    """Detecta patrón sospechoso: >=5 duelos ranked entre el mismo par en 30d
    con desbalance >70/30. Marca collusion_flag para revisión admin."""
    if not duel.is_ranked:
        return
    since = datetime.now(timezone.utc) - timedelta(days=30)
    # Pair-key invariante de orden
    a, b = sorted([duel.challenger_id, duel.challenged_id])
    pair_duels = list(db.scalars(select(ChallengeDuel).where(
        ChallengeDuel.is_ranked.is_(True),
        ChallengeDuel.status == "COMPLETED",
        ChallengeDuel.created_at >= since,
        ((ChallengeDuel.challenger_id == a) & (ChallengeDuel.challenged_id == b))
        | ((ChallengeDuel.challenger_id == b) & (ChallengeDuel.challenged_id == a)),
    )))
    if len(pair_duels) < 5:
        return
    wins_a = sum(1 for d in pair_duels if d.winner_id == a)
    wins_b = sum(1 for d in pair_duels if d.winner_id == b)
    total = wins_a + wins_b
    if total == 0:
        return
    max_ratio = max(wins_a, wins_b) / total
    if max_ratio >= 0.7:
        # Flag los más recientes
        for d in pair_duels[:5]:
            d.collusion_flag = True
        duel.collusion_flag = True
        log.warning("COLLUSION FLAG players %d vs %d (%d/%d skew %.1f%%)",
                    a, b, max(wins_a, wins_b), total, max_ratio * 100)


def list_collusion_flags(db: Session, *, limit: int = 50) -> list[dict]:
    flagged = list(db.scalars(
        select(ChallengeDuel).where(ChallengeDuel.collusion_flag.is_(True))
        .order_by(desc(ChallengeDuel.created_at)).limit(limit)
    ))
    return [{
        "duel_id": d.id, "challenger_id": d.challenger_id, "challenged_id": d.challenged_id,
        "stake_exp": d.stake_exp, "winner_id": d.winner_id,
        "completed_at": d.completed_at.isoformat() if d.completed_at else None,
    } for d in flagged]


# ═══════════════════════════════════════════════════════════════════════
# MATCH QUALITY SCORE — evalúa un pairing 0.0-1.0
# ═══════════════════════════════════════════════════════════════════════


def match_quality_score(db: Session, *, player_a_id: int, player_b_id: int, game_id: int) -> dict:
    """Calcula MQS 0-1 basado en:
      - Rating gap: cerca = mejor
      - Trust both: trust alto = mejor
      - Previous matchups: 0-2 previos = ideal; muchos = repetitivo
    """
    ra = db.scalar(select(PlayerRating).where(
        PlayerRating.player_id == player_a_id, PlayerRating.game_id == game_id
    ))
    rb = db.scalar(select(PlayerRating).where(
        PlayerRating.player_id == player_b_id, PlayerRating.game_id == game_id
    ))
    if not ra or not rb:
        return {"mqs": 0.5, "breakdown": {"rating_gap": 0.5, "trust": 1.0, "freshness": 1.0}}

    gap = abs(ra.rating - rb.rating)
    rating_q = max(0.0, 1.0 - gap / 400.0)  # gap 0 → 1.0, gap 400 → 0
    trust_q = (ra.trust_score + rb.trust_score) / 2

    # Rivalry / previous matches
    from app.models import PlayerRivalry
    low, high = sorted([player_a_id, player_b_id])
    riv = db.scalar(select(PlayerRivalry).where(
        PlayerRivalry.player_low_id == low, PlayerRivalry.player_high_id == high
    ))
    matches = riv.matches_count if riv else 0
    freshness_q = 1.0 if matches <= 2 else max(0.3, 1.0 - (matches - 2) * 0.1)

    mqs = round((rating_q * 0.5 + trust_q * 0.3 + freshness_q * 0.2), 3)
    return {
        "mqs": mqs,
        "breakdown": {
            "rating_gap": round(rating_q, 3),
            "trust": round(trust_q, 3),
            "freshness": round(freshness_q, 3),
        },
        "rating_a": round(ra.rating, 1), "rating_b": round(rb.rating, 1),
        "trust_a": round(ra.trust_score, 3), "trust_b": round(rb.trust_score, 3),
        "previous_matches": matches,
    }
