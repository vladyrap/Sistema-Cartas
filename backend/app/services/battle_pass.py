"""Battle Pass services: grant XP, claim rewards, purchase premium.

XP del pase se otorga vía `grant_bp_xp` desde varios hooks:
  - report_match en torneo → 50 XP (winner) + 20 XP (loser)
  - duel completado ranked → 30 XP winner
  - finalize event → 200 XP champion, 100 top 8, 50 participation
"""
from __future__ import annotations

import json
import logging
from datetime import datetime, timezone

from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models import (
    BattlePass, BattlePassProgress, BattlePassTier, EventRegistration,
    Season,
)

log = logging.getLogger("battle_pass")


def get_active_pass(db: Session) -> BattlePass | None:
    season = db.scalar(select(Season).where(Season.status == "ACTIVE"))
    if not season:
        return None
    return db.scalar(select(BattlePass).where(
        BattlePass.season_id == season.id, BattlePass.is_active.is_(True)
    ))


def _get_or_create_progress(db: Session, *, bp_id: int, player_id: int) -> BattlePassProgress:
    prog = db.scalar(select(BattlePassProgress).where(
        BattlePassProgress.battle_pass_id == bp_id,
        BattlePassProgress.player_id == player_id,
    ))
    if not prog:
        prog = BattlePassProgress(battle_pass_id=bp_id, player_id=player_id)
        db.add(prog)
        db.flush()
    return prog


def grant_bp_xp(db: Session, *, player_id: int, amount: int, reason: str | None = None) -> int:
    """Suma XP al pase activo del jugador. Devuelve nuevo tier o el actual."""
    if amount <= 0:
        return 0
    bp = get_active_pass(db)
    if not bp:
        return 0
    prog = _get_or_create_progress(db, bp_id=bp.id, player_id=player_id)
    prog.bp_xp += amount
    new_tier = min(prog.bp_xp // bp.xp_per_tier, bp.max_tier)
    leveled = new_tier > prog.current_tier
    prog.current_tier = int(new_tier)
    db.flush()
    if leveled:
        log.info("BP tier up player %d → tier %d (%s)", player_id, new_tier, reason)
    return prog.current_tier


def claim_reward(db: Session, *, player_id: int, tier_number: int, track: str) -> dict:
    """Reclama un reward. track = 'free' | 'premium'. Aplica el efecto."""
    if track not in ("free", "premium"):
        raise ValueError("track inválido")
    bp = get_active_pass(db)
    if not bp:
        raise ValueError("Sin pase activo")
    prog = _get_or_create_progress(db, bp_id=bp.id, player_id=player_id)
    if tier_number > prog.current_tier:
        raise ValueError(f"Tier {tier_number} no desbloqueado todavía")
    if track == "premium" and not prog.is_premium:
        raise ValueError("Necesitás el pase premium")
    tier = db.scalar(select(BattlePassTier).where(
        BattlePassTier.battle_pass_id == bp.id,
        BattlePassTier.tier_number == tier_number,
    ))
    if not tier:
        raise ValueError(f"Tier {tier_number} no existe")

    # Ya reclamado?
    claimed_field = "free_claimed_json" if track == "free" else "premium_claimed_json"
    claimed: list[int] = json.loads(getattr(prog, claimed_field) or "[]")
    if tier_number in claimed:
        raise ValueError("Ya reclamado")

    kind = tier.free_reward_kind if track == "free" else tier.premium_reward_kind
    amount = tier.free_reward_amount if track == "free" else tier.premium_reward_amount
    label = tier.free_reward_label if track == "free" else tier.premium_reward_label

    # Apply effect
    if kind == "exp":
        from app.services import exp as exp_svc
        try:
            exp_svc.award_exp(
                db, player_id=player_id, reason_code="battle_pass_reward",
                amount=int(amount or 0),
                reason=f"BP T{tier_number} {track}: {label}",
            )
        except Exception:
            log.exception("BP exp reward failed")
    elif kind == "freeze_days":
        # Aplica freeze a todos los ratings del jugador
        from app.models import PlayerRating
        from datetime import timedelta as _td
        now = datetime.now(timezone.utc)
        ratings = list(db.scalars(select(PlayerRating).where(PlayerRating.player_id == player_id)))
        for r in ratings:
            base = r.freeze_until if (r.freeze_until and r.freeze_until > now) else now
            r.freeze_until = base + _td(days=int(amount or 1))
    # Otros kinds: exp_boost, cosmetic, nothing → solo se "reclaman" para marcar

    claimed.append(tier_number)
    setattr(prog, claimed_field, json.dumps(claimed))
    db.flush()

    return {
        "ok": True,
        "tier": tier_number, "track": track,
        "kind": kind, "amount": amount, "label": label,
    }


def purchase_premium(db: Session, *, player_id: int) -> BattlePassProgress:
    """Marca el progress como premium. La verificación de pago se hace afuera (MercadoPago)."""
    bp = get_active_pass(db)
    if not bp:
        raise ValueError("Sin pase activo")
    prog = _get_or_create_progress(db, bp_id=bp.id, player_id=player_id)
    if prog.is_premium:
        return prog
    prog.is_premium = True
    prog.premium_purchased_at = datetime.now(timezone.utc)
    db.flush()
    return prog
