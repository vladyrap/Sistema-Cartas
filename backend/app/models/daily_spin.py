"""Registro de spins diarios del Lucky Spinner. UNIQUE(user_id, date) → 1/día."""
from __future__ import annotations

from datetime import date as _date

from sqlalchemy import Date, ForeignKey, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class DailySpin(Base, TimestampMixin):
    __tablename__ = "daily_spins"
    __table_args__ = (UniqueConstraint("user_id", "spin_date", name="uq_daily_spins_user_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    spin_date: Mapped[_date] = mapped_column(Date, nullable=False, index=True)
    prize_kind: Mapped[str] = mapped_column(String(40), nullable=False)  # "exp" | "title" | "nothing" | "boost"
    prize_amount: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    prize_label: Mapped[str] = mapped_column(String(120), nullable=False)
