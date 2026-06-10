"""Cards Tinder — swipe izq/der sobre cartas Magic random."""
import logging
from typing import Literal

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import desc, func, select

from app.core.deps import DbDep, UserDep
from app.core.rate_limit import limiter
from app.models import CardSwipe

router = APIRouter()
log = logging.getLogger("tinder")

SCRYFALL_BASE = "https://api.scryfall.com"
USER_AGENT = "EliteCards/1.0 (https://elitecards.cl)"


class CardOut(BaseModel):
    name: str
    set_code: str | None = None
    image_normal: str | None = None
    image_art_crop: str | None = None
    mana_cost: str | None = None
    type_line: str | None = None
    rarity: str | None = None
    price_usd: str | None = None
    scryfall_uri: str | None = None
    flavor_text: str | None = None


@router.get("/next", response_model=CardOut)
@limiter.limit("60/minute")
def next_card(request: Request) -> CardOut:
    """Trae una carta Magic random de Scryfall para swipear."""
    try:
        with httpx.Client(timeout=5.0, headers={"User-Agent": USER_AGENT}) as cli:
            r = cli.get(f"{SCRYFALL_BASE}/cards/random", params={"q": "is:firstprint"})
    except httpx.RequestError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Scryfall no responde")
    if r.status_code != 200:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Scryfall error")
    j = r.json()
    images = j.get("image_uris") or {}
    if not images and j.get("card_faces"):
        images = (j["card_faces"][0] or {}).get("image_uris") or {}
    prices = j.get("prices") or {}
    return CardOut(
        name=j.get("name") or "?",
        set_code=j.get("set"),
        image_normal=images.get("normal") or images.get("large"),
        image_art_crop=images.get("art_crop"),
        mana_cost=j.get("mana_cost"),
        type_line=j.get("type_line"),
        rarity=j.get("rarity"),
        price_usd=str(prices.get("usd")) if prices.get("usd") else None,
        scryfall_uri=j.get("scryfall_uri"),
        flavor_text=j.get("flavor_text"),
    )


class SwipeIn(BaseModel):
    card_name: str
    direction: Literal["left", "right"]
    set_code: str | None = None
    image_url: str | None = None
    price_usd: str | None = None


@router.post("/swipe", status_code=204)
@limiter.limit("120/minute")
def swipe(request: Request, payload: SwipeIn, current: UserDep, db: DbDep) -> None:
    """Registra el swipe del usuario sobre una carta."""
    if not payload.card_name or len(payload.card_name) > 160:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nombre inválido")
    db.add(CardSwipe(
        user_id=current.id,
        card_name=payload.card_name[:160],
        direction=payload.direction,
        set_code=(payload.set_code or None) and payload.set_code[:20],
        image_url=(payload.image_url or None) and payload.image_url[:500],
        price_usd=(payload.price_usd or None) and payload.price_usd[:20],
    ))
    db.commit()
    return None


class StatsOut(BaseModel):
    total: int
    right: int
    left: int


@router.get("/me/stats", response_model=StatsOut)
def my_stats(current: UserDep, db: DbDep) -> StatsOut:
    rows = db.execute(
        select(CardSwipe.direction, func.count(CardSwipe.id))
        .where(CardSwipe.user_id == current.id)
        .group_by(CardSwipe.direction)
    ).all()
    counts = {d: int(c) for d, c in rows}
    return StatsOut(
        total=sum(counts.values()),
        right=counts.get("right", 0),
        left=counts.get("left", 0),
    )


class LikedCardOut(BaseModel):
    card_name: str
    set_code: str | None = None
    image_url: str | None = None
    price_usd: str | None = None
    swiped_at: str


@router.get("/me/liked", response_model=list[LikedCardOut])
def my_liked(current: UserDep, db: DbDep, limit: int = 20) -> list[LikedCardOut]:
    limit = max(1, min(limit, 50))
    rows = db.execute(
        select(CardSwipe)
        .where(CardSwipe.user_id == current.id, CardSwipe.direction == "right")
        .order_by(desc(CardSwipe.created_at))
        .limit(limit)
    ).scalars().all()
    return [
        LikedCardOut(
            card_name=r.card_name,
            set_code=r.set_code,
            image_url=r.image_url,
            price_usd=r.price_usd,
            swiped_at=r.created_at.isoformat(),
        )
        for r in rows
    ]
