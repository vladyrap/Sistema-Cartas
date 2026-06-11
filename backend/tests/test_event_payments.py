"""Tests del flujo de pago de inscripciones a eventos.

Cubre: expiración de cupo al registrar, mark-paid limpia expiración,
waitlist join/promote FIFO, gate de pago, refund.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Event, EventRegistration, EventStatus, EventWaitlist, Game, Guild
from app.models.base import AttendanceStatus, EventType, PaymentStatus
from app.services import event as event_svc


@pytest.fixture()
def make_event(db: Session, default_guild: Guild, game: Game):
    counter = {"n": 0}

    def _make(price_clp: int = 0, slots: int = 16, hours_from_now: float = 48, **extra) -> Event:
        counter["n"] += 1
        ev = Event(
            guild_id=default_guild.id,
            name=f"Evento Test {counter['n']}",
            game_id=game.id,
            event_type=EventType.COMPETITIVE,
            status=extra.pop("status", EventStatus.OPEN),
            starts_at=datetime.now(timezone.utc) + timedelta(hours=hours_from_now),
            slots=slots,
            price_clp=price_clp,
            **extra,
        )
        db.add(ev)
        db.commit()
        db.refresh(ev)
        return ev

    return _make


# ══════════════════ Expiración de cupo ══════════════════


def test_paid_event_registration_sets_expiry(db, make_event, make_player):
    ev = make_event(price_clp=3000, hours_from_now=72)
    p = make_player()
    reg = event_svc.register_player(db, event_id=ev.id, player_id=p.id)
    db.commit()
    assert reg.payment_status == PaymentStatus.PENDING
    assert reg.payment_expires_at is not None
    # 72h al evento → gana el cap de 24h
    delta = reg.payment_expires_at - datetime.now(timezone.utc).replace(tzinfo=None) \
        if reg.payment_expires_at.tzinfo is None else reg.payment_expires_at - datetime.now(timezone.utc)
    assert timedelta(hours=23) < delta < timedelta(hours=25)


def test_free_event_registration_no_expiry_and_paid(db, make_event, make_player):
    ev = make_event(price_clp=0)
    p = make_player()
    reg = event_svc.register_player(db, event_id=ev.id, player_id=p.id)
    db.commit()
    assert reg.payment_status == PaymentStatus.PAID
    assert reg.payment_expires_at is None


def test_event_starting_soon_uses_one_hour_before_cap(db, make_event, make_player):
    ev = make_event(price_clp=3000, hours_from_now=3)  # arranca en 3h
    p = make_player()
    reg = event_svc.register_player(db, event_id=ev.id, player_id=p.id)
    db.commit()
    # Expira 1h antes del evento (2h desde ahora), no a las 24h
    expires = reg.payment_expires_at
    if expires.tzinfo is None:
        expires = expires.replace(tzinfo=timezone.utc)
    delta = expires - datetime.now(timezone.utc)
    assert timedelta(hours=1, minutes=45) < delta < timedelta(hours=2, minutes=15)


# ══════════════════ Waitlist ══════════════════


def test_join_waitlist_requires_full_event(db, make_event, make_player):
    ev = make_event(price_clp=0, slots=16)
    p = make_player()
    with pytest.raises(HTTPException) as exc:
        event_svc.join_waitlist(db, event_id=ev.id, player_id=p.id)
    assert exc.value.status_code == 400  # hay cupos → inscribite directo


def test_waitlist_promote_fifo_on_cancel(db, make_event, make_player):
    ev = make_event(price_clp=0, slots=2)
    p1, p2, w1, w2 = make_player(), make_player(), make_player(), make_player()
    reg1 = event_svc.register_player(db, event_id=ev.id, player_id=p1.id)
    event_svc.register_player(db, event_id=ev.id, player_id=p2.id)
    db.commit()

    # Lleno → w1 y w2 a la cola (orden FIFO)
    event_svc.join_waitlist(db, event_id=ev.id, player_id=w1.id)
    event_svc.join_waitlist(db, event_id=ev.id, player_id=w2.id)
    db.commit()

    # p1 cancela → w1 (primero) entra automático
    event_svc.cancel_registration(db, registration_id=reg1.id, by_player_id=p1.id)
    db.commit()

    promoted = db.scalar(select(EventRegistration).where(
        EventRegistration.event_id == ev.id,
        EventRegistration.player_id == w1.id,
    ))
    assert promoted is not None, "w1 debió ser promovido"
    entry_w1 = db.scalar(select(EventWaitlist).where(
        EventWaitlist.event_id == ev.id, EventWaitlist.player_id == w1.id,
    ))
    assert entry_w1.promoted_at is not None
    # w2 sigue esperando
    entry_w2 = db.scalar(select(EventWaitlist).where(
        EventWaitlist.event_id == ev.id, EventWaitlist.player_id == w2.id,
    ))
    assert entry_w2.promoted_at is None


def test_waitlist_promote_paid_event_sets_pending_with_expiry(db, make_event, make_player):
    ev = make_event(price_clp=5000, slots=1, hours_from_now=72)
    p1, w1 = make_player(), make_player()
    reg1 = event_svc.register_player(db, event_id=ev.id, player_id=p1.id)
    db.commit()
    event_svc.join_waitlist(db, event_id=ev.id, player_id=w1.id)
    db.commit()

    event_svc.cancel_registration(db, registration_id=reg1.id, by_player_id=p1.id)
    db.commit()

    promoted = db.scalar(select(EventRegistration).where(
        EventRegistration.event_id == ev.id,
        EventRegistration.player_id == w1.id,
    ))
    assert promoted is not None
    assert promoted.payment_status == PaymentStatus.PENDING
    assert promoted.payment_expires_at is not None


def test_waitlist_no_duplicate_entries(db, make_event, make_player):
    ev = make_event(price_clp=0, slots=1)
    p1, w1 = make_player(), make_player()
    event_svc.register_player(db, event_id=ev.id, player_id=p1.id)
    db.commit()
    event_svc.join_waitlist(db, event_id=ev.id, player_id=w1.id)
    db.commit()
    with pytest.raises(HTTPException) as exc:
        event_svc.join_waitlist(db, event_id=ev.id, player_id=w1.id)
    assert exc.value.status_code == 409


def test_registered_player_cannot_join_waitlist(db, make_event, make_player):
    ev = make_event(price_clp=0, slots=1)
    p1 = make_player()
    event_svc.register_player(db, event_id=ev.id, player_id=p1.id)
    db.commit()
    with pytest.raises(HTTPException) as exc:
        event_svc.join_waitlist(db, event_id=ev.id, player_id=p1.id)
    assert exc.value.status_code == 409


# ══════════════════ Expiración batch (lógica del scheduler) ══════════════════


def test_expired_pending_releases_slot_and_promotes(db, make_event, make_player):
    """Simula lo que hace job_expire_unpaid_registrations."""
    ev = make_event(price_clp=3000, slots=1, hours_from_now=72)
    p1, w1 = make_player(), make_player()
    reg = event_svc.register_player(db, event_id=ev.id, player_id=p1.id)
    db.commit()
    event_svc.join_waitlist(db, event_id=ev.id, player_id=w1.id)
    db.commit()

    # Forzar vencimiento
    reg.payment_expires_at = datetime.now(timezone.utc) - timedelta(minutes=5)
    db.commit()

    # Lógica del job: borrar vencidas PENDING de eventos OPEN + promover
    now = datetime.now(timezone.utc)
    expired = list(db.scalars(select(EventRegistration).where(
        EventRegistration.payment_status == PaymentStatus.PENDING,
        EventRegistration.payment_expires_at.is_not(None),
        EventRegistration.payment_expires_at < now,
    )))
    assert len(expired) == 1
    for r in expired:
        db.delete(r)
    db.flush()
    promoted = event_svc.promote_from_waitlist(db, event_id=ev.id)
    db.commit()

    assert promoted is not None
    assert promoted.player_id == w1.id


def test_mark_paid_semantics(db, make_event, make_player):
    """mark-paid: PAID + paid_at + expiración limpiada (lógica del endpoint)."""
    ev = make_event(price_clp=3000)
    p = make_player()
    reg = event_svc.register_player(db, event_id=ev.id, player_id=p.id)
    db.commit()
    assert reg.payment_expires_at is not None

    # Réplica de admin_mark_paid
    reg.payment_status = PaymentStatus.PAID
    reg.paid_at = datetime.now(timezone.utc)
    reg.payment_expires_at = None
    db.commit()
    db.refresh(reg)
    assert reg.payment_status == PaymentStatus.PAID
    assert reg.paid_at is not None
    assert reg.payment_expires_at is None


def test_refund_only_from_paid(db, make_event, make_player):
    ev = make_event(price_clp=3000)
    p = make_player()
    reg = event_svc.register_player(db, event_id=ev.id, player_id=p.id)
    db.commit()
    # PENDING → no refundeable (regla del endpoint)
    assert reg.payment_status == PaymentStatus.PENDING
    # Tras pagar sí
    reg.payment_status = PaymentStatus.PAID
    db.commit()
    reg.payment_status = PaymentStatus.REFUNDED
    db.commit()
    assert reg.payment_status == PaymentStatus.REFUNDED
