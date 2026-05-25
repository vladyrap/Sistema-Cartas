"""Wishlist de productos del jugador autenticado."""
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import DbDep, UserDep
from app.models import Product, ProductWishlist
from app.schemas.common import WishlistItemOut

router = APIRouter()


@router.get("", response_model=list[WishlistItemOut])
def list_my_wishlist(db: DbDep, current: UserDep) -> list[WishlistItemOut]:
    if not current.profile:
        return []
    rows = db.execute(
        select(ProductWishlist, Product)
        .join(Product, ProductWishlist.product_id == Product.id)
        .where(ProductWishlist.player_id == current.profile.id)
        .order_by(ProductWishlist.id.desc())
    ).all()
    return [
        WishlistItemOut(
            id=w.id,
            product_id=p.id,
            product_name=p.name,
            product_image_url=p.image_url,
            product_stock=p.stock,
            product_price_clp=int(p.price_clp),
            created_at=w.created_at,
        )
        for w, p in rows
    ]


@router.post("/{product_id}", response_model=WishlistItemOut, status_code=201)
def add_to_wishlist(product_id: int, db: DbDep, current: UserDep) -> WishlistItemOut:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil de jugador")
    product = db.get(Product, product_id)
    if not product:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado")
    existing = db.scalar(
        select(ProductWishlist).where(
            ProductWishlist.player_id == current.profile.id,
            ProductWishlist.product_id == product_id,
        )
    )
    if existing:
        return WishlistItemOut(
            id=existing.id, product_id=product.id,
            product_name=product.name, product_image_url=product.image_url,
            product_stock=product.stock, product_price_clp=int(product.price_clp),
            created_at=existing.created_at,
        )
    w = ProductWishlist(player_id=current.profile.id, product_id=product_id)
    db.add(w)
    db.commit()
    db.refresh(w)
    return WishlistItemOut(
        id=w.id, product_id=product.id,
        product_name=product.name, product_image_url=product.image_url,
        product_stock=product.stock, product_price_clp=int(product.price_clp),
        created_at=w.created_at,
    )


@router.delete("/{product_id}", status_code=204)
def remove_from_wishlist(product_id: int, db: DbDep, current: UserDep):
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    w = db.scalar(
        select(ProductWishlist).where(
            ProductWishlist.player_id == current.profile.id,
            ProductWishlist.product_id == product_id,
        )
    )
    if not w:
        return None
    db.delete(w)
    db.commit()
    return None
