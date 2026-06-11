"""Battle Pass endpoints — admin CRUD + user view + claim + premium."""
import json
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.deps import AdminDep, DbDep, OptionalUserDep, UserDep
from app.models import BattlePass, BattlePassTier, BattlePassProgress, Season
from app.services import battle_pass as bp_svc

router = APIRouter()


# ═══════════════════════════════════════════════════════════════════════
# Schemas
# ═══════════════════════════════════════════════════════════════════════


class TierOut(BaseModel):
    tier_number: int
    free_reward_kind: str | None
    free_reward_amount: int | None
    free_reward_label: str | None
    free_reward_image_url: str | None
    premium_reward_kind: str | None
    premium_reward_amount: int | None
    premium_reward_label: str | None
    premium_reward_image_url: str | None


class BattlePassOut(BaseModel):
    id: int
    season_id: int
    name: str
    description: str | None
    cover_image_url: str | None
    starts_at: datetime
    ends_at: datetime
    max_tier: int
    xp_per_tier: int
    premium_price_clp: int
    is_active: bool


class ProgressOut(BaseModel):
    bp_xp: int
    current_tier: int
    next_tier_xp_needed: int
    is_premium: bool
    free_claimed: list[int]
    premium_claimed: list[int]


def _bp_to_out(bp: BattlePass) -> BattlePassOut:
    return BattlePassOut(
        id=bp.id, season_id=bp.season_id, name=bp.name, description=bp.description,
        cover_image_url=bp.cover_image_url, starts_at=bp.starts_at, ends_at=bp.ends_at,
        max_tier=bp.max_tier, xp_per_tier=bp.xp_per_tier,
        premium_price_clp=bp.premium_price_clp, is_active=bp.is_active,
    )


def _tier_to_out(t: BattlePassTier) -> TierOut:
    return TierOut(
        tier_number=t.tier_number,
        free_reward_kind=t.free_reward_kind, free_reward_amount=t.free_reward_amount,
        free_reward_label=t.free_reward_label, free_reward_image_url=t.free_reward_image_url,
        premium_reward_kind=t.premium_reward_kind, premium_reward_amount=t.premium_reward_amount,
        premium_reward_label=t.premium_reward_label, premium_reward_image_url=t.premium_reward_image_url,
    )


# ═══════════════════════════════════════════════════════════════════════
# Public/user endpoints
# ═══════════════════════════════════════════════════════════════════════


@router.get("/active", response_model=dict | None)
def get_active(db: DbDep, current: OptionalUserDep) -> dict | None:
    bp = bp_svc.get_active_pass(db)
    if not bp:
        return None
    tiers = list(db.scalars(select(BattlePassTier).where(
        BattlePassTier.battle_pass_id == bp.id
    ).order_by(BattlePassTier.tier_number)))
    out = {
        "pass": _bp_to_out(bp).model_dump(),
        "tiers": [_tier_to_out(t).model_dump() for t in tiers],
        "my_progress": None,
    }
    if current and current.profile:
        prog = db.scalar(select(BattlePassProgress).where(
            BattlePassProgress.battle_pass_id == bp.id,
            BattlePassProgress.player_id == current.profile.id,
        ))
        if prog:
            xp_in_tier = prog.bp_xp % bp.xp_per_tier
            out["my_progress"] = ProgressOut(
                bp_xp=prog.bp_xp, current_tier=prog.current_tier,
                next_tier_xp_needed=bp.xp_per_tier - xp_in_tier,
                is_premium=prog.is_premium,
                free_claimed=json.loads(prog.free_claimed_json or "[]"),
                premium_claimed=json.loads(prog.premium_claimed_json or "[]"),
            ).model_dump()
        else:
            out["my_progress"] = ProgressOut(
                bp_xp=0, current_tier=0, next_tier_xp_needed=bp.xp_per_tier,
                is_premium=False, free_claimed=[], premium_claimed=[],
            ).model_dump()
    return out


class ClaimIn(BaseModel):
    tier_number: int
    track: Literal["free", "premium"]


@router.post("/claim")
def claim(payload: ClaimIn, current: UserDep, db: DbDep) -> dict:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    try:
        out = bp_svc.claim_reward(db, player_id=current.profile.id,
                                  tier_number=payload.tier_number, track=payload.track)
        db.commit()
        return out
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))


