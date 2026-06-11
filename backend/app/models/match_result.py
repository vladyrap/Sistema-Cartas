"""Resultado puntual de una partida/ronda dentro de un evento."""
from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class MatchResult(Base, TimestampMixin):
    """Una partida emparejada de Suizo o bracket dentro de un evento.

    Convención de score: games_a / games_b son juegos ganados (0-2 en BO3,
    0-3 en BO5). Si player_b_id es NULL → bye (player_a gana automáticamente
    el match, games_a=2, games_b=0).

    Integridad:
      - UNIQUE(event_id, round_number, player_a_id) y por separado player_b_id:
        un jugador NO juega dos mesas en la misma ronda (independiente de A/B).
      - CHECK winner_id ∈ {player_a, player_b} o es NULL (draw/bye/sin reportar).
      - CHECK NOT (is_draw AND is_bye).
      - ON DELETE CASCADE en event_id: borrar evento borra sus matches.
    """

    __tablename__ = "match_results"
    __table_args__ = (
        UniqueConstraint("event_id", "round_number", "player_a_id", name="uq_match_event_round_pa"),
        UniqueConstraint("event_id", "round_number", "player_b_id", name="uq_match_event_round_pb"),
        CheckConstraint(
            "winner_id IS NULL OR winner_id = player_a_id OR winner_id = player_b_id",
            name="ck_winner_in_players",
        ),
        CheckConstraint(
            "NOT (is_draw AND is_bye)",
            name="ck_not_draw_and_bye",
        ),
        CheckConstraint(
            "games_a >= 0 AND games_b >= 0",
            name="ck_games_non_negative",
        ),
        # Índices para queries comunes: standings/tiebreakers y my-current-match
        Index("ix_match_event_pa", "event_id", "player_a_id"),
        Index("ix_match_event_pb", "event_id", "player_b_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    round_number: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    table_number: Mapped[int | None] = mapped_column(Integer)

    player_a_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False,
    )
    player_b_id: Mapped[int | None] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="SET NULL"),
    )
    winner_id: Mapped[int | None] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="SET NULL"),
    )
    is_draw: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    is_bye: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    games_a: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    games_b: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    reported_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    notes: Mapped[str | None] = mapped_column(String(500))

    # Intentional Draw — ambos players acuerdan empate (típico en last round Swiss)
    is_intentional_draw: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    id_consented_by_a: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    id_consented_by_b: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
