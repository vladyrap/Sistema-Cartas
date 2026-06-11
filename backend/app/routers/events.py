import logging

from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import func, select

log = logging.getLogger(__name__)

from app.core.deps import AdminDep, DbDep, GuildContext, UserDep, get_current_user
from app.models import Event, EventRegistration, EventStatus, Game, GameFormat, GameSet, MatchResult, PlayerProfile, User
from app.schemas.common import EventOut, EventRegistrationOut, GameFormatOut, GameOut, GameSetOut
from app.services import event as event_svc
from app.services import tournament as tour_svc

router = APIRouter()


def _to_out(ev: Event, registered_count: int, is_registered: bool = False,
            my_reg: EventRegistration | None = None) -> EventOut:
    return EventOut(
        id=ev.id,
        name=ev.name,
        game_id=ev.game_id,
        event_type=ev.event_type,
        status=ev.status,
        starts_at=ev.starts_at,
        ends_at=ev.ends_at,
        slots=ev.slots,
        registered_count=registered_count,
        price_clp=int(ev.price_clp),
        description=ev.description,
        rules=ev.rules,
        prizes=ev.prizes,
        is_registered=is_registered,
        my_registration_id=my_reg.id if my_reg else None,
        my_payment_status=my_reg.payment_status.value if my_reg else None,
        my_payment_expires_at=my_reg.payment_expires_at if my_reg else None,
    )


def _registered_set(db, player_id: int | None) -> set[int]:
    if player_id is None:
        return set()
    return set(
        db.scalars(
            select(EventRegistration.event_id).where(EventRegistration.player_id == player_id)
        )
    )


@router.get("", response_model=list[EventOut])
def list_events(db: DbDep, guild: GuildContext) -> list[EventOut]:
    stmt = select(Event).order_by(Event.starts_at)
    if guild is not None:
        stmt = stmt.where(Event.guild_id == guild.id)
    events = list(db.scalars(stmt))
    if not events:
        return []
    ids = [e.id for e in events]
    counts = dict(
        db.execute(
            select(EventRegistration.event_id, func.count(EventRegistration.id))
            .where(EventRegistration.event_id.in_(ids))
            .group_by(EventRegistration.event_id)
        ).all()
    )
    return [_to_out(e, counts.get(e.id, 0)) for e in events]


