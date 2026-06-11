"""Quest system — narrative quests with NPCs IA, tracker de progreso."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class QuestArc(Base, TimestampMixin):
    """Una saga (3-5 quests). Predefinidas, sembradas al boot."""
    __tablename__ = "quest_arcs"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(60), unique=True, nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    synopsis: Mapped[str] = mapped_column(Text, nullable=False)
    npc_name: Mapped[str] = mapped_column(String(80), nullable=False)
    npc_role: Mapped[str | None] = mapped_column(String(80))
    intro_narration: Mapped[str] = mapped_column(Text, nullable=False)
    outro_narration: Mapped[str] = mapped_column(Text, nullable=False)
    reward_exp: Mapped[int] = mapped_column(Integer, default=500, nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class QuestStep(Base, TimestampMixin):
    """Paso individual de un arc."""
    __tablename__ = "quest_steps"
    __table_args__ = (
        UniqueConstraint("arc_id", "step_number", name="uq_quest_step_arc_num"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    arc_id: Mapped[int] = mapped_column(
        ForeignKey("quest_arcs.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    step_number: Mapped[int] = mapped_column(Integer, nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    narration: Mapped[str] = mapped_column(Text, nullable=False)
    requirement_kind: Mapped[str] = mapped_column(String(60), nullable=False)
    # win_match, play_match, win_with_archetype, attend_event, level_up, custom
    requirement_value: Mapped[str | None] = mapped_column(String(160))
    requirement_target: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    reward_exp: Mapped[int] = mapped_column(Integer, default=100, nullable=False)


class PlayerQuestProgress(Base, TimestampMixin):
    __tablename__ = "player_quest_progress"
    __table_args__ = (
        UniqueConstraint("player_id", "step_id", name="uq_player_quest_step"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    arc_id: Mapped[int] = mapped_column(
        ForeignKey("quest_arcs.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    step_id: Mapped[int] = mapped_column(
        ForeignKey("quest_steps.id", ondelete="CASCADE"), nullable=False, index=True,
    )
    progress: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
