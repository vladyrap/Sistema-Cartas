"""Growth services: créditos, membresía, némesis, resumen semanal, recordatorios.

Funciones llamadas desde el router growth, hooks de torneo y scheduler.
"""
from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import desc, func, or_, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import (
    Event, EventRegistration, EventStatus, MatchResult, Membership,
    PlayerProfile, PlayerRating, Season, SeasonNemesis, StoreCredit,
)

log = logging.getLogger("growth")


# ═══════════════════════════ STORE CREDITS ═══════════════════════════


def credit_balance(db: Session, player_id: int) -> int:
    return int(db.scalar(
        select(func.coalesce(func.sum(StoreCredit.amount_clp), 0))
        .where(StoreCredit.player_id == player_id)
    ) or 0)


def grant_credit(db: Session, *, player_id: int, amount_clp: int, reason: str,
                 kind: str = "admin_adjust", event_id: int | None = None,
                 by_user_id: int | None = None, notify: bool = True) -> StoreCredit:
    row = StoreCredit(
        player_id=player_id, amount_clp=amount_clp, reason=reason,
        kind=kind, related_event_id=event_id, created_by_user_id=by_user_id,
    )
    db.add(row)
    db.flush()
    if notify and amount_clp > 0:
        try:
            from app.services import notifications as notif_svc
            notif_svc.notify(
                db, player_id=player_id, type="store_credit",
                title=f"💳 +${amount_clp:,} en crédito de tienda".replace(",", "."),
                body=reason, link="/membership",
            )
        except Exception:
            log.exception("credit notify failed")
    return row


def distribute_event_prizes(db: Session, *, event_id: int, percent_pool: int,
                            splits: list[int], by_user_id: int | None = None) -> dict:
    """Reparte % de lo recaudado como crédito de tienda al top N.

    splits = [50, 30, 20] → el pool se divide 50/30/20 entre top 1/2/3.
    Idempotencia: si ya hay créditos kind=prize para el evento, rechaza.
    """
    ev = db.get(Event, event_id)
    if not ev:
        raise ValueError("Evento no encontrado")
    if sum(splits) > 100 or not splits:
        raise ValueError("splits inválidos (suma > 100 o vacío)")
    already = db.scalar(select(StoreCredit).where(
        StoreCredit.related_event_id == event_id, StoreCredit.kind == "prize",
    ))
    if already:
        raise ValueError("Este evento ya repartió premios en crédito")

    from app.models.base import PaymentStatus
    paid_count = db.scalar(select(func.count(EventRegistration.id)).where(
        EventRegistration.event_id == event_id,
        EventRegistration.payment_status == PaymentStatus.PAID,
    )) or 0
    collected = paid_count * int(ev.price_clp)
    pool = collected * percent_pool // 100
    if pool <= 0:
        raise ValueError("Pool en cero — no hay recaudación o percent=0")

    top = list(db.scalars(select(EventRegistration).where(
        EventRegistration.event_id == event_id,
        EventRegistration.final_position.is_not(None),
        EventRegistration.final_position <= len(splits),
    ).order_by(EventRegistration.final_position)))
    if not top:
        raise ValueError("Evento sin posiciones finales — finalizá primero")

    paid_out = []
    for reg in top:
        share = splits[reg.final_position - 1]
        amount = pool * share // 100
        if amount <= 0:
            continue
        grant_credit(
            db, player_id=reg.player_id, amount_clp=amount,
            reason=f"Premio #{reg.final_position} — {ev.name}",
            kind="prize", event_id=event_id, by_user_id=by_user_id,
        )
        p = db.get(PlayerProfile, reg.player_id)
        paid_out.append({"position": reg.final_position,
                         "alias": p.alias if p else f"#{reg.player_id}",
                         "amount_clp": amount})
    return {"collected_clp": collected, "pool_clp": pool, "paid": paid_out}


# ═══════════════════════════ MEMBERSHIP ═══════════════════════════


def is_member(db: Session, player_id: int) -> bool:
    m = db.scalar(select(Membership).where(Membership.player_id == player_id))
    if not m:
        return False
    paid_until = m.paid_until if m.paid_until.tzinfo else m.paid_until.replace(tzinfo=timezone.utc)
    return paid_until > datetime.now(timezone.utc)


def extend_membership(db: Session, *, player_id: int, days: int = 30,
                      source: str = "mp", mp_payment_id: str | None = None) -> Membership:
    """Extiende (o crea) la membresía. Base = max(now, paid_until actual)."""
    now = datetime.now(timezone.utc)
    m = db.scalar(select(Membership).where(Membership.player_id == player_id))
    if m:
        base = m.paid_until if m.paid_until.tzinfo else m.paid_until.replace(tzinfo=timezone.utc)
        base = max(base, now)
        m.paid_until = base + timedelta(days=days)
        m.total_payments += 1
        m.source = source
        if mp_payment_id:
            m.mp_last_payment_id = mp_payment_id
    else:
        m = Membership(
            player_id=player_id, paid_until=now + timedelta(days=days),
            source=source, mp_last_payment_id=mp_payment_id, total_payments=1,
        )
        db.add(m)
    db.flush()
    try:
        from app.services import notifications as notif_svc
        notif_svc.notify(
            db, player_id=player_id, type="membership",
            title="⭐ Membresía Elite activa",
            body=f"Tu membresía está vigente hasta {m.paid_until.strftime('%d/%m/%Y')}. "
                 f"Descuento en entradas, prioridad en listas de espera y freeze ilimitado.",
            link="/membership",
        )
    except Exception:
        log.exception("membership notify failed")
    return m


