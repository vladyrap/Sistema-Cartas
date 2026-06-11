"""Competitive endpoints — ladder, duels, sparring, guild wars, drafts,
meta, tier list, heatmap, special events, bounty bracket, sponsors."""
import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, or_, select
from sqlalchemy.exc import IntegrityError

from app.core.deps import AdminDep, DbDep, OptionalUserDep, UserDep
from app.core.rate_limit import limiter
from app.models import (
    BountyBracketState, ChallengeDuel, Event, EventRegistration, EventSpecialMode,
    Game, GuildMembership, GuildWar, GuildWarMatch, PlayerProfile, PlayerRating,
    Sponsor, SponsorAmbassador, SparringQueueEntry, TeamDraft, TeamDraftPick,
)
from app.services import competitive as cs
from app.services import exp as exp_svc

router = APIRouter()


# ═══════════════════════════════════════════════════════════════════════
# LADDER + TIERS
# ═══════════════════════════════════════════════════════════════════════


class TierInfoOut(BaseModel):
    key: str
    label: str
    min_rating: float
    max_rating: float
    color: str
    emoji: str


@router.get("/ladder/tiers", response_model=list[TierInfoOut])
def list_tiers() -> list[TierInfoOut]:
    return [
        TierInfoOut(key=t.key, label=t.label, min_rating=t.min_rating, max_rating=t.max_rating,
                    color=t.color, emoji=t.emoji)
        for t in cs.TIERS
    ]


@router.get("/ladder/{game_id}")
def ladder_for_game(game_id: int, db: DbDep, limit: int = 100) -> dict:
    """Devuelve ladder con divisiones — agrupado por tier."""
    rows = cs.compute_tier_list(db, game_id=game_id, limit=limit)
    grouped: dict[str, list] = {}
    for r in rows:
        grouped.setdefault(r["tier_key"], []).append(r)
    return {
        "game_id": game_id,
        "tiers": [
            {
                "tier": {"key": t.key, "label": t.label, "color": t.color, "emoji": t.emoji,
                         "min_rating": t.min_rating, "max_rating": t.max_rating},
                "players": grouped.get(t.key, []),
            }
            for t in reversed(cs.TIERS)
        ],
        "total": len(rows),
    }


