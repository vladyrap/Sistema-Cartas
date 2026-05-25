from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, UniqueConstraint
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

    registered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
