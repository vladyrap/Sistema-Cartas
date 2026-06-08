"""Sets / ediciones / expansiones por juego."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, Date, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class GameSet(Base, TimestampMixin):
    __tablename__ = "game_sets"
    __table_args__ = (
        UniqueConstraint("game_id", "code", name="uq_game_set_code"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    game_id: Mapped[int] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True
    )
    code: Mapped[str] = mapped_column(String(20), nullable=False)  # OP-01, SV01, BLB...
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    released_at: Mapped[datetime | None] = mapped_column(Date)
    total_cards: Mapped[int | None] = mapped_column(Integer)

    # Si el set rota fuera de Standard en una fecha conocida.
    rotates_out_at: Mapped[datetime | None] = mapped_column(Date)
    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
