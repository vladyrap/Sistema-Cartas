from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class MatchResult(Base, TimestampMixin):
    """Resultado puntual de una partida/ronda dentro de un evento.

    No necesariamente todos los eventos generan MatchResults — para torneos casuales
    basta con final_position. MatchResult sirve cuando se cargan rondas detalladas.
    """

    __tablename__ = "match_results"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id"), nullable=False, index=True)
    round_number: Mapped[int] = mapped_column(Integer, nullable=False)

    player_a_id: Mapped[int] = mapped_column(ForeignKey("player_profiles.id"), nullable=False)
    player_b_id: Mapped[int | None] = mapped_column(ForeignKey("player_profiles.id"))
    winner_id: Mapped[int | None] = mapped_column(ForeignKey("player_profiles.id"))

    notes: Mapped[str | None] = mapped_column(String(500))
