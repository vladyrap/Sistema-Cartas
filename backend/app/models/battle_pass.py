"""Battle Pass competitivo — temporadas con tracks free/premium, milestones por
matches/wins/torneos, recompensas (boosts EXP, cosméticos, freeze days).

Modelo:
  BattlePass         → 1 por temporada
  BattlePassTier     → 50 niveles del pase (tier_number 1-50)
  BattlePassReward   → 1 free + 1 premium por tier
  BattlePassProgress → progreso del jugador (XP acumulada + tiers claimed)

Cómo se gana XP del pase: matches reportados + wins + torneos + duels + etc.
Cada tier requiere ~1000 XP del pase (configurable).
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String,
    Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class BattlePass(Base, TimestampMixin):
    __tablename__ = "battle_passes"
    __table_args__ = (
        UniqueConstraint("season_id", name="uq_battle_pass_season"),
        CheckConstraint("max_tier > 0 AND max_tier <= 200", name="ck_bp_max_tier"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    season_id: Mapped[int] = mapped_column(
        ForeignKey("seasons.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False, default="Pase Competitivo")
    description: Mapped[str | None] = mapped_column(Text)
    cover_image_url: Mapped[str | None] = mapped_column(String(800))
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    max_tier: Mapped[int] = mapped_column(Integer, default=50, nullable=False)
    xp_per_tier: Mapped[int] = mapped_column(Integer, default=1000, nullable=False)
    premium_price_clp: Mapped[int] = mapped_column(Integer, default=4990, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class BattlePassTier(Base, TimestampMixin):
    """Un tier del pase. Tiene hasta 2 rewards: free + premium."""
    __tablename__ = "battle_pass_tiers"
    __table_args__ = (
        UniqueConstraint("battle_pass_id", "tier_number", name="uq_bp_tier_number"),
        CheckConstraint("tier_number >= 1", name="ck_bp_tier_positive"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    battle_pass_id: Mapped[int] = mapped_column(
        ForeignKey("battle_passes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    tier_number: Mapped[int] = mapped_column(Integer, nullable=False)
    # Reward Free
    free_reward_kind: Mapped[str | None] = mapped_column(String(40))  # exp_boost | freeze_days | exp | cosmetic | nothing
    free_reward_amount: Mapped[int | None] = mapped_column(Integer)
    free_reward_label: Mapped[str | None] = mapped_column(String(120))
    free_reward_image_url: Mapped[str | None] = mapped_column(String(800))
    # Reward Premium
    premium_reward_kind: Mapped[str | None] = mapped_column(String(40))
    premium_reward_amount: Mapped[int | None] = mapped_column(Integer)
    premium_reward_label: Mapped[str | None] = mapped_column(String(120))
    premium_reward_image_url: Mapped[str | None] = mapped_column(String(800))


class BattlePassProgress(Base, TimestampMixin):
    """Progreso de un jugador en el pase de una temporada."""
    __tablename__ = "battle_pass_progress"
    __table_args__ = (
        UniqueConstraint("battle_pass_id", "player_id", name="uq_bp_progress_unique"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    battle_pass_id: Mapped[int] = mapped_column(
        ForeignKey("battle_passes.id", ondelete="CASCADE"), nullable=False, index=True
    )
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    bp_xp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    current_tier: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    is_premium: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    premium_purchased_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    # Claimed tiers — JSON list de tier numbers ya reclamados, separadas por free/premium
    free_claimed_json: Mapped[str | None] = mapped_column(Text)
    premium_claimed_json: Mapped[str | None] = mapped_column(Text)
