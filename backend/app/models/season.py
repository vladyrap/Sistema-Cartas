from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, SeasonStatus, TimestampMixin


class Season(Base, TimestampMixin):
    """Una temporada competitiva. Solo una puede estar ACTIVE a la vez."""

    __tablename__ = "seasons"
    __table_args__ = (
        UniqueConstraint("guild_id", "number", name="uq_season_guild_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    guild_id: Mapped[int] = mapped_column(ForeignKey("guilds.id"), nullable=False, index=True)
    number: Mapped[int] = mapped_column(nullable=False)  # T1, T2, T3... por Gremio
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[SeasonStatus] = mapped_column(
        Enum(SeasonStatus, name="season_status"), default=SeasonStatus.DRAFT, nullable=False
    )
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    # Referencia a la temporada inmediata anterior (para resolver "rango previo")
    previous_season_id: Mapped[int | None] = mapped_column(ForeignKey("seasons.id"))
    description: Mapped[str | None] = mapped_column(String(500))
