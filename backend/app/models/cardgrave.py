"""Cardgrave — epitafios para cartas baneadas. Una entrada por carta enterrada."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CardgraveEntry(Base, TimestampMixin):
    __tablename__ = "cardgrave_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    card_name: Mapped[str] = mapped_column(String(160), unique=True, nullable=False, index=True)
    banlist_entry_id: Mapped[int | None] = mapped_column(
        ForeignKey("banlist_entries.id", ondelete="SET NULL"), index=True,
    )
    epitaph: Mapped[str] = mapped_column(Text, nullable=False)
    buried_year: Mapped[int | None] = mapped_column(Integer)
    buried_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    visit_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
