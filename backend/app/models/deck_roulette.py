"""DeckRouletteAssignment — un jugador acepta jugar un deck random durante N matches."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class DeckRouletteAssignment(Base, TimestampMixin):
    __tablename__ = "deck_roulette_assignments"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    archetype: Mapped[str] = mapped_column(String(80), nullable=False)
    game_id: Mapped[int | None] = mapped_column(ForeignKey("games.id", ondelete="SET NULL"))
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    wins: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    losses: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    draws: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    target_rounds: Mapped[int] = mapped_column(Integer, default=5, nullable=False)
    polyglot_awarded: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # 0/1
    notes: Mapped[str | None] = mapped_column(Text)
