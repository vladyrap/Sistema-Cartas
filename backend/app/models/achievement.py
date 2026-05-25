from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Achievement(Base, TimestampMixin):
    """Catálogo de medallas/logros disponibles."""

    __tablename__ = "achievements"

    id: Mapped[int] = mapped_column(primary_key=True)
    guild_id: Mapped[int] = mapped_column(ForeignKey("guilds.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))
    icon: Mapped[str | None] = mapped_column(String(120))  # nombre de Lucide o ruta SVG
    is_seasonal: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_secret: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


class PlayerAchievement(Base, TimestampMixin):
    """Relación medalla ↔ jugador (otorgamiento). No se reinicia entre temporadas."""

    __tablename__ = "player_achievements"
    __table_args__ = (
        UniqueConstraint("player_id", "achievement_id", "season_id", name="uq_player_ach_season"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id"), nullable=False, index=True
    )
    achievement_id: Mapped[int] = mapped_column(
        ForeignKey("achievements.id"), nullable=False, index=True
    )
    season_id: Mapped[int | None] = mapped_column(ForeignKey("seasons.id"))

    earned_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    granted_by_admin_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
