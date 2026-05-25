"""Racha (streak) de asistencia a eventos por jugador y Gremio.

Concepto:
- Cada vez que un jugador es marcado ATTENDED en un evento, su streak puede
  incrementarse si la racha sigue "viva" (último evento ≤ STREAK_WINDOW_DAYS días).
- Si pasa más tiempo sin asistencia, la racha se resetea a 1.
- Hay un multiplicador EXP que crece con la racha.

La tabla es UNIQUE (player_id, guild_id) — una sola racha activa por jugador
en cada Gremio.
"""
from __future__ import annotations

from datetime import date, datetime

from sqlalchemy import Date, DateTime, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PlayerStreak(Base, TimestampMixin):
    __tablename__ = "player_streaks"
    __table_args__ = (
        UniqueConstraint("player_id", "guild_id", name="uq_streak_player_guild"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    guild_id: Mapped[int] = mapped_column(
        ForeignKey("guilds.id", ondelete="CASCADE"), nullable=False, index=True
    )
    current_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    longest_streak: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_attended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_attended_date: Mapped[date | None] = mapped_column(Date)