# ═══════════════════════════ NÉMESIS ═══════════════════════════


def assign_nemeses_for_season(db: Session, *, season_id: int) -> int:
    """Empareja jugadores activos por proximidad de rating (greedy) y crea
    pares dirigidos A↔B. Jugadores sin rating quedan fuera. Idempotente:
    no re-asigna a quien ya tiene némesis esta temporada."""
    already = set(db.scalars(select(SeasonNemesis.player_id).where(
        SeasonNemesis.season_id == season_id
    )))
    # Candidatos: con actividad en los últimos 90 días, ordenados por rating
    since = datetime.now(timezone.utc) - timedelta(days=90)
    ratings = list(db.scalars(
        select(PlayerRating).where(
            PlayerRating.last_match_at.is_not(None),
            PlayerRating.last_match_at >= since,
        ).order_by(desc(PlayerRating.rating))
    ))
    # Un jugador puede tener varias ratings (por juego) — dedup por mejor rating
    seen: set[int] = set()
    candidates: list[PlayerRating] = []
    for r in ratings:
        if r.player_id in seen or r.player_id in already:
            continue
        seen.add(r.player_id)
        candidates.append(r)

    pairs = 0
    i = 0
    while i + 1 < len(candidates):
        a, b = candidates[i], candidates[i + 1]
        db.add(SeasonNemesis(season_id=season_id, player_id=a.player_id,
                             nemesis_player_id=b.player_id))
        db.add(SeasonNemesis(season_id=season_id, player_id=b.player_id,
                             nemesis_player_id=a.player_id))
        for pid in (a.player_id, b.player_id):
            try:
                from app.services import notifications as notif_svc
                rival = b if pid == a.player_id else a
                rp = db.get(PlayerProfile, rival.player_id)
                notif_svc.notify(
                    db, player_id=pid, type="nemesis",
                    title="⚔️ Tenés un archienemigo esta temporada",
                    body=f"{rp.alias if rp else 'Un rival'} es tu némesis. "
                         "EXP doble cada vez que lo enfrentes.",
                    link="/competitive",
                )
            except Exception:
                log.exception("nemesis notify failed")
        pairs += 1
        i += 2
    db.flush()
    log.info("nemeses assigned season=%d pairs=%d", season_id, pairs)
    return pairs


def nemesis_of(db: Session, *, player_id: int) -> SeasonNemesis | None:
    season = db.scalar(select(Season).where(Season.status == "ACTIVE"))
    if not season:
        return None
    return db.scalar(select(SeasonNemesis).where(
        SeasonNemesis.season_id == season.id,
        SeasonNemesis.player_id == player_id,
    ))


def record_nemesis_match(db: Session, *, match: MatchResult) -> bool:
    """Hook en report_match: si los jugadores son némesis mutuos, actualiza
    H2H y otorga bonus EXP (equivalente a round_won → efecto x2) al ganador.
    Devuelve True si era un nemesis match."""
    if match.is_bye or not match.player_b_id:
        return False
    a, b = match.player_a_id, match.player_b_id
    na = nemesis_of(db, player_id=a)
    if not na or na.nemesis_player_id != b:
        return False
    nb = nemesis_of(db, player_id=b)

    if match.is_draw:
        na.draws += 1
        if nb:
            nb.draws += 1
    elif match.winner_id == a:
        na.my_wins += 1
        if nb:
            nb.their_wins += 1
    elif match.winner_id == b:
        na.their_wins += 1
        if nb:
            nb.my_wins += 1

    if match.winner_id and not match.is_draw:
        try:
            from app.services import exp as exp_svc
            exp_svc.award_exp(
                db, player_id=match.winner_id, reason_code="nemesis_bonus",
                amount=exp_svc.EXP_RULES.get("round_won", 50),
                reason="Victoria contra tu archienemigo ⚔️",
                related_event_id=match.event_id,
            )
        except Exception:
            log.exception("nemesis bonus failed")
    db.flush()
    return True


# ═══════════════════════════ RESUMEN SEMANAL ═══════════════════════════


