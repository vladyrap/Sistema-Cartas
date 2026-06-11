"""Brain.io Mente Colectiva — polls live durante eventos."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class BrainPoll(Base, TimestampMixin):
    __tablename__ = "brain_polls"

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    match_id: Mapped[int | None] = mapped_column(ForeignKey("match_results.id", ondelete="SET NULL"), index=True)
    question: Mapped[str] = mapped_column(String(280), nullable=False)
    options_json: Mapped[str] = mapped_column(Text, nullable=False)  # JSON: ["opt A", "opt B", ...]
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="OPEN")  # OPEN, CLOSED
    closes_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class BrainVote(Base, TimestampMixin):
    __tablename__ = "brain_votes"
    __table_args__ = (
        UniqueConstraint("poll_id", "user_id", name="uq_brain_vote_poll_user"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    poll_id: Mapped[int] = mapped_column(ForeignKey("brain_polls.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    option_index: Mapped[int] = mapped_column(Integer, nullable=False)
