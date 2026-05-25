from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PrestigeTransaction(Base, TimestampMixin):
    """Auditoría del Prestigio histórico ganado. Se aplica al CERRAR la temporada."""

    __tablename__ = "prestige_transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id"), nullable=False, index=True
    )
    season_id: Mapped[int] = mapped_column(ForeignKey("seasons.id"), nullable=False, index=True)

    amount: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(120), nullable=False)
    reason_code: Mapped[str] = mapped_column(String(40), nullable=False)
    # Códigos: "season_participation", "reached_level_10", "reached_level_20",
    # "reached_level_30", "top_8_season", "season_champion", "admin_adjust"
