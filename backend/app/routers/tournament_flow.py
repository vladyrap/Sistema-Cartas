"""Tournament flow endpoints: check-in, deck lock, intentional draw, top cut, audit timeline, spectator."""
import hashlib
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, or_, select

from app.core.deps import AdminDep, DbDep, UserDep
from app.core.rate_limit import limiter
from app.models import (
    AdminActionLog, AttendanceStatus, Event, EventPenalty, EventRegistration,
    EventStatus, MatchDispute, MatchReport, MatchResult, PlayerDeck,
    PlayerProfile, RoundTimer,
)
from app.services import audit
from app.services import tournament as tour_svc
from app.services import rating as rating_svc

log = logging.getLogger("tournament_flow")
router = APIRouter()


# ═══════════════════════════════════════════════════════════════════════
#  CHECK-IN
# ═══════════════════════════════════════════════════════════════════════


def _hash_decklist(text: str | None) -> str:
    """SHA1 truncado de la decklist normalizada (líneas trim + sorted)."""
    if not text:
        return ""
    lines = sorted([l.strip() for l in text.splitlines() if l.strip()])
    return hashlib.sha1("\n".join(lines).encode("utf-8")).hexdigest()[:16]


def _checkin_window(ev: Event) -> tuple[datetime, datetime]:
    opens = ev.starts_at - timedelta(minutes=ev.checkin_opens_minutes_before or 30)
    closes = ev.starts_at - timedelta(minutes=ev.checkin_closes_minutes_before or 5)
    return opens, closes


class CheckinStatusOut(BaseModel):
    event_id: int
    event_name: str
    starts_at: datetime
    checkin_opens_at: datetime
    checkin_closes_at: datetime
    is_open_now: bool
    is_checked_in: bool
    checked_in_at: datetime | None = None
    my_token: str | None = None  # para QR
    total_checked_in: int
    total_registered: int


@router.get("/events/{event_id}/checkin", response_model=CheckinStatusOut)
def my_checkin_status(event_id: int, current: UserDep, db: DbDep) -> CheckinStatusOut:
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")

    opens, closes = _checkin_window(ev)
    now = datetime.now(timezone.utc)
    # Normalize tzaware (ev.starts_at puede venir naive en SQLite)
    if opens.tzinfo is None:
        opens = opens.replace(tzinfo=timezone.utc)
    if closes.tzinfo is None:
        closes = closes.replace(tzinfo=timezone.utc)

    reg = db.scalar(select(EventRegistration).where(
        EventRegistration.event_id == event_id,
        EventRegistration.player_id == current.profile.id,
    ))
    # Generar token si está checkin pero sin token
    if reg and not reg.checkin_token:
        reg.checkin_token = secrets.token_urlsafe(24)
        db.commit()

    total_in = db.scalar(select(func.count(EventRegistration.id)).where(
        EventRegistration.event_id == event_id,
        EventRegistration.checked_in_at.is_not(None),
    )) or 0
    total_reg = db.scalar(select(func.count(EventRegistration.id)).where(
        EventRegistration.event_id == event_id,
    )) or 0

    return CheckinStatusOut(
        event_id=event_id, event_name=ev.name,
        starts_at=ev.starts_at,
        checkin_opens_at=opens, checkin_closes_at=closes,
        is_open_now=opens <= now <= closes,
        is_checked_in=bool(reg and reg.checked_in_at),
        checked_in_at=reg.checked_in_at if reg else None,
        my_token=reg.checkin_token if reg else None,
        total_checked_in=int(total_in), total_registered=int(total_reg),
    )


