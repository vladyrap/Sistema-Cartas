"""Quantum Deck — pool de cartas que colapsa a deck final con un seed compartido."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class QuantumDeck(Base, TimestampMixin):
    __tablename__ = "quantum_decks"

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    pool_text: Mapped[str] = mapped_column(Text, nullable=False)  # 60-100 cartas potenciales
    target_size: Mapped[int] = mapped_column(Integer, nullable=False, default=40)
    seed_used: Mapped[str | None] = mapped_column(String(120))
    last_collapse_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    last_collapse_result: Mapped[str | None] = mapped_column(Text)  # decklist final
