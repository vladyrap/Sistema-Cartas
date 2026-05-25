from __future__ import annotations

from sqlalchemy import Enum, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, RankName, TimestampMixin


class SeasonHistory(Base, TimestampMixin):
    """Snapshot inmutable del rendimiento de un jugador al cierre de una temporada.

    Esto es lo que sobrevive entre temporadas. Se crea cuando admin cierra la temporada.
    `final_position` es el ranking final (1 = campeón general de la temporada, etc.).
    """

    __tablename__ = "season_history"
    __table_args__ = (
        UniqueConstraint("season_id", "player_id", name="uq_season_history_unique"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    season_id: Mapped[int] = mapped_column(ForeignKey("seasons.id"), nullable=False, index=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id"), nullable=False, index=True
    )

    final_level: Mapped[int] = mapped_column(Integer, nullable=False)
    final_exp_total: Mapped[int] = mapped_column(Integer, nullable=False)
    max_rank: Mapped[RankName] = mapped_column(Enum(RankName, name="rank_name", create_type=False), nullable=False)

    final_position: Mapped[int | None] = mapped_column(Integer)  # 1, 2, 3… (puede ser null si no participó activo)
    prestige_earned: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
