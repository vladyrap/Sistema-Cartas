"""Pack Opening Simulator — 1 pack por día por usuario. Guarda los productos
sorteados como JSON para que puedan re-verse después."""
from datetime import date as _date

from sqlalchemy import Date, ForeignKey, Integer, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PackOpening(Base, TimestampMixin):
    __tablename__ = "pack_openings"
    __table_args__ = (UniqueConstraint("user_id", "open_date", name="uq_pack_user_date"),)

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    open_date: Mapped[_date] = mapped_column(Date, nullable=False, index=True)
    products_json: Mapped[str] = mapped_column(Text, nullable=False)  # [{id,name,rarity,image_url,...},...]
    rare_pull: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # 0=no, 1=rare, 2=mythic