@router.post("/premium/checkout")
def premium_checkout(request: Request, current: UserDep, db: DbDep) -> dict:
    """Crea una preference de MercadoPago para comprar el pase premium.

    external_reference = "bp:{player_id}" — el webhook de payments la reconoce
    y activa premium al confirmar el pago approved.
    """
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    bp = bp_svc.get_active_pass(db)
    if not bp:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin pase activo")

    prog = db.scalar(select(BattlePassProgress).where(
        BattlePassProgress.battle_pass_id == bp.id,
        BattlePassProgress.player_id == current.profile.id,
    ))
    if prog and prog.is_premium:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ya tenés premium")

    from app.services import mercadopago as mp_svc
    pref = mp_svc.create_checkout(
        db,
        title=f"{bp.name} — Premium",
        unit_price_clp=int(bp.premium_price_clp),
        external_reference=f"bp:{current.profile.id}",
        back_path="/battle-pass",
        request_base_url=str(request.base_url),
    )
    return {
        "init_point": pref.get("init_point") or pref.get("sandbox_init_point") or "",
        "preference_id": pref.get("id") or "",
        "mock": pref.get("mock", False),
        "price_clp": bp.premium_price_clp,
    }


@router.post("/admin/grant-premium")
def admin_grant_premium(admin: AdminDep, db: DbDep, player_id: int = Query(...)) -> dict:
    """Admin activa premium manualmente (cortesía, premio, corrección)."""
    try:
        prog = bp_svc.purchase_premium(db, player_id=player_id)
        db.commit()
        return {"ok": True, "player_id": player_id, "is_premium": prog.is_premium}
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))


# ═══════════════════════════════════════════════════════════════════════
# Admin endpoints
# ═══════════════════════════════════════════════════════════════════════


class BattlePassIn(BaseModel):
    season_id: int
    name: str = Field(default="Pase Competitivo", min_length=2, max_length=120)
    description: str | None = None
    cover_image_url: str | None = None
    starts_at: datetime
    ends_at: datetime
    max_tier: int = Field(default=50, ge=1, le=200)
    xp_per_tier: int = Field(default=1000, ge=100, le=100000)
    premium_price_clp: int = Field(default=4990, ge=0)


@router.post("/admin/create", response_model=BattlePassOut, status_code=201)
def admin_create(payload: BattlePassIn, admin: AdminDep, db: DbDep) -> BattlePassOut:
    bp = BattlePass(
        season_id=payload.season_id, name=payload.name, description=payload.description,
        cover_image_url=payload.cover_image_url,
        starts_at=payload.starts_at, ends_at=payload.ends_at,
        max_tier=payload.max_tier, xp_per_tier=payload.xp_per_tier,
        premium_price_clp=payload.premium_price_clp,
    )
    db.add(bp)
    try:
        db.commit()
        db.refresh(bp)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe pase para esa temporada")
    return _bp_to_out(bp)


class TierIn(BaseModel):
    tier_number: int = Field(ge=1)
    free_reward_kind: Literal["exp", "exp_boost", "freeze_days", "cosmetic", "nothing"] | None = None
    free_reward_amount: int | None = Field(default=None, ge=0)
    free_reward_label: str | None = None
    free_reward_image_url: str | None = None
    premium_reward_kind: Literal["exp", "exp_boost", "freeze_days", "cosmetic", "nothing"] | None = None
    premium_reward_amount: int | None = Field(default=None, ge=0)
    premium_reward_label: str | None = None
    premium_reward_image_url: str | None = None


@router.post("/admin/{pass_id}/tier", status_code=201)
def admin_upsert_tier(pass_id: int, payload: TierIn, admin: AdminDep, db: DbDep) -> dict:
    """Upsert de un tier — si existe, actualiza; sino crea."""
    existing = db.scalar(select(BattlePassTier).where(
        BattlePassTier.battle_pass_id == pass_id,
        BattlePassTier.tier_number == payload.tier_number,
    ))
    if existing:
        for k, v in payload.model_dump().items():
            setattr(existing, k, v)
    else:
        existing = BattlePassTier(battle_pass_id=pass_id, **payload.model_dump())
        db.add(existing)
    db.commit()
    return {"ok": True, "tier_number": payload.tier_number}


@router.delete("/admin/{pass_id}/tier/{tier_number}", status_code=204)
def admin_delete_tier(pass_id: int, tier_number: int, admin: AdminDep, db: DbDep):
    t = db.scalar(select(BattlePassTier).where(
        BattlePassTier.battle_pass_id == pass_id, BattlePassTier.tier_number == tier_number
    ))
    if t:
        db.delete(t)
        db.commit()


@router.post("/admin/grant-xp")
def admin_grant_xp(admin: AdminDep, db: DbDep, player_id: int = Query(...), amount: int = Query(...)) -> dict:
    """Admin otorga XP del pase manualmente (debug / corrección)."""
    new_tier = bp_svc.grant_bp_xp(db, player_id=player_id, amount=amount, reason=f"admin grant by {admin.id}")
    db.commit()
    return {"ok": True, "player_id": player_id, "amount": amount, "new_tier": new_tier}
