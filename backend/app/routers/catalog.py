"""Router de catálogo público. Devuelve productos con metadata de elegibilidad
para el jugador actual (si está autenticado)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select

from app.core.deps import DbDep, GuildContext, get_current_user
from app.models import Product, ProductAccess, User
from app.schemas.common import ProductEligibilityOut, ProductOut
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
