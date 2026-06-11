from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import AttendanceStatus, Base, PaymentStatus, TimestampMixin


class EventRegistration(Base, TimestampMixin):
    __tablename__ = "event_registrations"
    __table_args__ = (
        UniqueConstraint("event_id", "player_id", name="uq_event_reg_unique"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), nullable=False, index=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id"), nullable=False, index=True
    )
    # Deck que el jugador trae al evento. Opcional al inscribirse (lo puede
    # asociar después). Una vez que el evento empieza, el deck queda locked.
    deck_id: Mapped[int | None] = mapped_column(
        ForeignKey("player_decks.id", ondelete="SET NULL"), index=True
    )

    payment_status: Mapped[PaymentStatus] = mapped_column(
        Enum(PaymentStatus, name="payment_status"), default=PaymentStatus.PENDING, nullable=False
    )
    attendance_status: Mapped[AttendanceStatus] = mapped_column(
        Enum(AttendanceStatus, name="attendance_status"),
        default=AttendanceStatus.PENDING,
        nullable=False,
    )

    # Posición final en el evento (1 = campeón). Null mientras el evento no termina.
    final_position: Mapped[int | None] = mapped_column(Integer)
    rounds_won: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rounds_lost: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rounds_draw: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Game wins / losses (para tiebreaker GW%).
    games_won: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    games_lost: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Match points cacheados (3 por win, 1 por draw, 0 por loss).
    match_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    # Si el jugador droppea, deja de generar pairings.
    dropped: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    dropped_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    registered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Check-in
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    checkin_method: Mapped[str | None] = mapped_column(String(20))  # qr | manual | self
    checkin_token: Mapped[str | None] = mapped_column(String(40))

    # Trazabilidad de pago MercadoPago
    mp_preference_id: Mapped[str | None] = mapped_column(String(80))
    mp_payment_id: Mapped[str | None] = mapped_column(String(80))
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Cupo reservado hasta esta fecha si el evento es pago. NULL = sin expiración
    # (evento gratis o ya pagado). Scheduler libera los vencidos.
    payment_expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    # Recordatorio "te quedan 2h para pagar" — enviado 1 sola vez
    payment_reminder_sent: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
