"""Router de catálogo público. Devuelve productos con metadata de elegibilidad
para el jugador actual (si está autenticado)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.core.deps import DbDep, GuildContext, get_current_user
from app.models import CardCondition, CardLanguage, Product, ProductAccess, ProductVariant, User
from app.schemas.common import ProductEligibilityOut, ProductOut, ProductVariantOut
from app.services.reservation import _player_current_level, validate_reservation_request
from app.services.reservation import ReservationError

router = APIRouter()


def _serialize(p: Product) -> ProductOut:
    return ProductOut(
        id=p.id,
        name=p.name,
        game_id=p.game_id,
        category=p.category,
        price_clp=int(p.price_clp),
        stock=p.stock,
        image_url=p.image_url,
        description=p.description,
        access=p.access,
        required_level=p.required_level,
        per_player_limit=p.per_player_limit,
        is_preorder=p.is_preorder,
        is_active=p.is_active,
    )


@router.get("", response_model=list[ProductOut])
def list_products(
    db: DbDep,
    guild: GuildContext,
    game_id: int | None = Query(default=None),
    access: ProductAccess | None = Query(default=None),
    preorder: bool | None = Query(default=None),
) -> list[ProductOut]:
    stmt = select(Product).where(Product.is_active.is_(True))
    if guild is not None:
        stmt = stmt.where(Product.guild_id == guild.id)
    if game_id is not None:
        stmt = stmt.where(Product.game_id == game_id)
    if access is not None:
        stmt = stmt.where(Product.access == access)
    if preorder is not None:
        stmt = stmt.where(Product.is_preorder.is_(preorder))
    stmt = stmt.order_by(Product.is_preorder.desc(), Product.required_level, Product.name)
    return [_serialize(p) for p in db.scalars(stmt)]


def _variant_to_out(v: ProductVariant) -> ProductVariantOut:
    return ProductVariantOut(
        id=v.id, product_id=v.product_id, sku=v.sku,
        set_id=v.set_id, collector_number=v.collector_number,
        condition=v.condition, is_foil=v.is_foil, language=v.language,
        price_clp=int(v.price_clp) if v.price_clp is not None else None,
        stock=v.stock, image_url=v.image_url, is_active=v.is_active,
    )


@router.get("/{product_id}/variants", response_model=list[ProductVariantOut])
def list_variants_public(
    product_id: int,
    db: DbDep,
    condition: CardCondition | None = Query(default=None),
    language: CardLanguage | None = Query(default=None),
    is_foil: bool | None = Query(default=None),
    set_id: int | None = Query(default=None),
    in_stock: bool = Query(default=True),
) -> list[ProductVariantOut]:
    """Variantes (SKU) de un producto, filtrable por condition/foil/idioma/set."""
    stmt = select(ProductVariant).where(
        ProductVariant.product_id == product_id,
        ProductVariant.is_active.is_(True),
    )
    if condition is not None:
        stmt = stmt.where(ProductVariant.condition == condition)
    if language is not None:
        stmt = stmt.where(ProductVariant.language == language)
    if is_foil is not None:
        stmt = stmt.where(ProductVariant.is_foil.is_(is_foil))
    if set_id is not None:
        stmt = stmt.where(ProductVariant.set_id == set_id)
    if in_stock:
        stmt = stmt.where(ProductVariant.stock > 0)
    stmt = stmt.order_by(ProductVariant.condition, ProductVariant.price_clp.asc().nulls_last())
    return [_variant_to_out(v) for v in db.scalars(stmt)]


@router.get("/eligibility", response_model=list[ProductEligibilityOut])
def list_with_eligibility(
    db: DbDep,
    guild: GuildContext,
    current: User = Depends(get_current_user),
    game_id: int | None = Query(default=None),
    access: ProductAccess | None = Query(default=None),
):
    """Lista productos enriquecidos con flag `can_reserve` para el jugador actual.

    Si no hay perfil de jugador (caso raro), devuelve todos como no-elegibles.
    """
    if not current.profile:
        return []
    player_id = current.profile.id
    player_level = _player_current_level(db, player_id)

    stmt = select(Product).where(Product.is_active.is_(True))
    if guild is not None:
        stmt = stmt.where(Product.guild_id == guild.id)
    if game_id is not None:
        stmt = stmt.where(Product.game_id == game_id)
    if access is not None:
        stmt = stmt.where(Product.access == access)
    stmt = stmt.order_by(Product.is_preorder.desc(), Product.required_level, Product.name)

    out: list[ProductEligibilityOut] = []
    for p in db.scalars(stmt):
        try:
            validate_reservation_request(db, player_id=player_id, product_id=p.id, quantity=1)
            out.append(
                ProductEligibilityOut(
                    product=_serialize(p), can_reserve=True, reason=None, player_level=player_level
                )
            )
        except ReservationError as exc:
            out.append(
                ProductEligibilityOut(
                    product=_serialize(p), can_reserve=False, reason=str(exc), player_level=player_level
                )
            )
    return out
