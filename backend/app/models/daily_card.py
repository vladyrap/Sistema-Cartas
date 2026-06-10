"""Card of the Day — una carta generada por IA por fecha. UNIQUE(card_date)."""
from __future__ import annotations

from datetime import date as _date

from sqlalchemy import Date, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class DailyCard(Base, TimestampMixin):
    __tablename__ = "daily_cards"

    id: Mapped[int] = mapped_column(primary_key=True)
    card_date: Mapped[_date] = mapped_column(Date, unique=True, nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    mana_cost: Mapped[str | None] = mapped_column(String(40))
    card_type: Mapped[str | None] = mapped_column(String(120))
    text: Mapped[str | None] = mapped_column(Text)
    flavor: Mapped[str | None] = mapped_column(Text)
    power: Mapped[str | None] = mapped_column(String(8))
    toughness: Mapped[str | None] = mapped_column(String(8))
    rarity: Mapped[str | None] = mapped_column(String(20))
    art_prompt: Mapped[str | None] = mapped_column(Text)
    color: Mapped[str | None] = mapped_column(String(20))  # primary color for theming
