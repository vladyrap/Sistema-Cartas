"""Resultado puntual de una partida/ronda dentro de un evento."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class MatchResult(Base, TimestampMixin):
    """Una partida emparejada de Suizo o bracket dentro de un evento.

    Convención de score: games_a / games_b son juegos ganados (0-2 en BO3,
    0-3 en BO5). Si player_b_id es NULL → bye (player_a gana automáticamente
    el match, games_a=2, games_b=0).
    """

    __tablename__ = "match_results"
    __table_args__ = (
        # Cada (event, round, player) aparece máximo 1 vez: 1 jugador no juega 2 mesas en la misma ronda.
        UniqueConstraint("event_id", "round_number", "player_a_id", name="uq_match_event_round_pa"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), nullable=False, index=True)
    round_number: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    # Número de mesa (1..N) — útil para mostrar pairings al juez/jugadores.
    table_number: Mapped[int | None] = mapped_column(Integer)

    player_a_id: Mapped[int] = mapped_column(ForeignKey("player_profiles.id"), nullable=False)
    player_b_id: Mapped[int | None] = mapped_column(ForeignKey("player_profiles.id"))
    winner_id: Mapped[int | None] = mapped_column(ForeignKey("player_profiles.id"))
    is_draw: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_bye: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    games_a: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    games_b: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Reporte: quién lo reportó y cuándo (para detectar conflictos).
    reported_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    reported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    notes: Mapped[str | None] = mapped_column(String(500))