def send_weekly_summaries(db: Session, *, limit: int = 200) -> int:
    """Lunes: resumen personalizado para jugadores activos (match en 30d).
    Notificación in-app con texto de Fable (o template en mock)."""
    import bisect

    since = datetime.now(timezone.utc) - timedelta(days=30)
    active = list(db.scalars(
        select(PlayerRating).where(PlayerRating.last_match_at >= since)
        .order_by(desc(PlayerRating.last_match_at)).limit(limit)
    ))
    seen: set[int] = set()
    sent = 0
    upcoming = db.scalar(select(func.count(Event.id)).where(
        Event.status == EventStatus.OPEN,
        Event.starts_at > datetime.now(timezone.utc),
        Event.starts_at < datetime.now(timezone.utc) + timedelta(days=7),
    )) or 0

    # Prefetch: ratings ordenados por juego (rival más cercano via bisect en
    # memoria — 1 query total en vez de un scan ordenado por jugador) + aliases.
    all_ratings = db.execute(
        select(PlayerRating.game_id, PlayerRating.rating, PlayerRating.player_id)
        .order_by(PlayerRating.game_id, PlayerRating.rating)
    ).all()
    by_game: dict[int, list[tuple[float, int]]] = {}
    for gid, rating, pid in all_ratings:
        by_game.setdefault(gid, []).append((rating, pid))
    alias_by_id: dict[int, str] = dict(db.execute(
        select(PlayerProfile.id, PlayerProfile.alias)
    ).all())

    def _closest_rival(game_id: int, rating: float, player_id: int) -> tuple[str, float] | None:
        ladder = by_game.get(game_id, [])
        keys = [x[0] for x in ladder]
        i = bisect.bisect_left(keys, rating)
        best = None
        for j in range(max(0, i - 2), min(len(ladder), i + 3)):
            rv, pid = ladder[j]
            if pid == player_id:
                continue
            gap = abs(rv - rating)
            if best is None or gap < best[1]:
                best = (alias_by_id.get(pid), gap)
        return best if best and best[0] else None

    for r in active:
        if r.player_id in seen:
            continue
        seen.add(r.player_id)
        rival = _closest_rival(r.game_id, r.rating, r.player_id)

        body = f"Rating {round(r.rating)}"
        if rival:
            rival_alias, gap = rival
            body += f" · {rival_alias} está a {round(gap)} puntos de vos"
        if upcoming:
            body += f" · {upcoming} evento(s) esta semana"
        # Toque Fable si hay API key
        try:
            from app.services import ai_chat
            line = ai_chat.complete(
                f"Jugador TCG con rating {round(r.rating)}. Rival cercano: {rival[0] if rival else 'ninguno'}. "
                f"{upcoming} eventos esta semana. Escribí UNA línea motivadora corta en español de Chile.",
                system="Sos un coach de TCG. Una sola línea, sin emojis, máx 100 caracteres.",
                max_tokens=60, creative=True,
            )
            if line and not line.startswith("[MOCK]") and not line.startswith("[Error"):
                body += f"\n«{line.strip()[:120]}»"
        except Exception:
            pass

        try:
            from app.services import notifications as notif_svc
            notif_svc.notify(
                db, player_id=r.player_id, type="weekly_summary",
                title="📬 Tu Semana Elite", body=body, link="/competitive",
            )
            sent += 1
        except Exception:
            log.exception("weekly summary notify failed")
    log.info("weekly summaries sent=%d", sent)
    return sent


# ═══════════════════════════ RECORDATORIO RIVALIDAD ═══════════════════════════


def send_rivalry_event_reminders(db: Session) -> int:
    """Diario: si mañana hay un evento donde estás inscrito Y tu rival
    histórico (3+ matches) o tu némesis también — te avisamos."""
    from app.models import PlayerRivalry
    now = datetime.now(timezone.utc)
    tomorrow_start = now + timedelta(hours=12)
    tomorrow_end = now + timedelta(hours=36)
    events = list(db.scalars(select(Event).where(
        Event.starts_at > tomorrow_start, Event.starts_at < tomorrow_end,
        Event.status == EventStatus.OPEN,
    )))
    sent = 0
    for ev in events:
        regs = list(db.scalars(select(EventRegistration.player_id).where(
            EventRegistration.event_id == ev.id
        )))
        reg_set = set(regs)
        for pid in reg_set:
            # Némesis inscrito?
            nem = nemesis_of(db, player_id=pid)
            rival_id = None
            tag = None
            if nem and nem.nemesis_player_id in reg_set:
                rival_id, tag = nem.nemesis_player_id, "tu archienemigo"
            else:
                riv = db.scalar(select(PlayerRivalry).where(
                    or_(PlayerRivalry.player_low_id == pid, PlayerRivalry.player_high_id == pid),
                    PlayerRivalry.matches_count >= 3,
                ).order_by(desc(PlayerRivalry.intensity_score)))
                if riv:
                    other = riv.player_high_id if riv.player_low_id == pid else riv.player_low_id
                    if other in reg_set:
                        rival_id, tag = other, "tu rival histórico"
            if not rival_id:
                continue
            rp = db.get(PlayerProfile, rival_id)
            try:
                from app.services import notifications as notif_svc
                notif_svc.notify(
                    db, player_id=pid, type="rivalry_reminder",
                    title=f"🔥 Mañana juega {tag}",
                    body=f"{rp.alias if rp else 'Tu rival'} también está inscrito en {ev.name}. "
                         "Nos vemos en la mesa.",
                    link=f"/events/{ev.id}",
                )
                sent += 1
            except Exception:
                log.exception("rivalry reminder failed")
    if sent:
        log.info("rivalry reminders sent=%d", sent)
    return sent
