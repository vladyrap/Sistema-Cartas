from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, Numeric, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ProductAccess, TimestampMixin


class Product(Base, TimestampMixin):
    """Producto del catálogo (sobres, decks, accesorios, preventas)."""

    __tablename__ = "products"

    id: Mapped[int] = mapped_column(primary_key=True)
    guild_id: Mapped[int] = mapped_column(ForeignKey("guilds.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    game_id: Mapped[int | None] = mapped_column(ForeignKey("games.id"), index=True)
    category: Mapped[str | None] = mapped_column(String(60))  # "Booster", "Deck", "Singles", "Sleeves"...

    price_clp: Mapped[Decimal] = mapped_column(Numeric(10, 0), nullable=False, default=0)
    stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    image_url: Mapped[str | None] = mapped_column(String(500))
    description: Mapped[str | None] = mapped_column(String(2000))

    access: Mapped[ProductAccess] = mapped_column(
        Enum(ProductAccess, name="product_access"), default=ProductAccess.NORMAL, nullable=False
    )
    required_level: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    per_player_limit: Mapped[int | None] = mapped_column(Integer)
    is_preorder: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