@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: int, db: DbDep, guild: GuildContext) -> EventOut:
    ev = db.get(Event, event_id)
    if not ev or (guild is not None and ev.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    count = db.scalar(
        select(func.count(EventRegistration.id)).where(EventRegistration.event_id == event_id)
    ) or 0
    return _to_out(ev, count)


@router.get("/{event_id}/me", response_model=EventOut)
def get_event_with_me(event_id: int, db: DbDep, current: UserDep, guild: GuildContext) -> EventOut:
    """Detalle del evento con flag de inscripción del jugador autenticado."""
    ev = db.get(Event, event_id)
    if not ev or (guild is not None and ev.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    count = db.scalar(
        select(func.count(EventRegistration.id)).where(EventRegistration.event_id == event_id)
    ) or 0
    my_reg = None
    if current.profile:
        my_reg = db.scalar(
            select(EventRegistration).where(
                EventRegistration.event_id == event_id,
                EventRegistration.player_id == current.profile.id,
            )
        )
    return _to_out(ev, count, my_reg is not None, my_reg=my_reg)


class RegisterRequest(BaseModel):
    deck_id: int | None = None


@router.post("/{event_id}/register", response_model=EventRegistrationOut, status_code=201)
def register_to_event(
    event_id: int, db: DbDep, current: UserDep, payload: RegisterRequest | None = None,
) -> EventRegistration:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil de jugador")
    deck_id = payload.deck_id if payload else None
    reg = event_svc.register_player(
        db, event_id=event_id, player_id=current.profile.id, deck_id=deck_id,
    )
    db.commit()
    db.refresh(reg)
    return reg


class DeckAssignRequest(BaseModel):
    deck_id: int | None = None


@router.patch("/registrations/{registration_id}/deck", response_model=EventRegistrationOut)
def assign_deck(
    registration_id: int, payload: DeckAssignRequest, db: DbDep, current: UserDep,
) -> EventRegistration:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    reg = event_svc.assign_deck_to_registration(
        db, registration_id=registration_id, deck_id=payload.deck_id,
        by_player_id=current.profile.id,
    )
    db.commit()
    db.refresh(reg)
    return reg


@router.delete("/registrations/{registration_id}", status_code=204)
def cancel_my_registration(registration_id: int, db: DbDep, current: UserDep):
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil de jugador")
    event_svc.cancel_registration(db, registration_id=registration_id, by_player_id=current.profile.id)
    db.commit()
    return None


@router.post("/registrations/{registration_id}/pay")
def pay_registration(registration_id: int, request: Request, db: DbDep, current: UserDep) -> dict:
    """Crea una preference de MercadoPago para pagar la inscripción a un evento.

    external_reference = "evt:{registration_id}" — el webhook de payments la
    reconoce y marca payment_status=PAID al confirmar el pago approved.
    """
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil de jugador")
    reg = db.get(EventRegistration, registration_id)
    if not reg or reg.player_id != current.profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Inscripción no encontrada")
    from app.models.base import PaymentStatus
    if reg.payment_status == PaymentStatus.PAID:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Inscripción ya pagada")

    ev = db.get(Event, reg.event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    if int(ev.price_clp) <= 0:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Este evento es gratuito")

    from app.models import Guild
    guild = db.get(Guild, ev.guild_id)
    from app.services import mercadopago as mp_svc
    from app.core.config import settings as _settings

    # Beneficio membresía: descuento % en la entrada
    unit_price = int(ev.price_clp)
    from app.services import growth as growth_svc
    is_member = growth_svc.is_member(db, current.profile.id)
    if is_member and _settings.membership_event_discount_pct > 0:
        unit_price = max(1, unit_price * (100 - _settings.membership_event_discount_pct) // 100)

    front_base = _settings.frontend_url.rstrip("/")
    pref = mp_svc.create_preference(
        access_token=(guild.mp_access_token if guild else "") or "",
        items=[{
            "title": f"Inscripción — {ev.name}" + (" (member)" if is_member else ""),
            "quantity": 1,
            "unit_price": unit_price,
            "currency_id": "CLP",
        }],
        external_reference=f"evt:{reg.id}",
        back_urls={
            "success": f"{front_base}/events/{ev.id}?payment=success",
            "failure": f"{front_base}/events/{ev.id}?payment=failure",
            "pending": f"{front_base}/events/{ev.id}?payment=pending",
        },
        notification_url=f"{str(request.base_url).rstrip('/')}/api/payments/mercadopago/webhook",
    )
    reg.mp_preference_id = pref.get("id")
    db.commit()
    return {
        "init_point": pref.get("init_point") or pref.get("sandbox_init_point") or "",
        "preference_id": pref.get("id") or "",
        "mock": pref.get("mock", False),
        "price_clp": unit_price,
        "member_discount_applied": is_member,
        "payment_expires_at": reg.payment_expires_at.isoformat() if reg.payment_expires_at else None,
    }


@router.post("/registrations/{registration_id}/mark-paid", response_model=EventRegistrationOut)
def admin_mark_paid(registration_id: int, db: DbDep, admin: AdminDep) -> EventRegistration:
    """Admin marca la inscripción como pagada (efectivo en tienda / transferencia)."""
    reg = db.get(EventRegistration, registration_id)
    if not reg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Inscripción no encontrada")
    from app.models.base import PaymentStatus
    from datetime import datetime as _dt, timezone as _tz
    if reg.payment_status == PaymentStatus.PAID:
        return reg
    reg.payment_status = PaymentStatus.PAID
    reg.paid_at = _dt.now(_tz.utc)
    reg.payment_expires_at = None
    from app.services import audit
    ev = db.get(Event, reg.event_id)
    audit.log(
        db, admin_id=admin.id, action="event_reg.mark_paid",
        guild_id=ev.guild_id if ev else None,
        target_kind="registration", target_id=registration_id,
        payload={"event_id": reg.event_id, "player_id": reg.player_id, "method": "cash/manual"},
    )
    db.commit()
    db.refresh(reg)
    return reg


@router.post("/registrations/{registration_id}/mark-refunded", response_model=EventRegistrationOut)
def admin_mark_refunded(registration_id: int, db: DbDep, admin: AdminDep) -> EventRegistration:
    """Admin marca la inscripción como reembolsada (el refund real en MP es manual)."""
    reg = db.get(EventRegistration, registration_id)
    if not reg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Inscripción no encontrada")
    from app.models.base import PaymentStatus
    if reg.payment_status != PaymentStatus.PAID:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Solo se reembolsan inscripciones PAID")
    reg.payment_status = PaymentStatus.REFUNDED
    from app.services import audit
    from app.services import notifications as notif_svc
    ev = db.get(Event, reg.event_id)
    audit.log(
        db, admin_id=admin.id, action="event_reg.mark_refunded",
        guild_id=ev.guild_id if ev else None,
        target_kind="registration", target_id=registration_id,
        payload={"event_id": reg.event_id, "player_id": reg.player_id},
    )
    notif_svc.notify(
        db, player_id=reg.player_id,
        type="event_refunded",
        title="Inscripción reembolsada",
        body=f"Tu pago de {ev.name if ev else 'el evento'} fue marcado como reembolsado.",
        link=f"/events/{reg.event_id}",
    )
    db.commit()
    db.refresh(reg)
    return reg


# ============================== Waitlist ==============================


@router.post("/{event_id}/waitlist", status_code=201)
def join_event_waitlist(event_id: int, db: DbDep, current: UserDep) -> dict:
    """Anotarse en la lista de espera de un evento lleno."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil de jugador")
    entry = event_svc.join_waitlist(db, event_id=event_id, player_id=current.profile.id)
    db.commit()
    # Posición en la cola
    from app.models import EventWaitlist
    position = db.scalar(
        select(func.count(EventWaitlist.id)).where(
            EventWaitlist.event_id == event_id,
            EventWaitlist.promoted_at.is_(None),
            EventWaitlist.created_at <= entry.created_at,
        )
    ) or 1
    return {"ok": True, "position": int(position)}


@router.delete("/{event_id}/waitlist", status_code=204)
def leave_event_waitlist(event_id: int, db: DbDep, current: UserDep):
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil de jugador")
    event_svc.leave_waitlist(db, event_id=event_id, player_id=current.profile.id)
    db.commit()


@router.get("/{event_id}/waitlist")
def waitlist_status(event_id: int, db: DbDep, current: UserDep) -> dict:
    """Estado de la cola: total esperando + mi posición (si estoy)."""
    from app.models import EventWaitlist
    total = db.scalar(select(func.count(EventWaitlist.id)).where(
        EventWaitlist.event_id == event_id,
        EventWaitlist.promoted_at.is_(None),
    )) or 0
    my_position = None
    if current.profile:
        mine = db.scalar(select(EventWaitlist).where(
            EventWaitlist.event_id == event_id,
            EventWaitlist.player_id == current.profile.id,
            EventWaitlist.promoted_at.is_(None),
        ))
        if mine:
            my_position = (db.scalar(
                select(func.count(EventWaitlist.id)).where(
                    EventWaitlist.event_id == event_id,
                    EventWaitlist.promoted_at.is_(None),
                    EventWaitlist.created_at <= mine.created_at,
                )
            ) or 1)
    return {"total_waiting": int(total), "my_position": my_position}


# ============================== Caja del evento (admin) ==============================


@router.get("/{event_id}/finance")
def event_finance(event_id: int, db: DbDep, admin: AdminDep) -> dict:
    """Resumen financiero del evento: recaudado / pendiente / reembolsado +
    detalle por inscripción para conciliar contra el panel de MercadoPago."""
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    from app.models.base import PaymentStatus as PS
    regs = list(db.scalars(select(EventRegistration).where(
        EventRegistration.event_id == event_id
    )))
    price = int(ev.price_clp)
    by_status = {"PAID": 0, "PENDING": 0, "REFUNDED": 0, "CANCELLED": 0}
    detail = []
    for r in regs:
        st = r.payment_status.value
        by_status[st] = by_status.get(st, 0) + 1
        p = db.get(PlayerProfile, r.player_id)
        detail.append({
            "registration_id": r.id,
            "alias": p.alias if p else f"#{r.player_id}",
            "payment_status": st,
            "paid_at": r.paid_at.isoformat() if r.paid_at else None,
            "mp_payment_id": r.mp_payment_id,
            "method": "mercadopago" if r.mp_payment_id else ("manual" if r.paid_at else None),
            "expires_at": r.payment_expires_at.isoformat() if r.payment_expires_at else None,
        })
    # Waitlist con aliases (para que el admin vea la cola completa)
    from app.models import EventWaitlist
    wl_entries = list(db.scalars(
        select(EventWaitlist).where(
            EventWaitlist.event_id == event_id,
            EventWaitlist.promoted_at.is_(None),
        ).order_by(EventWaitlist.created_at)
    ))
    waitlist = []
    for i, w in enumerate(wl_entries, start=1):
        p = db.get(PlayerProfile, w.player_id)
        waitlist.append({
            "position": i,
            "player_id": w.player_id,
            "alias": p.alias if p else f"#{w.player_id}",
            "since": w.created_at.isoformat(),
        })

    return {
        "event_id": event_id,
        "event_name": ev.name,
        "price_clp": price,
        "slots": ev.slots,
        "registrations": len(regs),
        "counts": by_status,
        "collected_clp": by_status.get("PAID", 0) * price,
        "pending_clp": by_status.get("PENDING", 0) * price,
        "refunded_clp": by_status.get("REFUNDED", 0) * price,
        "detail": detail,
        "waitlist": waitlist,
    }


@router.post("/{event_id}/refund-all")
def admin_refund_all(event_id: int, db: DbDep, admin: AdminDep) -> dict:
    """Marca REFUNDED todas las inscripciones PAID del evento (típico: evento cancelado).
    El refund real en MercadoPago lo hace el admin desde el panel MP."""
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    from app.models.base import PaymentStatus
    from app.services import audit
    from app.services import notifications as notif_svc
    regs = list(db.scalars(select(EventRegistration).where(
        EventRegistration.event_id == event_id,
        EventRegistration.payment_status == PaymentStatus.PAID,
    )))
    for reg in regs:
        reg.payment_status = PaymentStatus.REFUNDED
        notif_svc.notify(
            db, player_id=reg.player_id,
            type="event_refunded",
            title="Inscripción reembolsada",
            body=f"El evento {ev.name} marcó tu pago como reembolsado.",
            link=f"/events/{event_id}",
        )
    audit.log(
        db, admin_id=admin.id, action="event.refund_all",
        guild_id=ev.guild_id, target_kind="event", target_id=event_id,
        payload={"count": len(regs)},
    )
    db.commit()
    return {"ok": True, "refunded_count": len(regs)}


# ============================== Torneo: standings, pairings, drop ==============================


class StandingOut(BaseModel):
    rank: int
    player_id: int
    alias: str
    elite_id_code: str
    match_points: int
    rounds_won: int
    rounds_lost: int
    rounds_draw: int
    games_won: int
    games_lost: int
    omw: float
    gw: float
    ogw: float
    matches_played: int
    dropped: bool


class PairingOut(BaseModel):
    match_id: int
    round_number: int
    table_number: int | None = None
    player_a_id: int
    player_a_alias: str
    player_b_id: int | None = None
    player_b_alias: str | None = None
    is_bye: bool
    is_draw: bool
    games_a: int
    games_b: int
    winner_id: int | None = None
    reported_at: str | None = None


def _match_to_pairing(db, m: MatchResult) -> PairingOut:
    a = db.get(PlayerProfile, m.player_a_id)
    b = db.get(PlayerProfile, m.player_b_id) if m.player_b_id else None
    return PairingOut(
        match_id=m.id, round_number=m.round_number, table_number=m.table_number,
        player_a_id=m.player_a_id, player_a_alias=a.alias if a else "?",
        player_b_id=m.player_b_id, player_b_alias=b.alias if b else None,
        is_bye=m.is_bye, is_draw=m.is_draw,
        games_a=m.games_a, games_b=m.games_b, winner_id=m.winner_id,
        reported_at=m.reported_at.isoformat() if m.reported_at else None,
    )


@router.get("/{event_id}/standings", response_model=list[StandingOut])
def get_standings(event_id: int, db: DbDep) -> list[StandingOut]:
    rows = tour_svc.compute_standings(db, event_id=event_id)
    return [
        StandingOut(
            rank=r.rank, player_id=r.player_id, alias=r.alias, elite_id_code=r.elite_id_code,
            match_points=r.match_points, rounds_won=r.rounds_won, rounds_lost=r.rounds_lost,
            rounds_draw=r.rounds_draw, games_won=r.games_won, games_lost=r.games_lost,
            omw=r.omw, gw=r.gw, ogw=r.ogw,
            matches_played=r.matches_played, dropped=r.dropped,
        )
        for r in rows
    ]


@router.get("/{event_id}/rounds/{round_number}/pairings", response_model=list[PairingOut])
def get_round_pairings(event_id: int, round_number: int, db: DbDep) -> list[PairingOut]:
    matches = list(db.scalars(
        select(MatchResult).where(
            MatchResult.event_id == event_id,
            MatchResult.round_number == round_number,
        ).order_by(MatchResult.table_number)
    ))
    return [_match_to_pairing(db, m) for m in matches]


@router.get("/{event_id}/my-current-match", response_model=PairingOut | None)
def get_my_current_match(event_id: int, db: DbDep, current: UserDep) -> PairingOut | None:
    """Devuelve el match activo (último round, sin reportar) del jugador."""
    if not current.profile:
        return None
    last_round = db.scalar(
        select(func.coalesce(func.max(MatchResult.round_number), 0)).where(
            MatchResult.event_id == event_id
        )
    ) or 0
    if last_round == 0:
        return None
    m = db.scalar(
        select(MatchResult).where(
            MatchResult.event_id == event_id,
            MatchResult.round_number == last_round,
            (MatchResult.player_a_id == current.profile.id) | (MatchResult.player_b_id == current.profile.id),
        )
    )
    return _match_to_pairing(db, m) if m else None


@router.post("/{event_id}/drop", status_code=204)
def drop_from_event(event_id: int, db: DbDep, current: UserDep):
    """El jugador autenticado se retira del evento."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    tour_svc.drop_player(db, event_id=event_id, player_id=current.profile.id)
    db.commit()
    return None


# ============================== Admin: pairings + report ==============================


class ReportMatchRequest(BaseModel):
    winner_id: int | None = None
    is_draw: bool = False
    games_a: int = 0
    games_b: int = 0


@router.post("/{event_id}/rounds/next", response_model=list[PairingOut])
def start_next_round(event_id: int, db: DbDep, admin: AdminDep) -> list[PairingOut]:
    """Genera pairings de la próxima ronda y los persiste (admin)."""
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    if ev.status not in (EventStatus.OPEN, EventStatus.CLOSED):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Estado del evento no permite iniciar ronda ({ev.status.value})",
        )
    # Si es la primera ronda, lockear todos los decks asociados.
    last_round = db.scalar(
        select(func.coalesce(func.max(MatchResult.round_number), 0)).where(
            MatchResult.event_id == event_id
        )
    ) or 0
    if last_round == 0:
        event_svc.lock_decks_for_event(db, event_id=event_id)
        if ev.status == EventStatus.OPEN:
            ev.status = EventStatus.CLOSED
    proposals = tour_svc.generate_pairings(db, event_id=event_id)
    if not proposals:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No hay jugadores activos para emparejar")
    matches = tour_svc.persist_pairings(db, event_id=event_id, pairings=proposals)
    db.commit()
    if matches:
        from app.services import realtime as _rt
        _rt.emit_round_started(event_id, matches[0].round_number, len(matches))
    return [_match_to_pairing(db, m) for m in matches]


@router.post("/{event_id}/matches/{match_id}/report", response_model=PairingOut)
def report_match_result(
    event_id: int, match_id: int, payload: ReportMatchRequest,
    db: DbDep, admin: AdminDep,
) -> PairingOut:
    m = db.get(MatchResult, match_id)
    if not m or m.event_id != event_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Match no encontrado")
    # Validar winner_id es uno de los dos jugadores.
    if not payload.is_draw and payload.winner_id not in (m.player_a_id, m.player_b_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "winner_id debe ser player_a o player_b")
    updated = tour_svc.report_match(
        db, match_id=match_id,
        winner_id=payload.winner_id, is_draw=payload.is_draw,
        games_a=payload.games_a, games_b=payload.games_b,
        reported_by_user_id=admin.id,
    )
    db.commit()
    return _match_to_pairing(db, updated)


@router.post("/{event_id}/finalize", response_model=dict)
def finalize_event(event_id: int, db: DbDep, admin: AdminDep, force: bool = False) -> dict:
    """Cierra el evento.

    Pre-finalize health check:
      - Rechaza si hay matches sin reportar, disputas abiertas, MP inconsistentes
      - Excepto si force=true (con audit log explícito)

    Atomic: si award_event_exp falla, las posiciones también se revierten.
    Idempotencia: award_event_exp valida related_event_id para no doble-acreditar.

    Bonus: si hay rating snapshot pre-evento, se finaliza el snapshot con post_rating.
    """
    from app.services import tournament_integrity, audit
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")

    health = tournament_integrity.validate_event(db, event_id)
    if health.get("has_critical") and not force:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            {
                "error": "Evento no es finalizable — issues críticos",
                "issues": [i for i in health["issues"] if i["severity"] == "critical"],
                "hint": "Pasá ?force=true para sobreescribir (queda en audit log).",
            },
        )

    try:
        positions = tour_svc.finalize_positions(db, event_id=event_id)
        summary = event_svc.award_event_exp(db, event_id=event_id, admin_id=admin.id)
        # Cerrar rating snapshots si existen
        from app.models import EventRatingSnapshot, PlayerRating
        snaps = list(db.scalars(select(EventRatingSnapshot).where(
            EventRatingSnapshot.event_id == event_id,
            EventRatingSnapshot.post_rating.is_(None),
        )))
        from datetime import datetime, timezone
        now = datetime.now(timezone.utc)
        snaps_finalized = 0
        for s in snaps:
            rating = db.scalar(select(PlayerRating).where(
                PlayerRating.player_id == s.player_id, PlayerRating.game_id == s.game_id,
            ))
            if rating:
                s.post_rating = rating.rating
                s.post_rd = rating.rd
                s.post_volatility = rating.volatility
                s.post_matches_played = rating.matches_played
                s.finalized_at = now
                snaps_finalized += 1
        if force:
            audit.log(
                db, admin_id=admin.id, action="event.finalize_forced",
                guild_id=ev.guild_id, target_kind="event", target_id=event_id,
                payload={"warnings": [i["code"] for i in health["issues"] if i["severity"] == "critical"]},
            )
        db.commit()
    except Exception:
        db.rollback()
        raise
    summary["positions_assigned"] = positions
    summary["rating_snapshots_finalized"] = snaps_finalized
    summary["health_at_finalize"] = {
        "has_warnings": health.get("has_warnings"),
        "integrity_hash": health.get("integrity_hash"),
    }
    return summary


@router.post("/{event_id}/unfinalize", response_model=dict)
def unfinalize_event(event_id: int, db: DbDep, admin: AdminDep) -> dict:
    """Revierte la finalización del evento: limpia final_positions.

    NO revierte automáticamente la EXP ya acreditada — eso requiere acción manual
    (admin debe restar manualmente vía exp.adjust si quiere). El evento queda
    re-finalizable: una nueva llamada a /finalize recalculará posiciones, pero
    award_event_exp es idempotente por related_event_id (no doble pago).

    Use case: admin reportó un match mal, ya finalizó, quiere corregirlo.
    """
    result = tour_svc.unfinalize_event(db, event_id=event_id)

    # Audit log para trazabilidad
    try:
        from app.services import audit
        audit.log(
            db, admin_id=admin.id, action="event.unfinalize",
            guild_id=getattr(db.get(Event, event_id), "guild_id", None),
            target_kind="event", target_id=event_id,
            payload={"positions_cleared": result["positions_cleared"]},
        )
    except Exception:
        log.exception("audit log failed on unfinalize event %s", event_id)
    db.commit()
    return result


# ============================== Games ==============================


games_router = APIRouter()


@games_router.get("", response_model=list[GameOut])
def list_games(db: DbDep) -> list[Game]:
    return list(db.scalars(select(Game).where(Game.is_active == True).order_by(Game.name)))


@games_router.get("/{game_id}/formats", response_model=list[GameFormatOut])
def list_formats_public(game_id: int, db: DbDep) -> list[GameFormat]:
    """Formatos activos de un juego — público (decks/eventos lo consultan)."""
    return list(
        db.scalars(
            select(GameFormat)
            .where(GameFormat.game_id == game_id, GameFormat.is_active.is_(True))
            .order_by(GameFormat.sort_order, GameFormat.name)
        )
    )


@games_router.get("/{game_id}/sets", response_model=list[GameSetOut])
def list_sets_public(game_id: int, db: DbDep) -> list[GameSet]:
    """Sets activos de un juego — público."""
    return list(
        db.scalars(
            select(GameSet)
            .where(GameSet.game_id == game_id, GameSet.is_active.is_(True))
            .order_by(GameSet.released_at.desc().nulls_last(), GameSet.name)
        )
    )
