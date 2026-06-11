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
    # Freeze: ranked decay no aplica mientras esté frozen (un budget de días)
    freeze_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Promotion series: cuando el rating cruza el threshold superior del tier,
    # entra a una serie de 3 partidas. Si gana 2/3 → promueve. Si pierde 2/3 → no.
    promo_series_wins: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    promo_series_total: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    promo_series_target_tier: Mapped[str | None] = mapped_column(__import__('sqlalchemy').String(20))

    # Demotion shield: tras promoción, próxima loss no demuele (queda en lo justo del tier nuevo)
    demotion_shield_active: Mapped[bool] = mapped_column(default=False, nullable=False)

    # Trust score: interno (0.0 a 1.0). Empieza en 1.0, baja con disputas/penalties/no-shows.
    trust_score: Mapped[float] = mapped_column(Float, default=1.0, nullable=False)
