"""Variantes (SKU) de un Product.

Un Product genérico (ej: "Charizard ex SV01-180") puede tener N variantes con
distinto condition, foil, idioma, edición y precio. Las reservas/wishlists
apuntan a una variante específica cuando aplica.

Si un Product no tiene variantes, se comporta como antes (stock + precio en
el Product directamente).
"""
from __future__ import annotations

from decimal import Decimal

from sqlalchemy import Boolean, Enum, ForeignKey, Integer, Numeric, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, CardCondition, CardLanguage, TimestampMixin


class ProductVariant(Base, TimestampMixin):
    __tablename__ = "product_variants"
    __table_args__ = (
        UniqueConstraint("sku", name="uq_product_variant_sku"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    product_id: Mapped[int] = mapped_column(
        ForeignKey("products.id", ondelete="CASCADE"), nullable=False, index=True
    )
    sku: Mapped[str] = mapped_column(String(60), nullable=False, index=True)

    # Set/edición de la carta (opcional — para boxes/sobres puede ser null).
    set_id: Mapped[int | None] = mapped_column(
        ForeignKey("game_sets.id", ondelete="SET NULL"), index=True
    )
    # Collector number dentro del set ("180/197", "SV-01"...).
    collector_number: Mapped[str | None] = mapped_column(String(20))

    condition: Mapped[CardCondition] = mapped_column(
        Enum(CardCondition, name="card_condition"), nullable=False, default=CardCondition.NM
    )
    is_foil: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    language: Mapped[CardLanguage] = mapped_column(
        Enum(CardLanguage, name="card_language"), nullable=False, default=CardLanguage.ES
    )

    # Override de precio. Si null, se usa Product.price_clp.
    price_clp: Mapped[Decimal | None] = mapped_column(Numeric(10, 0))
    stock: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    image_url: Mapped[str | None] = mapped_column(String(500))

    is_active: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)
