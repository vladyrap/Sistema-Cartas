"""Pack Opening Simulator — 1 pack diario, 5 productos random del catálogo."""
import json
import random
from datetime import date

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError

from app.core.deps import DbDep, UserDep
from app.core.rate_limit import limiter
from app.models import PackOpening, Product

router = APIRouter()


class PackCardOut(BaseModel):
    id: int | None = None
    name: str
    rarity: str  # common | uncommon | rare | mythic
    image_url: str | None = None
    category: str | None = None
    price_clp: int | None = None


class PackOpeningOut(BaseModel):
    open_date: date
    cards: list[PackCardOut]
    rare_pull: int  # 0=common only, 1=rare, 2=mythic
    is_fresh: bool = False


def _rarify(idx: int, mythic: bool) -> str:
    """5 cartas por pack: 3 common, 1 uncommon, 1 rare/mythic (8% mythic)."""
    if idx < 3:
        return "common"
    if idx == 3:
        return "uncommon"
    return "mythic" if mythic else "rare"


@router.post("/open", response_model=PackOpeningOut)
@limiter.limit("10/minute")
def open_pack(request: Request, current: UserDep, db: DbDep) -> PackOpeningOut:
    today = date.today()

    # Idempotency — 1 pack/día
    existing = db.scalar(
        select(PackOpening).where(
            PackOpening.user_id == current.id, PackOpening.open_date == today,
        )
    )
    if existing:
        cards = [PackCardOut(**c) for c in json.loads(existing.products_json)]
        return PackOpeningOut(
            open_date=existing.open_date, cards=cards,
            rare_pull=existing.rare_pull, is_fresh=False,
        )

    # Tirar 5 productos random del catálogo activo
    all_products = list(db.scalars(
        select(Product).where(Product.is_active.is_(True), Product.image_url.is_not(None))
    ))
    if not all_products:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No hay productos en el catálogo")

    pick = random.sample(all_products, min(5, len(all_products)))
    while len(pick) < 5:  # rellena con repeticiones si hay <5
        pick.append(random.choice(all_products))

    mythic = random.random() < 0.08
    rare_pull = 2 if mythic else 1
    cards = [
        PackCardOut(
            id=p.id,
            name=p.name,
            rarity=_rarify(i, mythic),
            image_url=p.image_url,
            category=p.category,
            price_clp=int(p.price_clp) if p.price_clp else None,
        )
        for i, p in enumerate(pick)
    ]

    try:
        db.add(PackOpening(
            user_id=current.id,
            open_date=today,
            products_json=json.dumps([c.model_dump() for c in cards]),
            rare_pull=rare_pull,
        ))
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya abriste un pack hoy")

    return PackOpeningOut(open_date=today, cards=cards, rare_pull=rare_pull, is_fresh=True)


class PackStatusOut(BaseModel):
    can_open: bool
    last: PackOpeningOut | None = None


@router.get("/status", response_model=PackStatusOut)
def status_(current: UserDep, db: DbDep) -> PackStatusOut:
    today = date.today()
    existing = db.scalar(
        select(PackOpening).where(
            PackOpening.user_id == current.id, PackOpening.open_date == today,
        )
    )
    if not existing:
        return PackStatusOut(can_open=True, last=None)
    cards = [PackCardOut(**c) for c in json.loads(existing.products_json)]
    return PackStatusOut(can_open=False, last=PackOpeningOut(
        open_date=existing.open_date, cards=cards,
        rare_pull=existing.rare_pull, is_fresh=False,
    ))