@router.post("/ladder/freeze")
def freeze_my_rating(current: UserDep, db: DbDep, game_id: int = Query(...), days: int = Query(default=7)) -> dict:
    """Congela el decay del rating por N días. Members: hasta 365; resto: 30."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    from app.services import growth as growth_svc
    max_days = 365 if growth_svc.is_member(db, current.profile.id) else 30
    if days < 1 or days > max_days:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"days debe ser 1-{max_days}")
    try:
        r = cs.freeze_decay(db, player_id=current.profile.id, game_id=game_id, days=days)
        return {
            "ok": True,
            "freeze_until": r.freeze_until.isoformat() if r.freeze_until else None,
            "rating": r.rating,
        }
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))


# ═══════════════════════════════════════════════════════════════════════
# CHALLENGE DUELS
# ═══════════════════════════════════════════════════════════════════════


class DuelIn(BaseModel):
    challenged_id: int
    game_id: int
    stake_exp: int = Field(default=0, ge=0, le=5000)
    is_ranked: bool = False
    message: str | None = Field(default=None, max_length=300)


class DuelOut(BaseModel):
    id: int
    challenger_id: int
    challenger_alias: str
    challenged_id: int
    challenged_alias: str
    game_id: int
    status: str
    stake_exp: int
    is_ranked: bool
    message: str | None
    winner_id: int | None
    games_challenger: int
    games_challenged: int
    accepted_at: datetime | None
    completed_at: datetime | None
    created_at: datetime


def _duel_to_out(db, d: ChallengeDuel) -> DuelOut:
    challenger = db.get(PlayerProfile, d.challenger_id)
    challenged = db.get(PlayerProfile, d.challenged_id)
    return DuelOut(
        id=d.id, challenger_id=d.challenger_id, challenged_id=d.challenged_id,
        challenger_alias=challenger.alias if challenger else f"#{d.challenger_id}",
        challenged_alias=challenged.alias if challenged else f"#{d.challenged_id}",
        game_id=d.game_id, status=d.status, stake_exp=d.stake_exp,
        is_ranked=d.is_ranked, message=d.message,
        winner_id=d.winner_id,
        games_challenger=d.games_challenger, games_challenged=d.games_challenged,
        accepted_at=d.accepted_at, completed_at=d.completed_at, created_at=d.created_at,
    )


@router.post("/duels", response_model=DuelOut, status_code=201)
@limiter.limit("20/hour")
def create_duel(request: Request, payload: DuelIn, current: UserDep, db: DbDep) -> DuelOut:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    if payload.challenged_id == current.profile.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No podés desafiarte a vos mismo")
    challenged = db.get(PlayerProfile, payload.challenged_id)
    if not challenged:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jugador no existe")

    # Stake EXP del challenger se descuenta al crear
    if payload.stake_exp > 0:
        season = exp_svc.get_active_season(db)
        if not season:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin temporada activa")
        from app.models import SeasonProgress
        sp = db.scalar(select(SeasonProgress).where(
            SeasonProgress.season_id == season.id,
            SeasonProgress.player_id == current.profile.id,
        ))
        if not sp or sp.exp_total < payload.stake_exp:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "EXP insuficiente")
        exp_svc.award_exp(
            db, player_id=current.profile.id,
            reason_code="duel_stake", amount=-payload.stake_exp,
            reason=f"Stake duelo vs {challenged.alias}",
        )

    d = ChallengeDuel(
        challenger_id=current.profile.id,
        challenged_id=payload.challenged_id,
        game_id=payload.game_id,
        stake_exp=payload.stake_exp,
        is_ranked=payload.is_ranked,
        message=payload.message,
        expires_at=datetime.now(timezone.utc) + timedelta(days=3),
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return _duel_to_out(db, d)


@router.get("/duels/inbox", response_model=list[DuelOut])
def my_duels(current: UserDep, db: DbDep, status_filter: str | None = None) -> list[DuelOut]:
    if not current.profile:
        return []
    stmt = select(ChallengeDuel).where(
        or_(ChallengeDuel.challenger_id == current.profile.id,
            ChallengeDuel.challenged_id == current.profile.id),
    ).order_by(desc(ChallengeDuel.created_at)).limit(50)
    if status_filter:
        stmt = stmt.where(ChallengeDuel.status == status_filter)
    return [_duel_to_out(db, d) for d in db.scalars(stmt)]


@router.post("/duels/{duel_id}/accept", response_model=DuelOut)
def accept_duel(duel_id: int, current: UserDep, db: DbDep) -> DuelOut:
    d = db.get(ChallengeDuel, duel_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Duel no existe")
    if d.challenged_id != current.profile.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No sos el desafiado")
    if d.status != "PENDING":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Estado {d.status} no permite aceptar")
    # Stake del challenged
    if d.stake_exp > 0:
        from app.models import SeasonProgress
        season = exp_svc.get_active_season(db)
        sp = db.scalar(select(SeasonProgress).where(
            SeasonProgress.season_id == season.id,
            SeasonProgress.player_id == current.profile.id,
        )) if season else None
        if not sp or sp.exp_total < d.stake_exp:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "EXP insuficiente para aceptar")
        exp_svc.award_exp(
            db, player_id=current.profile.id,
            reason_code="duel_stake", amount=-d.stake_exp,
            reason=f"Stake aceptar duelo #{duel_id}",
        )
    d.status = "ACCEPTED"
    d.accepted_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(d)
    return _duel_to_out(db, d)


@router.post("/duels/{duel_id}/decline", response_model=DuelOut)
def decline_duel(duel_id: int, current: UserDep, db: DbDep) -> DuelOut:
    d = db.get(ChallengeDuel, duel_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Duel no existe")
    if d.challenged_id != current.profile.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No sos el desafiado")
    if d.status != "PENDING":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Estado {d.status} no permite declinar")
    # Refund challenger
    if d.stake_exp > 0:
        exp_svc.award_exp(
            db, player_id=d.challenger_id,
            reason_code="duel_refund", amount=d.stake_exp,
            reason=f"Duelo #{duel_id} declinado",
        )
    d.status = "DECLINED"
    db.commit()
    db.refresh(d)
    return _duel_to_out(db, d)


class DuelReportIn(BaseModel):
    winner_id: int
    games_challenger: int = Field(ge=0, le=5)
    games_challenged: int = Field(ge=0, le=5)


@router.post("/duels/{duel_id}/report", response_model=dict)
def report_duel(duel_id: int, payload: DuelReportIn, current: UserDep, db: DbDep) -> dict:
    """Dual-confirm: ambos players reportan. Si coinciden → settle. Si difieren → disputed."""
    d = db.get(ChallengeDuel, duel_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Duel no existe")
    if not current.profile or current.profile.id not in (d.challenger_id, d.challenged_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No sos parte del duelo")
    try:
        out = cs.report_duel_dual(
            db, duel=d, reporter_id=current.profile.id,
            winner_id=payload.winner_id,
            games_c=payload.games_challenger, games_d=payload.games_challenged,
        )
        db.commit()
        return out
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))


@router.post("/duels/{duel_id}/resolve")
def admin_resolve_duel(duel_id: int, admin: AdminDep, db: DbDep, winner_id: int = Query(...)) -> dict:
    """Admin resuelve un duelo en disputa forzando un winner."""
    d = db.get(ChallengeDuel, duel_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Duel no existe")
    try:
        cs.admin_resolve_dispute(db, duel=d, winner_id=winner_id)
        db.commit()
        return {"ok": True, "winner_id": winner_id}
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))


@router.get("/duels/admin/collusion-flags")
def admin_collusion_flags(admin: AdminDep, db: DbDep) -> list[dict]:
    """Lista duelos con flag de collusion para revisión."""
    return cs.list_collusion_flags(db)


@router.get("/duels/admin/disputed")
def admin_disputed_duels(admin: AdminDep, db: DbDep, limit: int = 50) -> list[dict]:
    """Duelos con reportes incompatibles esperando resolución admin."""
    rows = list(db.scalars(
        select(ChallengeDuel).where(ChallengeDuel.is_disputed.is_(True))
        .order_by(desc(ChallengeDuel.created_at)).limit(limit)
    ))
    out = []
    for d in rows:
        challenger = db.get(PlayerProfile, d.challenger_id)
        challenged = db.get(PlayerProfile, d.challenged_id)

        def _alias(pid: int | None) -> str | None:
            if pid is None:
                return None
            if challenger and pid == challenger.id:
                return challenger.alias
            if challenged and pid == challenged.id:
                return challenged.alias
            p = db.get(PlayerProfile, pid)
            return p.alias if p else f"#{pid}"

        out.append({
            "duel_id": d.id,
            "challenger_id": d.challenger_id,
            "challenger_alias": challenger.alias if challenger else f"#{d.challenger_id}",
            "challenged_id": d.challenged_id,
            "challenged_alias": challenged.alias if challenged else f"#{d.challenged_id}",
            "stake_exp": d.stake_exp,
            "is_ranked": d.is_ranked,
            "challenger_reported_winner_id": d.challenger_reported_winner_id,
            "challenger_reported_winner_alias": _alias(d.challenger_reported_winner_id),
            "challenged_reported_winner_id": d.challenged_reported_winner_id,
            "challenged_reported_winner_alias": _alias(d.challenged_reported_winner_id),
            "games_challenger": d.games_challenger,
            "games_challenged": d.games_challenged,
            "created_at": d.created_at.isoformat(),
        })
    return out


@router.get("/players/{player_id}/trust")
def player_trust(player_id: int, db: DbDep, game_id: int | None = None) -> dict:
    """Trust score del jugador. Promedio si no se filtra por juego."""
    score = cs.get_trust_score(db, player_id=player_id, game_id=game_id)
    return {"player_id": player_id, "game_id": game_id, "trust_score": round(score, 3)}


@router.get("/match-quality")
def match_quality(db: DbDep, player_a_id: int = Query(...), player_b_id: int = Query(...),
                  game_id: int = Query(...)) -> dict:
    """Evalúa la calidad de un emparejamiento prospectivo."""
    return cs.match_quality_score(db, player_a_id=player_a_id, player_b_id=player_b_id, game_id=game_id)


@router.get("/players/{player_id}/promotion-status")
def promotion_status(player_id: int, db: DbDep, game_id: int = Query(...)) -> dict:
    """Estado de promotion series + demotion shield del jugador en ese juego."""
    from app.models import PlayerRating
    r = db.scalar(select(PlayerRating).where(
        PlayerRating.player_id == player_id, PlayerRating.game_id == game_id
    ))
    if not r:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sin rating en ese juego")
    return {
        "in_promotion_series": r.promo_series_target_tier is not None,
        "target_tier": r.promo_series_target_tier,
        "wins": r.promo_series_wins, "total": r.promo_series_total,
        "needed_wins": 2,
        "demotion_shield_active": r.demotion_shield_active,
        "rating": round(r.rating, 1),
        "trust_score": round(r.trust_score, 3),
    }


# ═══════════════════════════════════════════════════════════════════════
# SPARRING QUEUE
# ═══════════════════════════════════════════════════════════════════════


class SparringJoinIn(BaseModel):
    game_id: int
    archetype: str | None = None
    deck_id: int | None = None
    notes: str | None = Field(default=None, max_length=200)
    rating_min: float | None = None
    rating_max: float | None = None


@router.post("/sparring/join", status_code=201)
def join_sparring(payload: SparringJoinIn, current: UserDep, db: DbDep) -> dict:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    # Reemplaza si ya está
    existing = db.scalar(select(SparringQueueEntry).where(
        SparringQueueEntry.player_id == current.profile.id,
        SparringQueueEntry.game_id == payload.game_id,
    ))
    if existing:
        if existing.matched_at:
            # Limpiar para volver a entrar
            db.delete(existing)
            db.flush()
        else:
            existing.archetype = payload.archetype
            existing.deck_id = payload.deck_id
            existing.notes = payload.notes
            existing.rating_min = payload.rating_min
            existing.rating_max = payload.rating_max
            db.commit()
            return {"ok": True, "id": existing.id, "status": "updated"}
    entry = SparringQueueEntry(
        player_id=current.profile.id, game_id=payload.game_id,
        archetype=payload.archetype, deck_id=payload.deck_id,
        notes=payload.notes, rating_min=payload.rating_min, rating_max=payload.rating_max,
    )
    db.add(entry)
    db.commit()
    return {"ok": True, "id": entry.id, "status": "joined"}


@router.delete("/sparring/leave/{entry_id}", status_code=204)
def leave_sparring(entry_id: int, current: UserDep, db: DbDep):
    e = db.get(SparringQueueEntry, entry_id)
    if not e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No estás en cola")
    if e.player_id != current.profile.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No es tu entrada")
    db.delete(e)
    db.commit()


@router.get("/sparring/queue")
def view_queue(db: DbDep, current: OptionalUserDep, game_id: int | None = None) -> dict:
    """Muestra cola pendiente + tu match si existe."""
    stmt = select(SparringQueueEntry).where(SparringQueueEntry.matched_at.is_(None))
    if game_id:
        stmt = stmt.where(SparringQueueEntry.game_id == game_id)
    waiting = list(db.scalars(stmt.order_by(SparringQueueEntry.created_at).limit(50)))

    def serialize(e: SparringQueueEntry) -> dict:
        p = db.get(PlayerProfile, e.player_id)
        return {
            "id": e.id,
            "player_id": e.player_id,
            "alias": p.alias if p else f"#{e.player_id}",
            "game_id": e.game_id,
            "archetype": e.archetype,
            "notes": e.notes,
            "joined_at": e.created_at.isoformat(),
        }

    my_match = None
    if current and current.profile:
        my_entry = db.scalar(select(SparringQueueEntry).where(
            SparringQueueEntry.player_id == current.profile.id,
            SparringQueueEntry.matched_at.is_not(None),
        ).order_by(desc(SparringQueueEntry.created_at)))
        if my_entry and my_entry.matched_with_id:
            partner = db.get(PlayerProfile, my_entry.matched_with_id)
            my_match = {
                "partner_id": my_entry.matched_with_id,
                "partner_alias": partner.alias if partner else None,
                "matched_at": my_entry.matched_at.isoformat(),
            }

    return {"waiting": [serialize(e) for e in waiting], "my_match": my_match, "total_waiting": len(waiting)}


# ═══════════════════════════════════════════════════════════════════════
# GUILD WARS
# ═══════════════════════════════════════════════════════════════════════


class GuildWarIn(BaseModel):
    guild_b_id: int
    game_id: int | None = None
    starts_at: datetime
    ends_at: datetime


@router.post("/guild-wars", status_code=201)
def propose_war(payload: GuildWarIn, current: UserDep, db: DbDep) -> dict:
    """Un guild admin propone war contra otro guild."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    # Buscar gremio del usuario (es GUILD_ADMIN)
    my_member = db.scalar(select(GuildMembership).where(
        GuildMembership.user_id == current.id,
        GuildMembership.role == "GUILD_ADMIN",
    ))
    if not my_member:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo guild admins")
    if my_member.guild_id == payload.guild_b_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No podés declararte war contra vos mismo")
    if payload.ends_at <= payload.starts_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "ends_at debe ser posterior")

    war = GuildWar(
        guild_a_id=my_member.guild_id, guild_b_id=payload.guild_b_id,
        game_id=payload.game_id, starts_at=payload.starts_at, ends_at=payload.ends_at,
        status="PROPOSED",
    )
    db.add(war)
    db.commit()
    db.refresh(war)
    return {"ok": True, "war_id": war.id, "status": "PROPOSED"}


