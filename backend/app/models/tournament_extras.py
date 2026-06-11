"""Modelos para robustez avanzada de torneos.

Cubre:
  - MatchReport: reporte previo a confirmación (player → opp confirms)
  - MatchDispute: cuando reportes difieren, dispute abierto hasta resolución
  - RoundTimer: server-side timer por ronda (start/pause/extend)
  - EventRatingSnapshot: rating pre/post evento por (player, game)
  - EventPenalty: warnings, game_loss, match_loss
"""
from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, Integer, String, Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class MatchReport(Base, TimestampMixin):
    """Reporte de match por un jugador, pendiente de confirmación del rival.

    Flow:
      1. Jugador A reporta → status=PENDING_CONFIRMATION
      2. Jugador B confirma con mismos datos → match_result se actualiza, report.status=CONFIRMED
      3. Si B reporta distinto → se abre MatchDispute, report.status=DISPUTED
      4. Si pasan X minutos sin respuesta → admin debe resolver manualmente
      5. Admin puede override en cualquier momento → report.status=ADMIN_OVERRIDE
    """
    __tablename__ = "match_reports"
    __table_args__ = (
        UniqueConstraint("match_id", "reporter_player_id", name="uq_match_report_reporter"),
        CheckConstraint(
            "status IN ('PENDING_CONFIRMATION', 'CONFIRMED', 'DISPUTED', 'ADMIN_OVERRIDE', 'CANCELLED')",
            name="ck_match_report_status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(
        ForeignKey("match_results.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    reporter_player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    claimed_winner_id: Mapped[int | None] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="SET NULL"),
    )
    claimed_is_draw: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    claimed_games_a: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    claimed_games_b: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="PENDING_CONFIRMATION", index=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    confirmed_by_player_id: Mapped[int | None] = mapped_column(ForeignKey("player_profiles.id", ondelete="SET NULL"))
    notes: Mapped[str | None] = mapped_column(String(500))


class MatchDispute(Base, TimestampMixin):
    """Disputa abierta cuando dos reportes difieren o un jugador disputa el reporte.

    Solo admin (juez) puede resolver. La resolución actualiza el match_result final.
    """
    __tablename__ = "match_disputes"
    __table_args__ = (
        CheckConstraint(
            "status IN ('OPEN', 'RESOLVED', 'ESCALATED', 'CLOSED_NO_RESOLUTION')",
            name="ck_dispute_status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    match_id: Mapped[int] = mapped_column(
        ForeignKey("match_results.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    opened_by_player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False,
    )
    reason: Mapped[str] = mapped_column(String(280), nullable=False)
    status: Mapped[str] = mapped_column(String(30), nullable=False, default="OPEN", index=True)
    resolved_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    resolution_notes: Mapped[str | None] = mapped_column(Text)
    # Resolución final (lo que el juez decretó)
    final_winner_id: Mapped[int | None] = mapped_column(ForeignKey("player_profiles.id", ondelete="SET NULL"))
    final_is_draw: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    final_games_a: Mapped[int | None] = mapped_column(Integer)
    final_games_b: Mapped[int | None] = mapped_column(Integer)


class RoundTimer(Base, TimestampMixin):
    """Timer server-side por ronda de un evento. Admin lo arranca, scheduler lo cierra."""
    __tablename__ = "round_timers"
    __table_args__ = (
        UniqueConstraint("event_id", "round_number", name="uq_round_timer_event_round"),
        CheckConstraint(
            "status IN ('SCHEDULED', 'RUNNING', 'PAUSED', 'FINISHED', 'EXTENDED')",
            name="ck_round_timer_status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    round_number: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=50)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    ends_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    paused_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paused_remaining_seconds: Mapped[int | None] = mapped_column(Integer)
    extended_minutes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="SCHEDULED")


class EventRatingSnapshot(Base, TimestampMixin):
    """Snapshot de rating Glicko-2 al iniciar y finalizar el evento. Permite mostrar delta."""
    __tablename__ = "event_rating_snapshots"
    __table_args__ = (
        UniqueConstraint("event_id", "player_id", "game_id", name="uq_event_rating_snap"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    game_id: Mapped[int] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    pre_rating: Mapped[float] = mapped_column(nullable=False)
    pre_rd: Mapped[float] = mapped_column(nullable=False)
    pre_volatility: Mapped[float] = mapped_column(nullable=False)
    pre_matches_played: Mapped[int] = mapped_column(Integer, nullable=False)
    snapshotted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Post (al finalizar)
    post_rating: Mapped[float | None] = mapped_column()
    post_rd: Mapped[float | None] = mapped_column()
    post_volatility: Mapped[float | None] = mapped_column()
    post_matches_played: Mapped[int | None] = mapped_column(Integer)
    finalized_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class EventPenalty(Base, TimestampMixin):
    """Penalty aplicada por admin durante un evento.

    kind: warning, game_loss, match_loss, disqualification
    severity: warning < minor < major < dq
    """
    __tablename__ = "event_penalties"
    __table_args__ = (
        CheckConstraint(
            "kind IN ('warning', 'game_loss', 'match_loss', 'disqualification')",
            name="ck_penalty_kind",
        ),
        CheckConstraint(
            "severity IN ('warning', 'minor', 'major', 'dq')",
            name="ck_penalty_severity",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    match_id: Mapped[int | None] = mapped_column(ForeignKey("match_results.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    severity: Mapped[str] = mapped_column(String(20), nullable=False, default="warning")
    reason: Mapped[str] = mapped_column(String(280), nullable=False)
    applied_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    rescinded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    rescinded_reason: Mapped[str | None] = mapped_column(String(280))
