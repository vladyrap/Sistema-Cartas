"""Cards Tinder — registro de cartas swipeadas izq/der por el usuario."""
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class CardSwipe(Base, TimestampMixin):
    __tablename__ = "card_swipes"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    card_name: Mapped[str] = mapped_column(String(160), nullable=False, index=True)
    direction: Mapped[str] = mapped_column(String(10), nullable=False)  # "left" | "right"
    set_code: Mapped[str | None] = mapped_column(String(20))
    image_url: Mapped[str | None] = mapped_column(String(500))
    price_usd: Mapped[str | None] = mapped_column(String(20))
