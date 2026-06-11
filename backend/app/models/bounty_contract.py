"""BountyContract — cualquier jugador pone EXP de su bolsillo como precio
sobre la cabeza de otro. Quien le venza en evento oficial cobra."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class BountyContract(Base, TimestampMixin):
    __tablename__ = "bounty_contracts"

    id: Mapped[int] = mapped_column(primary_key=True)
    sponsor_player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    target_player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    season_id: Mapped[int] = mapped_column(ForeignKey("seasons.id", ondelete="CASCADE"), nullable=False, index=True)
    exp_offered: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN", index=True)
    # OPEN, CLAIMED, CANCELLED, EXPIRED
    message: Mapped[str | None] = mapped_column(String(280))
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    claimed_by_player_id: Mapped[int | None] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="SET NULL"), index=True,
    )
    claimed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    claimed_match_id: Mapped[int | None] = mapped_column(ForeignKey("match_results.id", ondelete="SET NULL"))
