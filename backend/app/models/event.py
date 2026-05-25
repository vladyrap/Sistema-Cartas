from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, EventStatus, EventType, TimestampMixin


class Event(Base, TimestampMixin):
    __tablename__ = "events"

    id: Mapped[int] = mapped_column(primary_key=True)
    guild_id: Mapped[int] = mapped_column(ForeignKey("guilds.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id"), nullable=False, index=True)
    season_id: Mapped[int | None] = mapped_column(ForeignKey("seasons.id"), index=True)

    event_type: Mapped[EventType] = mapped_column(Enum(EventType, name="event_type"), nullable=False)
    status: Mapped[EventStatus] = mapped_column(
        Enum(EventStatus, name="event_status"), default=EventStatus.DRAFT, nullable=False
    )

    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    slots: Mapped[int] = mapped_column(Integer, nullable=False, default=16)
    price_clp: Mapped[Decimal] = mapped_column(Numeric(10, 0), nullable=False, default=0)

    description: Mapped[str | None] = mapped_column(String(2000))
    rules: Mapped[str | None] = mapped_column(String(2000))
    prizes: Mapped[str | None] = mapped_column(String(2000))
