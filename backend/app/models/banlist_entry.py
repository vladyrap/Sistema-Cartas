"""Entradas de banlist por formato. Una carta puede estar baneada/restringida
en un formato y libre en otro."""
from __future__ import annotations

from sqlalchemy import Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, BanlistStatus, TimestampMixin


class BanlistEntry(Base, TimestampMixin):
    __tablename__ = "banlist_entries"
    __table_args__ = (
        UniqueConstraint("format_id", "card_name_norm", name="uq_banlist_format_card"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    format_id: Mapped[int] = mapped_column(
        ForeignKey("game_formats.id", ondelete="CASCADE"), nullable=False, index=True
    )
    card_name: Mapped[str] = mapped_column(String(160), nullable=False)
    # Versión normalizada (lowercase, sin acentos/comas/apostrofes) para lookup.
    card_name_norm: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    status: Mapped[BanlistStatus] = mapped_column(
        Enum(BanlistStatus, name="banlist_status"), nullable=False, default=BanlistStatus.BANNED
    )
    notes: Mapped[str | None] = mapped_column(String(500))
