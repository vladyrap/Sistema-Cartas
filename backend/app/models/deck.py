"""Decks que el jugador registra para llevar a eventos.

Modelo simple: jugador tiene N decks por juego. Al inscribirse a un evento puede
asociar uno. Los stats por arquetipo se derivan de la relación con EventRegistration.
"""
from __future__ import annotations

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PlayerDeck(Base, TimestampMixin):
    __tablename__ = "player_decks"

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    archetype: Mapped[str | None] = mapped_column(String(80))  # "Aggro Red", "Control Blue", etc.
    list_text: Mapped[str | None] = mapped_column(Text)  # decklist crudo
    notes: Mapped[str | None] = mapped_column(Text)
