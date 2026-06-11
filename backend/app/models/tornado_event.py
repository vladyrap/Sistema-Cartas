"""Tornado of Fate — un buff aleatorio diario para un jugador random del Gremio."""
from datetime import date as _date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class TornadoEvent(Base, TimestampMixin):
    __tablename__ = "tornado_events"

    id: Mapped[int] = mapped_column(primary_key=True)
    guild_id: Mapped[int] = mapped_column(ForeignKey("guilds.id", ondelete="CASCADE"), nullable=False, index=True)
    event_date: Mapped[_date] = mapped_column(Date, nullable=False, index=True)
    target_player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    buff_kind: Mapped[str] = mapped_column(String(40), nullable=False)
    buff_label: Mapped[str] = mapped_column(String(160), nullable=False)
    buff_payload: Mapped[str | None] = mapped_column(Text)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
