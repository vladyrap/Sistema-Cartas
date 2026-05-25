from __future__ import annotations

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, RankName, TimestampMixin


class SeasonProgress(Base, TimestampMixin):
    """Progreso del jugador en una temporada específica.

    Una fila por (player, season). Es el estado vivo de la temporada activa.
    Cuando la temporada se cierra, se conserva pero ya no se actualiza,
    y la información se mueve a SeasonHistory.
    """

    __tablename__ = "season_progress"
    __table_args__ = (
        UniqueConstraint("season_id", "player_id", name="uq_season_progress_unique"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    season_id: Mapped[int] = mapped_column(ForeignKey("seasons.id"), nullable=False, index=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id"), nullable=False, index=True
    )

    # Nivel inicial al comenzar la temporada (1 para Iniciado, 10 para promovidos).
    starting_level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)

    # ¿Comenzó como Duelista N10 por mérito anterior (Maestro/Campeón en T-1)?
    was_promoted_start: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Estado vivo de la temporada
    level: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    exp_in_level: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    exp_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Rango máximo alcanzado en ESTA temporada (snapshot por jugador, por temporada)
    max_rank: Mapped[RankName] = mapped_column(
        Enum(RankName, name="rank_name"), nullable=False, default=RankName.INICIADO
    )

    # Atajos pre-calculados (lo derivamos de level, pero lo cacheamos para queries rápidas)
    current_rank: Mapped[RankName] = mapped_column(
        Enum(RankName, name="rank_name", create_type=False),
        nullable=False,
        default=RankName.INICIADO,
    )
