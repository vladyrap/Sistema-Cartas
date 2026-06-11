"""Lista de espera de eventos llenos.

Cuando se libera un cupo (expiración de pago, cancelación de inscripción),
el primero de la cola se promueve automáticamente a EventRegistration y se
le notifica. FIFO por created_at.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Index, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class EventWaitlist(Base, TimestampMixin):
    __tablename__ = "event_waitlist"
    __table_args__ = (
        UniqueConstraint("event_id", "player_id", name="uq_waitlist_unique"),
        Index("ix_waitlist_event_pending", "event_id", "promoted_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # NULL = sigue esperando. Seteado = ya fue promovido a registration.
    promoted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
