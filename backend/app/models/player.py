from __future__ import annotations

from datetime import date
from typing import TYPE_CHECKING

from sqlalchemy import Date, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.models.base import Base, PlayerClass, TimestampMixin

if TYPE_CHECKING:
    from app.models.user import User


class PlayerProfile(Base, TimestampMixin):
    """Datos del jugador. 1:1 con User. Aloja credencial Elite ID y prestigio histórico."""

    __tablename__ = "player_profiles"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False
    )
    alias: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    full_name: Mapped[str | None] = mapped_column(String(120))
    avatar_url: Mapped[str | None] = mapped_column(String(500))
    bio: Mapped[str | None] = mapped_column(Text)
    birthdate: Mapped[date | None] = mapped_column(Date)
    player_class: Mapped[PlayerClass] = mapped_column(
        Enum(PlayerClass, name="player_class"), default=PlayerClass.DUELISTA, nullable=False
    )

    # Elite ID — número único legible
    elite_id_code: Mapped[str] = mapped_column(String(20), unique=True, index=True, nullable=False)
    elite_id_number: Mapped[int] = mapped_column(Integer, unique=True, nullable=False)

    # Prestigio histórico acumulado (NUNCA se reinicia)
    prestige: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    # Juego favorito (opcional)
    favorite_game_id: Mapped[int | None] = mapped_column(ForeignKey("games.id"))

    user: Mapped["User"] = relationship("User", back_populates="profile")
