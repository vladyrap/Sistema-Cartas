"""Rating Glicko-2 por jugador y juego.

Una entrada por (player, game) — un jugador tiene un rating distinto para MTG,
para Pokémon, etc. El sistema actualiza tras cada match reportado en un evento
ranked (event_type marcado COMPETITIVE/ELITE_CHALLENGE/FINAL_ELITE).

Defaults de Glicko-2 (vienen del paper original de Mark Glickman):
  - rating = 1500
  - rd (rating deviation) = 350
  - vol (volatility) = 0.06
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Float, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PlayerRating(Base, TimestampMixin):
    __tablename__ = "player_ratings"
    __table_args__ = (
        UniqueConstraint("player_id", "game_id", name="uq_player_rating_game"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    game_id: Mapped[int] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True
    )

    rating: Mapped[float] = mapped_column(Float, nullable=False, default=1500.0)
    rd: Mapped[float] = mapped_column(Float, nullable=False, default=350.0)
    volatility: Mapped[float] = mapped_column(Float, nullable=False, default=0.06)

    matches_played: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    last_match_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Pico histórico (para vanity / hall of fame).
    peak_rating: Mapped[float] = mapped_column(Float, nullable=False, default=1500.0)
