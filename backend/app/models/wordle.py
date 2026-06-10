"""Card Wordle — adivina la carta del día con 6 intentos."""
from datetime import date as _date

from sqlalchemy import Date, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class WordlePuzzle(Base, TimestampMixin):
    __tablename__ = "wordle_puzzles"

    id: Mapped[int] = mapped_column(primary_key=True)
    puzzle_date: Mapped[_date] = mapped_column(Date, unique=True, nullable=False, index=True)
    answer_name: Mapped[str] = mapped_column(String(120), nullable=False)
    mana_cost: Mapped[str | None] = mapped_column(String(40))
    cmc: Mapped[int | None] = mapped_column(Integer)
    colors_csv: Mapped[str | None] = mapped_column(String(20))  # "W,U" etc.
    type_line: Mapped[str | None] = mapped_column(String(200))
    set_code: Mapped[str | None] = mapped_column(String(20))
    rarity: Mapped[str | None] = mapped_column(String(20))
    image_url: Mapped[str | None] = mapped_column(String(500))


class WordleAttempt(Base, TimestampMixin):
    __tablename__ = "wordle_attempts"
    __table_args__ = (
        UniqueConstraint("user_id", "puzzle_date", "attempt_num", name="uq_wordle_attempt"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    puzzle_date: Mapped[_date] = mapped_column(Date, nullable=False, index=True)
    attempt_num: Mapped[int] = mapped_column(Integer, nullable=False)  # 1..6
    guess_name: Mapped[str] = mapped_column(String(120), nullable=False)
    result_json: Mapped[str] = mapped_column(Text, nullable=False)  # diffs colorimétricos
    is_win: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # 0/1