@router.post("/guild-wars/{war_id}/accept")
def accept_war(war_id: int, current: UserDep, db: DbDep) -> dict:
    war = db.get(GuildWar, war_id)
    if not war:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "War no existe")
    # Verificar que el user es admin del guild B
    my_member = db.scalar(select(GuildMembership).where(
        GuildMembership.user_id == current.id,
        GuildMembership.guild_id == war.guild_b_id,
        GuildMembership.role == "GUILD_ADMIN",
    ))
    if not my_member:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo admin del guild desafiado puede aceptar")
    if war.status != "PROPOSED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "War no proposed")
    war.status = "ACTIVE"
    db.commit()
    return {"ok": True, "war_id": war_id, "status": "ACTIVE"}


@router.get("/guild-wars/active")
def list_active_wars(db: DbDep) -> list[dict]:
    rows = list(db.scalars(select(GuildWar).where(GuildWar.status == "ACTIVE").order_by(GuildWar.starts_at)))
    out = []
    from app.models import Guild
    for w in rows:
        ga = db.get(Guild, w.guild_a_id)
        gb = db.get(Guild, w.guild_b_id)
        out.append({
            "id": w.id, "guild_a_id": w.guild_a_id, "guild_a_name": ga.name if ga else None,
            "guild_b_id": w.guild_b_id, "guild_b_name": gb.name if gb else None,
            "starts_at": w.starts_at.isoformat(), "ends_at": w.ends_at.isoformat(),
            "score_a": w.score_a, "score_b": w.score_b,
        })
    return out


