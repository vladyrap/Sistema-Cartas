"""Eventos de pago — registro de cada notificación de MercadoPago.

Sirve como tabla de idempotency: si MercadoPago reintenta el webhook (lo hace
hasta que recibe 2xx) terminamos con la misma reserva marcada PAID múltiples
veces, mandando notif duplicadas. La constraint UNIQUE sobre idempotency_key
asegura que cada notificación se procesa una sola vez.

idempotency_key = x-request-id (header MP) OR fallback f"{payment_id}:{status}".
"""
from __future__ import annotations

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PaymentEvent(Base, TimestampMixin):
    __tablename__ = "payment_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    idempotency_key: Mapped[str] = mapped_column(String(120), unique=True, nullable=False, index=True)
    x_request_id: Mapped[str | None] = mapped_column(String(120))
    mp_payment_id: Mapped[str | None] = mapped_column(String(80), index=True)
    mp_payment_status: Mapped[str | None] = mapped_column(String(40))
    reservation_id: Mapped[int | None] = mapped_column(ForeignKey("reservations.id"), index=True)
    raw_body: Mapped[str | None] = mapped_column(Text)
