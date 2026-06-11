"""Tournament Universe — Predictions, Rivalries, Hype, Achievements, Storylines.

Conjunto de modelos para mecánicas "exponenciales" de torneos competitivos:
predicciones con EXP, sistema de rivalidades auto-detect, feed live tipo
Twitter, logros desbloqueables y narrativas IA al cerrar evento.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String,
    Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


# ═══════════════════════════════════════════════════════════════════════
# 1. PREDICTIONS MARKET — apuestas EXP sobre quién gana matches/torneo
# ═══════════════════════════════════════════════════════════════════════


class TournamentPrediction(Base, TimestampMixin):
    """Una apuesta de un jugador sobre el resultado de un match o el campeón.

    target_kind = 'match' → predicted_target_id = match_id, predicted_winner_id = jugador
    target_kind = 'champion' → predicted_target_id = event_id, predicted_winner_id = jugador

    Se puede apostar hasta `closed_at` (al inicio del match para 'match'; al
    cierre del swiss para 'champion'). El payout se calcula al final:
      pool_total = sum(stake_exp) de todos los predictores correctos
      payout(yo) = (mi_stake / pool_correctos) * pool_total
    """
    __tablename__ = "tournament_predictions"
    __table_args__ = (
        # Un jugador no puede apostar 2× al mismo target — modificable via update
        UniqueConstraint("event_id", "bettor_player_id", "target_kind", "predicted_target_id",
                         name="uq_pred_bettor_target"),
        CheckConstraint("target_kind IN ('match', 'champion')", name="ck_pred_target_kind"),
        CheckConstraint("stake_exp > 0 AND stake_exp <= 5000", name="ck_pred_stake_range"),
        Index("ix_pred_event_target", "event_id", "target_kind", "predicted_target_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    bettor_player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )

    target_kind: Mapped[str] = mapped_column(String(20), nullable=False)
    predicted_target_id: Mapped[int] = mapped_column(Integer, nullable=False)  # match_id o event_id
    predicted_winner_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False
    )

    stake_exp: Mapped[int] = mapped_column(Integer, nullable=False)
    odds_at_bet: Mapped[float | None] = mapped_column()  # float — implied odds en el momento de la apuesta

    settled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    payout_exp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_winner: Mapped[bool | None] = mapped_column(Boolean)  # null = no settled, true/false post-settle


# ═══════════════════════════════════════════════════════════════════════
# 2. RIVALRIES — pares de jugadores que se han enfrentado N veces
# ═══════════════════════════════════════════════════════════════════════


class PlayerRivalry(Base, TimestampMixin):
    """Rivalidad entre 2 jugadores — actualizada en cada match.

    player_low_id < player_high_id para evitar pares duplicados.
    intensity_score: heurística — más matches recientes + más balanceados = mayor.
    """
    __tablename__ = "player_rivalries"
    __table_args__ = (
        UniqueConstraint("player_low_id", "player_high_id", name="uq_rivalry_pair"),
        CheckConstraint("player_low_id < player_high_id", name="ck_rivalry_ordered"),
        Index("ix_rivalry_intensity", "intensity_score"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    player_low_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False
    )
    player_high_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False
    )
    matches_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    wins_low: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    wins_high: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    draws: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_match_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_event_id: Mapped[int | None] = mapped_column(Integer)
    intensity_score: Mapped[float] = mapped_column(default=0.0, nullable=False)


# ═══════════════════════════════════════════════════════════════════════
# 3. HYPE FEED — Twitter-like del evento
# ═══════════════════════════════════════════════════════════════════════


class TournamentHypeEvent(Base, TimestampMixin):
    """Una entrada en el feed de hype del evento — admin posts + jugadores
    pueden reaccionar (likes count en `reactions_count`)."""
    __tablename__ = "tournament_hype_events"
    __table_args__ = (
        CheckConstraint("kind IN ('admin_post', 'match_highlight', 'rivalry_alert', 'system')",
                        name="ck_hype_kind"),
        Index("ix_hype_event_created", "event_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    kind: Mapped[str] = mapped_column(String(30), nullable=False)
    author_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    content: Mapped[str] = mapped_column(Text, nullable=False)
    image_url: Mapped[str | None] = mapped_column(String(800))
    reactions_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class TournamentHypeReaction(Base, TimestampMixin):
    """Un usuario reaccionó (like) a una entrada del feed."""
    __tablename__ = "tournament_hype_reactions"
    __table_args__ = (
        UniqueConstraint("hype_event_id", "user_id", name="uq_hype_reaction_unique"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    hype_event_id: Mapped[int] = mapped_column(
        ForeignKey("tournament_hype_events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    emoji: Mapped[str] = mapped_column(String(8), default="🔥", nullable=False)


# ═══════════════════════════════════════════════════════════════════════
# 4. ACHIEVEMENTS — logros desbloqueables durante el torneo
# ═══════════════════════════════════════════════════════════════════════


class TournamentAchievement(Base, TimestampMixin):
    """Un jugador desbloqueó un achievement en un evento específico.

    achievement_key referencia la tabla estática en services/tournament_universe.py
    (no es una FK porque las definiciones viven en código, no en DB).
    """
    __tablename__ = "tournament_achievements"
    __table_args__ = (
        UniqueConstraint("event_id", "player_id", "achievement_key",
                         name="uq_tour_achievement_unique"),
        Index("ix_tour_ach_player", "player_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    achievement_key: Mapped[str] = mapped_column(String(60), nullable=False)
    unlocked_round: Mapped[int | None] = mapped_column(Integer)  # ronda en la que se desbloqueó
    extra_data: Mapped[str | None] = mapped_column(Text)  # JSON freeform — opponent_id, score, etc.


# ═══════════════════════════════════════════════════════════════════════
# 5. STORYLINE — narrativa IA generada al cerrar evento
# ═══════════════════════════════════════════════════════════════════════


class TournamentStoryline(Base, TimestampMixin):
    """Narrativa épica del evento generada por Claude.

    Se genera 1× al finalizar el evento. El usuario admin puede regenerar
    explícitamente — entonces se reemplaza el contenido.
    """
    __tablename__ = "tournament_storylines"
    __table_args__ = (
        UniqueConstraint("event_id", name="uq_storyline_event"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str | None] = mapped_column(String(200))
    narrative: Mapped[str] = mapped_column(Text, nullable=False)
    champion_player_id: Mapped[int | None] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="SET NULL")
    )
    generated_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    model_used: Mapped[str | None] = mapped_column(String(60))
    is_published: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
