"""Devotion — un jugador se vuelve devoto de un archetype al jugarlo.

devotion_points crecen automáticamente al reportar matches con ese archetype.
Los devotees también pueden hacer "ofrendas" de EXP al altar de su archetype.
"""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ArchetypeDevotion(Base, TimestampMixin):
    __tablename__ = "archetype_devotions"
    __table_args__ = (
        UniqueConstraint("player_id", "archetype", name="uq_devotion_player_archetype"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    archetype: Mapped[str] = mapped_column(String(80), nullable=False, index=True)
    devotion_points: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    offered_exp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    matches_played: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_played_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