class WarMatchIn(BaseModel):
    player_a_id: int
    player_b_id: int
    winner_id: int | None = None
    is_draw: bool = False


@router.post("/guild-wars/{war_id}/match", status_code=201)
def report_war_match(war_id: int, payload: WarMatchIn, current: UserDep, db: DbDep) -> dict:
    war = db.get(GuildWar, war_id)
    if not war:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "War no existe")
    if war.status != "ACTIVE":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "War no activa")
    m = GuildWarMatch(
        war_id=war_id, player_a_id=payload.player_a_id, player_b_id=payload.player_b_id,
        winner_id=payload.winner_id if not payload.is_draw else None,
        is_draw=payload.is_draw, reported_at=datetime.now(timezone.utc),
    )
    db.add(m)
    # Update score: necesitamos saber a qué guild pertenecen a/b
    pa_member = db.scalar(select(GuildMembership).where(
        GuildMembership.user_id == None, GuildMembership.guild_id.in_([war.guild_a_id, war.guild_b_id]),
    ))
    # Simplificación: el caller pasa player_a del guild_a y player_b del guild_b
    if payload.is_draw:
        # nada
        pass
    elif payload.winner_id == payload.player_a_id:
        war.score_a += 1
    elif payload.winner_id == payload.player_b_id:
        war.score_b += 1
    db.commit()
    return {"ok": True, "score_a": war.score_a, "score_b": war.score_b}