@router.post("/events/{event_id}/checkin/self")
@limiter.limit("10/hour")
def self_checkin(request: Request, event_id: int, current: UserDep, db: DbDep) -> dict:
    """Jugador hace su propio check-in (botón en su dashboard del evento)."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")

    opens, closes = _checkin_window(ev)
    now = datetime.now(timezone.utc)
    if opens.tzinfo is None: opens = opens.replace(tzinfo=timezone.utc)
    if closes.tzinfo is None: closes = closes.replace(tzinfo=timezone.utc)
    if now < opens:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Check-in aún no abre (abre {opens.isoformat()})")
    if now > closes:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ventana de check-in cerrada")

    reg = db.scalar(select(EventRegistration).where(
        EventRegistration.event_id == event_id,
        EventRegistration.player_id == current.profile.id,
    ))
    if not reg:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No estás inscrito en este evento")
    if reg.checked_in_at:
        return {"already_checked_in": True, "at": reg.checked_in_at.isoformat()}

    # Gate de pago: eventos pagos requieren PAID para self-checkin.
    # El admin sí puede marcar manual (caso pago en efectivo en la mesa).
    from app.models.base import PaymentStatus
    if int(ev.price_clp) > 0 and reg.payment_status != PaymentStatus.PAID:
        raise HTTPException(
            status.HTTP_402_PAYMENT_REQUIRED,
            "Tu inscripción no está pagada — pagá online o acercate a la mesa de check-in.",
        )

    reg.checked_in_at = now
    reg.checkin_method = "self"
    reg.attendance_status = AttendanceStatus.ATTENDED
    _lock_deck_if_present(db, reg, event_id)
    db.commit()
    return {"checked_in": True, "at": reg.checked_in_at.isoformat()}


class QrCheckinIn(BaseModel):
    token: str = Field(min_length=6, max_length=80)


@router.post("/events/{event_id}/checkin/qr")
def qr_checkin(event_id: int, payload: QrCheckinIn, admin: AdminDep, db: DbDep) -> dict:
    """Admin/judge escanea el QR del jugador (token) y lo marca."""
    reg = db.scalar(select(EventRegistration).where(
        EventRegistration.event_id == event_id,
        EventRegistration.checkin_token == payload.token,
    ))
    if not reg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Token inválido para este evento")
    if reg.checked_in_at:
        player = db.get(PlayerProfile, reg.player_id)
        return {"already_checked_in": True, "player_alias": player.alias if player else None}

    now = datetime.now(timezone.utc)
    reg.checked_in_at = now
    reg.checkin_method = "qr"
    reg.attendance_status = AttendanceStatus.ATTENDED
    _lock_deck_if_present(db, reg, event_id)
    db.commit()
    player = db.get(PlayerProfile, reg.player_id)
    return {"checked_in": True, "player_alias": player.alias if player else None, "at": now.isoformat()}


class ManualCheckinIn(BaseModel):
    player_id: int


@router.post("/events/{event_id}/checkin/manual")
def manual_checkin(event_id: int, payload: ManualCheckinIn, admin: AdminDep, db: DbDep) -> dict:
    reg = db.scalar(select(EventRegistration).where(
        EventRegistration.event_id == event_id,
        EventRegistration.player_id == payload.player_id,
    ))
    if not reg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Inscripción no encontrada")
    if reg.checked_in_at:
        return {"already_checked_in": True}
    now = datetime.now(timezone.utc)
    reg.checked_in_at = now
    reg.checkin_method = "manual"
    reg.attendance_status = AttendanceStatus.ATTENDED
    _lock_deck_if_present(db, reg, event_id)
    audit.log(
        db, admin_id=admin.id, action="checkin.manual",
        guild_id=db.get(Event, event_id).guild_id,
        target_kind="player", target_id=payload.player_id,
        payload={"event_id": event_id},
    )
    db.commit()
    return {"checked_in": True, "at": now.isoformat()}


@router.post("/events/{event_id}/checkin/auto-noshow")
def auto_noshow(event_id: int, admin: AdminDep, db: DbDep) -> dict:
    """Marca como NO_SHOW a todos los registrados que NO hicieron check-in
    y la ventana ya cerró. Idempotente."""
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")

    _, closes = _checkin_window(ev)
    if closes.tzinfo is None: closes = closes.replace(tzinfo=timezone.utc)
    now = datetime.now(timezone.utc)
    if now < closes:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Ventana aún abierta hasta {closes.isoformat()}")

    regs = list(db.scalars(select(EventRegistration).where(
        EventRegistration.event_id == event_id,
        EventRegistration.checked_in_at.is_(None),
        EventRegistration.attendance_status == AttendanceStatus.PENDING,
    )))
    for r in regs:
        r.attendance_status = AttendanceStatus.NO_SHOW
    audit.log(
        db, admin_id=admin.id, action="checkin.auto_noshow",
        guild_id=ev.guild_id, target_kind="event", target_id=event_id,
        payload={"count": len(regs)},
    )
    db.commit()
    return {"event_id": event_id, "marked_no_show": len(regs)}


def _lock_deck_if_present(db, reg: EventRegistration, event_id: int) -> None:
    """Si el reg tiene deck, lo bloquea y hashea. Anti-tampering."""
    if not reg.deck_id:
        return
    deck = db.get(PlayerDeck, reg.deck_id)
    if not deck or deck.is_locked:
        return
    deck.is_locked = True
    deck.list_hash = _hash_decklist(deck.list_text)
    deck.locked_at = datetime.now(timezone.utc)
    deck.locked_for_event_id = event_id


# ═══════════════════════════════════════════════════════════════════════
#  DECK LOCK + HASH
# ═══════════════════════════════════════════════════════════════════════


class DeckIntegrityOut(BaseModel):
    deck_id: int
    deck_name: str
    is_locked: bool
    locked_at: datetime | None
    locked_for_event_id: int | None
    stored_hash: str | None
    current_hash: str | None
    integrity_ok: bool


@router.get("/decks/{deck_id}/integrity", response_model=DeckIntegrityOut)
def deck_integrity(deck_id: int, admin: AdminDep, db: DbDep) -> DeckIntegrityOut:
    """Verifica que el list_text actual del deck coincida con el hash al lock.
    Si difiere, alguien lo modificó post-lock (tampering)."""
    d = db.get(PlayerDeck, deck_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deck no encontrado")
    current = _hash_decklist(d.list_text)
    return DeckIntegrityOut(
        deck_id=d.id, deck_name=d.name,
        is_locked=d.is_locked,
        locked_at=d.locked_at,
        locked_for_event_id=d.locked_for_event_id,
        stored_hash=d.list_hash,
        current_hash=current,
        integrity_ok=(d.list_hash is None or d.list_hash == current),
    )


@router.post("/events/{event_id}/lock-all-decks")
def lock_all_decks(event_id: int, admin: AdminDep, db: DbDep) -> dict:
    """Locka + hashea todos los decks asociados a registros de este evento.
    Útil llamarlo al iniciar la primera ronda."""
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    regs = list(db.scalars(select(EventRegistration).where(
        EventRegistration.event_id == event_id,
        EventRegistration.deck_id.is_not(None),
    )))
    locked = 0
    for r in regs:
        deck = db.get(PlayerDeck, r.deck_id)
        if deck and not deck.is_locked:
            deck.is_locked = True
            deck.list_hash = _hash_decklist(deck.list_text)
            deck.locked_at = datetime.now(timezone.utc)
            deck.locked_for_event_id = event_id
            locked += 1
    audit.log(
        db, admin_id=admin.id, action="event.lock_decks",
        guild_id=ev.guild_id, target_kind="event", target_id=event_id,
        payload={"locked_count": locked},
    )
    db.commit()
    return {"event_id": event_id, "decks_locked": locked}


# ═══════════════════════════════════════════════════════════════════════
#  INTENTIONAL DRAW
# ═══════════════════════════════════════════════════════════════════════


@router.post("/matches/{match_id}/intentional-draw")
@limiter.limit("20/hour")
def propose_intentional_draw(request: Request, match_id: int, current: UserDep, db: DbDep) -> dict:
    """Un jugador propone Intentional Draw. Cuando ambos consintieron, el match
    se reporta como draw 0-0.
    """
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    m = db.get(MatchResult, match_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Match no encontrado")
    if m.is_bye:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bye no puede ser ID")
    if m.reported_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Match ya reportado")
    if current.profile.id not in (m.player_a_id, m.player_b_id or 0):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No sos parte del match")

    if current.profile.id == m.player_a_id:
        m.id_consented_by_a = True
    else:
        m.id_consented_by_b = True
    db.flush()

    if m.id_consented_by_a and m.id_consented_by_b:
        # Ambos consintieron — aplicar draw
        m.is_intentional_draw = True
        tour_svc.report_match(
            db, match_id=match_id,
            winner_id=None, is_draw=True,
            games_a=0, games_b=0,
            reported_by_user_id=current.id,
        )
        db.commit()
        return {"match_id": match_id, "status": "CONFIRMED_DRAW", "id_consented_by_a": True, "id_consented_by_b": True}

    db.commit()
    return {
        "match_id": match_id,
        "status": "PENDING_OPPONENT",
        "id_consented_by_a": m.id_consented_by_a,
        "id_consented_by_b": m.id_consented_by_b,
    }


@router.delete("/matches/{match_id}/intentional-draw")
def cancel_intentional_draw(match_id: int, current: UserDep, db: DbDep) -> dict:
    """Cancela tu propio consent al ID antes de que el rival confirme."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    m = db.get(MatchResult, match_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Match no encontrado")
    if m.reported_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Match ya reportado, no se puede cancelar ID")
    if current.profile.id == m.player_a_id:
        m.id_consented_by_a = False
    elif current.profile.id == m.player_b_id:
        m.id_consented_by_b = False
    else:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No sos parte del match")
    db.commit()
    return {"match_id": match_id, "cancelled": True}


