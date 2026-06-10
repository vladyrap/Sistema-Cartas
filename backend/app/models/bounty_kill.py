"""Registro de victorias sobre el campeón vigente (Bounty del Campeón).

Cada vez que el ranking #1 de una temporada pierde un match oficial, se inserta
una BountyKill. El killer gana EXP bonus + título "Regicida del Mes".
UNIQUE(killer_id, victim_id, match_id) para idempotency.
"""
from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class BountyKill(Base, TimestampMixin):
    __tablename__ = "bounty_kills"
    __table_args__ = (
        UniqueConstraint("killer_player_id", "victim_player_id", "match_id", name="uq_bounty_kill"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    killer_player_id: Mapped[int] = mapped_column(ForeignKey("player_profiles.id"), nullable=False, index=True)
    victim_player_id: Mapped[int] = mapped_column(ForeignKey("player_profiles.id"), nullable=False, index=True)
    season_id: Mapped[int] = mapped_column(ForeignKey("seasons.id"), nullable=False, index=True)
    event_id: Mapped[int | None] = mapped_column(ForeignKey("events.id"), index=True)
    match_id: Mapped[int] = mapped_column(ForeignKey("match_results.id"), nullable=False, index=True)
    exp_awarded: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