# ═══════════════════════════════════════════════════════════════════════
# TEAM DRAFTS — pick/ban snake para armar 2 equipos
# ═══════════════════════════════════════════════════════════════════════


def _snake_team_for_pick(i: int) -> str:
    """Snake draft 2 equipos: A B B A A B B A… (i 0-based)."""
    return "A" if ((i + 1) // 2) % 2 == 0 else "B"


def _draft_to_out(db, d: TeamDraft) -> dict:
    picks = list(db.scalars(select(TeamDraftPick).where(
        TeamDraftPick.draft_id == d.id
    ).order_by(TeamDraftPick.pick_order)))

    def _alias(pid):
        p = db.get(PlayerProfile, pid)
        return p.alias if p else f"#{pid}"

    picks_out = [{
        "pick_order": p.pick_order, "team": p.team_letter,
        "player_id": p.picked_player_id, "alias": _alias(p.picked_player_id),
    } for p in picks]
    total_picks_needed = (d.team_size - 1) * 2  # capitanes ya cuentan en su equipo
    return {
        "id": d.id, "title": d.title, "status": d.status,
        "event_id": d.event_id, "team_size": d.team_size,
        "captain_a_id": d.captain_a_id, "captain_a_alias": _alias(d.captain_a_id),
        "captain_b_id": d.captain_b_id, "captain_b_alias": _alias(d.captain_b_id),
        "current_pick_captain_id": d.current_pick_captain_id,
        "picks": picks_out,
        "picks_made": len(picks), "picks_needed": total_picks_needed,
        "team_a": [{"player_id": d.captain_a_id, "alias": _alias(d.captain_a_id), "is_captain": True}]
                  + [p for p in picks_out if p["team"] == "A"],
        "team_b": [{"player_id": d.captain_b_id, "alias": _alias(d.captain_b_id), "is_captain": True}]
                  + [p for p in picks_out if p["team"] == "B"],
        "created_at": d.created_at.isoformat(),
    }


class DraftCreateIn(BaseModel):
    title: str = Field(min_length=3, max_length=120)
    captain_a_id: int
    captain_b_id: int
    team_size: int = Field(default=4, ge=2, le=8)
    event_id: int | None = None


@router.post("/drafts", status_code=201)
def create_draft(payload: DraftCreateIn, current: UserDep, db: DbDep) -> dict:
    if payload.captain_a_id == payload.captain_b_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Capitanes deben ser distintos")
    for cid in (payload.captain_a_id, payload.captain_b_id):
        if not db.get(PlayerProfile, cid):
            raise HTTPException(status.HTTP_404_NOT_FOUND, f"Player {cid} no existe")
    d = TeamDraft(
        title=payload.title, event_id=payload.event_id,
        captain_a_id=payload.captain_a_id, captain_b_id=payload.captain_b_id,
        team_size=payload.team_size,
        current_pick_captain_id=payload.captain_a_id,
        status="OPEN",
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return _draft_to_out(db, d)


@router.get("/drafts")
def list_drafts(db: DbDep, limit: int = 20) -> list[dict]:
    rows = list(db.scalars(select(TeamDraft).where(
        TeamDraft.status != "CANCELLED"
    ).order_by(desc(TeamDraft.created_at)).limit(limit)))
    return [_draft_to_out(db, d) for d in rows]


@router.get("/drafts/{draft_id}")
def get_draft(draft_id: int, db: DbDep) -> dict:
    d = db.get(TeamDraft, draft_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Draft no existe")
    return _draft_to_out(db, d)


@router.post("/drafts/{draft_id}/start")
def start_draft(draft_id: int, current: UserDep, db: DbDep) -> dict:
    d = db.get(TeamDraft, draft_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Draft no existe")
    if d.status != "OPEN":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Estado {d.status} no permite iniciar")
    if not current.profile or current.profile.id not in (d.captain_a_id, d.captain_b_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo un capitán puede iniciar")
    d.status = "PICKING"
    d.current_pick_captain_id = d.captain_a_id
    db.commit()
    return _draft_to_out(db, d)


class DraftPickIn(BaseModel):
    player_id: int


@router.post("/drafts/{draft_id}/pick")
def make_pick(draft_id: int, payload: DraftPickIn, current: UserDep, db: DbDep) -> dict:
    d = db.get(TeamDraft, draft_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Draft no existe")
    if d.status != "PICKING":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Draft en estado {d.status}")
    if not current.profile or current.profile.id != d.current_pick_captain_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No es tu turno de pick")
    if payload.player_id in (d.captain_a_id, d.captain_b_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Los capitanes ya están en sus equipos")
    if not db.get(PlayerProfile, payload.player_id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Player no existe")
    already = db.scalar(select(TeamDraftPick).where(
        TeamDraftPick.draft_id == draft_id,
        TeamDraftPick.picked_player_id == payload.player_id,
    ))
    if already:
        raise HTTPException(status.HTTP_409_CONFLICT, "Player ya fue pickeado")

    picks_made = db.scalar(select(func.count(TeamDraftPick.id)).where(
        TeamDraftPick.draft_id == draft_id
    )) or 0
    team = _snake_team_for_pick(picks_made)
    db.add(TeamDraftPick(
        draft_id=draft_id, pick_order=picks_made + 1,
        team_letter=team, picked_player_id=payload.player_id,
    ))
    db.flush()

    total_needed = (d.team_size - 1) * 2
    if picks_made + 1 >= total_needed:
        d.status = "LOCKED"
        d.locked_at = datetime.now(timezone.utc)
        d.current_pick_captain_id = None
    else:
        next_team = _snake_team_for_pick(picks_made + 1)
        d.current_pick_captain_id = d.captain_a_id if next_team == "A" else d.captain_b_id
    db.commit()
    return _draft_to_out(db, d)


@router.post("/drafts/{draft_id}/cancel", status_code=204)
def cancel_draft(draft_id: int, current: UserDep, db: DbDep):
    d = db.get(TeamDraft, draft_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Draft no existe")
    if not current.profile or current.profile.id not in (d.captain_a_id, d.captain_b_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo un capitán puede cancelar")
    if d.status == "LOCKED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Draft ya locked")
    d.status = "CANCELLED"
    db.commit()


# ═══════════════════════════════════════════════════════════════════════
# META TRACKER + TIER LIST + HEATMAP
# ═══════════════════════════════════════════════════════════════════════


@router.get("/meta/snapshot")
def meta_snapshot(db: DbDep, game_id: int | None = None, days: int = 30) -> dict:
    return cs.compute_meta_snapshot(db, game_id=game_id, days=days)


@router.get("/tier-list")
def tier_list(db: DbDep, game_id: int | None = None, limit: int = 100) -> list[dict]:
    return cs.compute_tier_list(db, game_id=game_id, limit=limit)


@router.get("/heatmap/{player_id}")
def player_heatmap(player_id: int, db: DbDep) -> dict:
    return cs.compute_player_heatmap(db, player_id=player_id)


# ═══════════════════════════════════════════════════════════════════════
# SPECIAL EVENT MODES
# ═══════════════════════════════════════════════════════════════════════


class SpecialModeIn(BaseModel):
    mode: str  # GAUNTLET, QUALIFIER, LAST_MAN_STANDING, BOUNTY_BRACKET
    config: dict | None = None


@router.post("/events/{event_id}/special-mode")
def set_special_mode(event_id: int, payload: SpecialModeIn, admin: AdminDep, db: DbDep) -> dict:
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no existe")
    if payload.mode not in ("GAUNTLET", "QUALIFIER", "LAST_MAN_STANDING", "BOUNTY_BRACKET"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mode inválido")
    existing = db.scalar(select(EventSpecialMode).where(EventSpecialMode.event_id == event_id))
    config_json = json.dumps(payload.config or {})
    if existing:
        existing.mode = payload.mode
        existing.config_json = config_json
    else:
        db.add(EventSpecialMode(event_id=event_id, mode=payload.mode, config_json=config_json))
    db.commit()
    return {"ok": True, "event_id": event_id, "mode": payload.mode}


@router.get("/events/{event_id}/special-mode")
def get_special_mode(event_id: int, db: DbDep) -> dict | None:
    sm = db.scalar(select(EventSpecialMode).where(EventSpecialMode.event_id == event_id))
    if not sm:
        return None
    return {"event_id": event_id, "mode": sm.mode, "config": json.loads(sm.config_json or "{}")}


@router.delete("/events/{event_id}/special-mode", status_code=204)
def unset_special_mode(event_id: int, admin: AdminDep, db: DbDep):
    sm = db.scalar(select(EventSpecialMode).where(EventSpecialMode.event_id == event_id))
    if sm:
        db.delete(sm)
        db.commit()


# ═══════════════════════════════════════════════════════════════════════
# SPONSOR SYSTEM
# ═══════════════════════════════════════════════════════════════════════


class SponsorIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    logo_url: str | None = None
    website_url: str | None = None
    description: str | None = None


@router.post("/sponsors", status_code=201)
def create_sponsor(payload: SponsorIn, admin: AdminDep, db: DbDep) -> dict:
    s = Sponsor(
        name=payload.name, logo_url=payload.logo_url, website_url=payload.website_url,
        description=payload.description, owner_user_id=admin.id,
    )
    db.add(s)
    try:
        db.commit()
        db.refresh(s)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un sponsor con ese nombre")
    return {"ok": True, "id": s.id, "name": s.name}


@router.get("/sponsors")
def list_sponsors(db: DbDep) -> list[dict]:
    rows = list(db.scalars(select(Sponsor).where(Sponsor.is_active.is_(True)).order_by(Sponsor.name)))
    return [
        {"id": s.id, "name": s.name, "logo_url": s.logo_url, "website_url": s.website_url,
         "description": s.description, "total_paid_exp": s.total_paid_exp}
        for s in rows
    ]


class AmbassadorIn(BaseModel):
    sponsor_id: int
    player_id: int
    bonus_exp_per_top8: int = 100
    bonus_exp_per_champion: int = 500


@router.post("/sponsors/ambassadors", status_code=201)
def appoint_ambassador(payload: AmbassadorIn, admin: AdminDep, db: DbDep) -> dict:
    from app.models import Season
    season = db.scalar(select(Season).where(Season.status == "ACTIVE"))
    amb = SponsorAmbassador(
        sponsor_id=payload.sponsor_id, player_id=payload.player_id,
        season_id=season.id if season else None,
        bonus_exp_per_top8=payload.bonus_exp_per_top8,
        bonus_exp_per_champion=payload.bonus_exp_per_champion,
    )
    db.add(amb)
    try:
        db.commit()
        db.refresh(amb)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe ese embajador este season")
    return {"ok": True, "id": amb.id}


@router.get("/players/{player_id}/sponsors")
def player_sponsors(player_id: int, db: DbDep) -> list[dict]:
    rows = list(db.scalars(select(SponsorAmbassador).where(
        SponsorAmbassador.player_id == player_id, SponsorAmbassador.is_active.is_(True),
    )))
    out = []
    for amb in rows:
        s = db.get(Sponsor, amb.sponsor_id)
        if s:
            out.append({
                "sponsor_id": s.id, "sponsor_name": s.name, "logo_url": s.logo_url,
                "bonus_top8": amb.bonus_exp_per_top8, "bonus_champion": amb.bonus_exp_per_champion,
            })
    return out


# ═══════════════════════════════════════════════════════════════════════
# BOUNTY BRACKET (lectura — la activación es via special-mode)
# ═══════════════════════════════════════════════════════════════════════


@router.get("/events/{event_id}/bounties")
def event_bounties(event_id: int, db: DbDep) -> list[dict]:
    rows = list(db.scalars(select(BountyBracketState).where(
        BountyBracketState.event_id == event_id
    ).order_by(desc(BountyBracketState.accumulated_exp))))
    out = []
    for b in rows:
        p = db.get(PlayerProfile, b.player_id)
        out.append({
            "player_id": b.player_id,
            "alias": p.alias if p else f"#{b.player_id}",
            "own_bounty": b.own_bounty_exp,
            "accumulated": b.accumulated_exp,
        })
    return out


@router.post("/events/{event_id}/bounties/set")
def set_bounty(event_id: int, admin: AdminDep, db: DbDep, player_id: int, bounty_exp: int) -> dict:
    """Admin pone bounty inicial sobre un jugador (típicamente top-seeded)."""
    if bounty_exp < 0 or bounty_exp > 10000:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "bounty_exp out of range")
    state = db.scalar(select(BountyBracketState).where(
        BountyBracketState.event_id == event_id,
        BountyBracketState.player_id == player_id,
    ))
    if not state:
        state = BountyBracketState(event_id=event_id, player_id=player_id)
        db.add(state)
    state.own_bounty_exp = bounty_exp
    db.commit()
    return {"ok": True, "player_id": player_id, "bounty_exp": bounty_exp}