# ═══════════════════════════════════════════════════════════════════════
#  TOP CUT BRACKET
# ═══════════════════════════════════════════════════════════════════════


class TopCutIn(BaseModel):
    size: int = Field(default=8, ge=2, le=64)


@router.post("/events/{event_id}/top-cut")
def create_top_cut(event_id: int, payload: TopCutIn, admin: AdminDep, db: DbDep) -> dict:
    """Cierra el swiss + crea bracket single-elim con top N por standings.

    Auto-clamp a la potencia de 2 más cercana o exacta (2/4/8/16/32/64).
    """
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")

    # Ajustar size a potencia de 2 más cercana hacia abajo (no exceder)
    actual_size = 2
    while actual_size * 2 <= payload.size:
        actual_size *= 2

    # Verificar suficientes jugadores activos
    n_active = db.scalar(select(func.count(EventRegistration.id)).where(
        EventRegistration.event_id == event_id,
        EventRegistration.dropped.is_(False),
    )) or 0
    if n_active < actual_size:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Solo hay {n_active} jugadores activos, no alcanza para top {actual_size}",
        )

    # Marcar evento como CLOSED para evitar más swiss rounds
    if ev.status == EventStatus.OPEN:
        ev.status = EventStatus.CLOSED
        db.flush()

    # Build bracket usando el rating_svc existente
    rating_svc.build_bracket(db, event_id=event_id, size=actual_size)
    bracket_data = rating_svc.get_bracket_tree(db, event_id=event_id)

    audit.log(
        db, admin_id=admin.id, action="event.top_cut_created",
        guild_id=ev.guild_id, target_kind="event", target_id=event_id,
        payload={"size": actual_size, "requested": payload.size},
    )
    db.commit()

    return {
        "event_id": event_id,
        "top_cut_size": actual_size,
        "requested_size": payload.size,
        "bracket": bracket_data,
    }


