from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Title(Base, TimestampMixin):
    """Títulos honoríficos: 'Campeón T1', 'Mejor Mentor', etc."""

    __tablename__ = "titles"

    id: Mapped[int] = mapped_column(primary_key=True)
    guild_id: Mapped[int] = mapped_column(ForeignKey("guilds.id"), nullable=False, index=True)
    code: Mapped[str] = mapped_column(String(60), unique=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))


class PlayerTitle(Base, TimestampMixin):
    __tablename__ = "player_titles"
    __table_args__ = (
        UniqueConstraint("player_id", "title_id", "season_id", name="uq_player_title_season"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id"), nullable=False, index=True
    )
    title_id: Mapped[int] = mapped_column(ForeignKey("titles.id"), nullable=False, index=True)
    season_id: Mapped[int | None] = mapped_column(ForeignKey("seasons.id"))
    is_equipped: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
