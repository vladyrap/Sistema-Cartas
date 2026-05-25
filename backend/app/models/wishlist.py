"""Wishlist de productos: jugador marca productos que quiere.

Cuando el stock pasa de 0 a >0, se manda notif a los jugadores en su wishlist.
"""
from __future__ import annotations

from sqlalchemy import ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ProductWishlist(Base, TimestampMixin):
    __tablename__ = "product_wishlists"
    __table_args__ = (
        UniqueConstraint("player_id", "product_id", name="uq_wishlist_player_product"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