# ═══════════════════════════════════════════════════════════════════════
#  AUDIT TIMELINE
# ═══════════════════════════════════════════════════════════════════════


class TimelineEntry(BaseModel):
    kind: str
    when: datetime
    actor: str | None = None
    summary: str
    detail: dict = {}


@router.get("/events/{event_id}/timeline", response_model=list[TimelineEntry])
def event_timeline(event_id: int, admin: AdminDep, db: DbDep, limit: int = 200) -> list[TimelineEntry]:
    """Merge cronológico de todo lo que pasó en el evento: admin actions, reports,
    disputes, penalties, match results. Ordenado descendente por fecha.
    """
    entries: list[TimelineEntry] = []

    # 1. Admin actions vinculados al evento
    admin_actions = list(db.scalars(
        select(AdminActionLog).where(
            or_(
                AdminActionLog.target_id == event_id,
                AdminActionLog.payload.like(f'%"event_id": {event_id}%'),
                AdminActionLog.payload.like(f'%"event_id":{event_id}%'),
            ),
            AdminActionLog.action.like('%event%')
            | AdminActionLog.action.like('%match%')
            | AdminActionLog.action.like('%dispute%')
            | AdminActionLog.action.like('%checkin%'),
        ).order_by(desc(AdminActionLog.created_at)).limit(limit)
    ))
    for a in admin_actions:
        admin_user_alias = None
        if a.admin_id:
            from app.models import User
            u = db.get(User, a.admin_id)
            admin_user_alias = u.profile.alias if u and u.profile else (u.email if u else None)
        entries.append(TimelineEntry(
            kind="admin_action",
            when=a.created_at,
            actor=admin_user_alias,
            summary=f"{a.action}",
            detail=json.loads(a.payload) if a.payload else {},
        ))

    # 2. Match reports
    reports = list(db.scalars(
        select(MatchReport)
        .join(MatchResult, MatchResult.id == MatchReport.match_id)
        .where(MatchResult.event_id == event_id)
        .order_by(desc(MatchReport.created_at)).limit(limit)
    ))
    for r in reports:
        reporter = db.get(PlayerProfile, r.reporter_player_id)
        entries.append(TimelineEntry(
            kind="match_report",
            when=r.created_at,
            actor=reporter.alias if reporter else None,
            summary=f"Match #{r.match_id} self-reported ({r.status})",
            detail={
                "match_id": r.match_id,
                "claimed_winner_id": r.claimed_winner_id,
                "claimed_is_draw": r.claimed_is_draw,
                "score": f"{r.claimed_games_a}-{r.claimed_games_b}",
                "status": r.status,
            },
        ))

    # 3. Disputes
    disputes = list(db.scalars(
        select(MatchDispute)
        .join(MatchResult, MatchResult.id == MatchDispute.match_id)
        .where(MatchResult.event_id == event_id)
        .order_by(desc(MatchDispute.created_at)).limit(limit)
    ))
    for d in disputes:
        opener = db.get(PlayerProfile, d.opened_by_player_id)
        entries.append(TimelineEntry(
            kind="dispute",
            when=d.created_at,
            actor=opener.alias if opener else None,
            summary=f"Dispute Match #{d.match_id} ({d.status})",
            detail={"match_id": d.match_id, "reason": d.reason, "status": d.status},
        ))

    # 4. Penalties
    penalties = list(db.scalars(
        select(EventPenalty).where(EventPenalty.event_id == event_id)
        .order_by(desc(EventPenalty.created_at)).limit(limit)
    ))
    for p in penalties:
        player = db.get(PlayerProfile, p.player_id)
        entries.append(TimelineEntry(
            kind="penalty",
            when=p.created_at,
            actor=None,
            summary=f"{p.kind} a {player.alias if player else '?'}: {p.reason[:60]}",
            detail={"kind": p.kind, "severity": p.severity, "rescinded_at": p.rescinded_at.isoformat() if p.rescinded_at else None},
        ))

    # 5. Match reports finales (cuando reported_at != null)
    completed_matches = list(db.scalars(
        select(MatchResult).where(
            MatchResult.event_id == event_id,
            MatchResult.reported_at.is_not(None),
        ).order_by(desc(MatchResult.reported_at)).limit(limit)
    ))
    for m in completed_matches:
        pa = db.get(PlayerProfile, m.player_a_id)
        pb = db.get(PlayerProfile, m.player_b_id) if m.player_b_id else None
        if m.is_bye:
            summary = f"R{m.round_number} bye: {pa.alias if pa else '?'}"
        elif m.is_draw:
            summary = f"R{m.round_number} draw: {pa.alias if pa else '?'} ↔ {pb.alias if pb else '?'} ({m.games_a}-{m.games_b})"
        else:
            winner = pa if m.winner_id == m.player_a_id else pb
            loser = pb if m.winner_id == m.player_a_id else pa
            summary = f"R{m.round_number}: {winner.alias if winner else '?'} venció a {loser.alias if loser else '?'} ({m.games_a}-{m.games_b})"
        entries.append(TimelineEntry(
            kind="match_completed",
            when=m.reported_at,
            actor=None,
            summary=summary,
            detail={"match_id": m.id, "round": m.round_number, "is_intentional_draw": m.is_intentional_draw},
        ))

    # Sort descending by when
    entries.sort(key=lambda e: e.when or datetime.min.replace(tzinfo=timezone.utc), reverse=True)
    return entries[:limit]


