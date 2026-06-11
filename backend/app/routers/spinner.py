"""Lucky Spinner — ruleta diaria. Un giro por usuario por día."""
import random
from datetime import date
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.deps import DbDep, UserDep
from app.core.rate_limit import limiter
from app.models import DailySpin, ExpTransaction, PlayerProfile, Season, SeasonStatus

router = APIRouter()

# Premios — pesos sumando 100. Mínimo garantizado: 10 EXP (sin slot "sin premio").
PRIZES = [
    {"weight": 40, "kind": "exp", "amount": 10,   "label": "10 EXP",   "rarity": "common"},
    {"weight": 26, "kind": "exp", "amount": 25,   "label": "25 EXP",   "rarity": "common"},
    {"weight": 15, "kind": "exp", "amount": 50,   "label": "50 EXP",   "rarity": "uncommon"},
    {"weight": 10, "kind": "exp", "amount": 100,  "label": "100 EXP",  "rarity": "uncommon"},
    {"weight":  5, "kind": "exp", "amount": 200,  "label": "200 EXP",  "rarity": "rare"},
    {"weight":  3, "kind": "exp", "amount": 500,  "label": "500 EXP",  "rarity": "epic"},
    {"weight":  1, "kind": "exp", "amount": 1000, "label": "1000 EXP", "rarity": "legendary"},
]

WEIGHTS = [p["weight"] for p in PRIZES]


class PrizeOut(BaseModel):
    kind: Literal["exp", "title", "nothing", "boost"]
    amount: int
    label: str
    rarity: str
    index: int  # útil para que el frontend sepa en qué casillero parar la ruleta


class SpinStatusOut(BaseModel):
    can_spin: bool
    last_prize: PrizeOut | None = None
    prizes: list[dict]  # para que el frontend renderice las casillas


@router.get("/status", response_model=SpinStatusOut)
def get_status(current: UserDep, db: DbDep) -> SpinStatusOut:
    today = date.today()
    last = db.scalar(
        select(DailySpin).where(
            DailySpin.user_id == current.id, DailySpin.spin_date == today,
        )
    )
    last_prize = None
    if last:
        # Reconstruir PrizeOut desde el row guardado
        idx = next((i for i, p in enumerate(PRIZES) if p["label"] == last.prize_label), 0)
        last_prize = PrizeOut(
            kind=last.prize_kind, amount=last.prize_amount,
            label=last.prize_label, rarity=PRIZES[idx]["rarity"], index=idx,
        )
    return SpinStatusOut(
        can_spin=last is None,
        last_prize=last_prize,
        prizes=[{k: v for k, v in p.items() if k != "weight"} for p in PRIZES],
    )


@router.post("/spin", response_model=PrizeOut)
@limiter.limit("5/minute")
def spin(request: Request, current: UserDep, db: DbDep) -> PrizeOut:
    """Gira la ruleta. Devuelve el premio + acredita EXP si aplica.

    Idempotency: UNIQUE(user_id, spin_date). Si el cliente reintenta, devuelve 409.
    """
    today = date.today()
    idx = random.choices(range(len(PRIZES)), weights=WEIGHTS, k=1)[0]
    prize = PRIZES[idx]

    try:
        db.add(DailySpin(
            user_id=current.id,
            spin_date=today,
            prize_kind=prize["kind"],
            prize_amount=prize["amount"],
            prize_label=prize["label"],
        ))
        db.flush()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya giraste hoy. Volvé mañana.")

    # Acreditar EXP si aplica y hay temporada activa + profile
    if prize["kind"] == "exp" and prize["amount"] > 0 and current.profile:
        active = db.scalar(select(Season).where(Season.status == SeasonStatus.ACTIVE))
        if active:
            db.add(ExpTransaction(
                player_id=current.profile.id,
                season_id=active.id,
                amount=prize["amount"],
                reason=f"daily_spin:{prize['label']}",
                reason_code="daily_spin",
            ))

    db.commit()
    return PrizeOut(
        kind=prize["kind"], amount=prize["amount"],
        label=prize["label"], rarity=prize["rarity"], index=idx,
    )
