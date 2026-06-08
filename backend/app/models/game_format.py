"""Formatos de juego: Standard, Modern, Commander, Expanded, etc.

Cada Game tiene N formatos; cada Format define las reglas de deckbuilding
que se usan para validar PlayerDeck.list_text. Banlist se modela aparte
(BanlistEntry) porque cambia con frecuencia y conviene auditarla por carta.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class GameFormat(Base, TimestampMixin):
    __tablename__ = "game_formats"
    __table_args__ = (
        UniqueConstraint("game_id", "code", name="uq_game_format_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[int] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(40), nullable=False)  # STANDARD, MODERN, COMMANDER
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(String(500))

    # Reglas de deckbuilding (en cartas, no en puntos).
    min_main: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    max_main: Mapped[int | None] = mapped_column(Integer)  # null = mismo que min (deck de tamaño fijo)
    min_side: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_side: Mapped[int] = mapped_column(Integer, nullable=False, default=15)
    min_extra: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    max_extra: Mapped[int] = mapped_column(Integer, nullable=False, default=0)  # YGO: 15
    max_copies: Mapped[int] = mapped_column(Integer, nullable=False, default=4)

    # Reglas especiales.
    has_leader: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # One Piece
    is_singleton: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)  # Commander
    is_rotating: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    rotation_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
    sort_order: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