# ═══════════════════════════════════════════════════════════════════════
#  SPECTATOR MODE — pública, sin auth
# ═══════════════════════════════════════════════════════════════════════


class SpectatorPairing(BaseModel):
    table_number: int | None
    player_a_alias: str
    player_b_alias: str | None
    is_bye: bool
    is_draw: bool
    games_a: int
    games_b: int
    reported: bool
    winner_alias: str | None


class SpectatorStanding(BaseModel):
    rank: int
    alias: str
    match_points: int
    omw: float
    gw: float
    ogw: float
    dropped: bool


class SpectatorTimer(BaseModel):
    round_number: int
    remaining_seconds: int
    is_paused: bool


class SpectatorOut(BaseModel):
    event_id: int
    event_name: str
    status: str
    current_round: int
    total_registered: int
    total_active: int
    timer: SpectatorTimer | None = None
    pairings: list[SpectatorPairing]
    standings: list[SpectatorStanding]


@router.get("/events/{event_id}/spectate", response_model=SpectatorOut)
def spectate_event(event_id: int, db: DbDep) -> SpectatorOut:
    """Vista pública del evento — pairings de la ronda actual, standings y timer.
    Sin auth. Pensado para pantallas en la tienda y para que el público siga el torneo.
    """
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    if ev.status == EventStatus.DRAFT:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Evento aún no publicado")

    current_round = db.scalar(select(func.coalesce(func.max(MatchResult.round_number), 0)).where(
        MatchResult.event_id == event_id
    )) or 0

    pairings_out: list[SpectatorPairing] = []
    if current_round > 0:
        matches = list(db.scalars(
            select(MatchResult).where(
                MatchResult.event_id == event_id,
                MatchResult.round_number == current_round,
            ).order_by(MatchResult.table_number.asc().nulls_last())
        ))
        for m in matches:
            pa = db.get(PlayerProfile, m.player_a_id)
            pb = db.get(PlayerProfile, m.player_b_id) if m.player_b_id else None
            winner = None
            if m.winner_id == m.player_a_id and pa:
                winner = pa.alias
            elif pb and m.winner_id == m.player_b_id:
                winner = pb.alias
            pairings_out.append(SpectatorPairing(
                table_number=m.table_number,
                player_a_alias=pa.alias if pa else f"#{m.player_a_id}",
                player_b_alias=pb.alias if pb else (None if m.is_bye else None),
                is_bye=m.is_bye, is_draw=m.is_draw,
                games_a=m.games_a, games_b=m.games_b,
                reported=m.reported_at is not None,
                winner_alias=winner,
            ))

    standings_rows = tour_svc.compute_standings(db, event_id=event_id)
    standings_out = [
        SpectatorStanding(
            rank=getattr(r, '_rank', i + 1),
            alias=r.alias,
            match_points=r.match_points,
            omw=r.omw, gw=r.gw, ogw=r.ogw,
            dropped=r.dropped,
        ) for i, r in enumerate(standings_rows)
    ]

    total_reg = db.scalar(select(func.count(EventRegistration.id)).where(
        EventRegistration.event_id == event_id
    )) or 0
    total_active = db.scalar(select(func.count(EventRegistration.id)).where(
        EventRegistration.event_id == event_id,
        EventRegistration.dropped.is_(False),
    )) or 0

    timer_out = None
    if current_round > 0:
        rt_obj = db.scalar(select(RoundTimer).where(
            RoundTimer.event_id == event_id,
            RoundTimer.round_number == current_round,
        ).order_by(desc(RoundTimer.id)))
        if rt_obj and rt_obj.status in ("RUNNING", "PAUSED", "EXTENDED"):
            now = datetime.now(timezone.utc)
            if rt_obj.status == "PAUSED" and rt_obj.paused_remaining_seconds is not None:
                remaining = rt_obj.paused_remaining_seconds
            elif rt_obj.ends_at:
                ends = rt_obj.ends_at if rt_obj.ends_at.tzinfo else rt_obj.ends_at.replace(tzinfo=timezone.utc)
                remaining = max(0, int((ends - now).total_seconds()))
            else:
                remaining = 0
            timer_out = SpectatorTimer(
                round_number=current_round,
                remaining_seconds=remaining,
                is_paused=rt_obj.status == "PAUSED",
            )

    return SpectatorOut(
        event_id=event_id, event_name=ev.name, status=ev.status.value,
        current_round=current_round,
        total_registered=int(total_reg), total_active=int(total_active),
        timer=timer_out,
        pairings=pairings_out,
        standings=standings_out,
    )
