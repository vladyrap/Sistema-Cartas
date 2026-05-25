"""Referidos: ver mis estadísticas + endpoint admin/listar."""
from fastapi import APIRouter
from sqlalchemy import func, select

from app.core.deps import DbDep, UserDep
from app.models import Referral, ReferralStatus, User, PlayerProfile

router = APIRouter()


@router.get("/me/stats")
def my_referral_stats(db: DbDep, current: UserDep) -> dict:
    """Estadísticas: cuántos invité, cuántos se activaron, mi código (elite_id)."""
    pending = db.scalar(
        select(func.count(Referral.id)).where(
            Referral.referrer_user_id == current.id,
            Referral.status == ReferralStatus.PENDING,
        )
    ) or 0
    activated = db.scalar(
        select(func.count(Referral.id)).where(
            Referral.referrer_user_id == current.id,
            Referral.status == ReferralStatus.ACTIVATED,
        )
    ) or 0
    return {
        "referral_code": current.profile.elite_id_code if current.profile else None,
        "pending": pending,
        "activated": activated,
        "total": pending + activated,
    }


@router.get("/me/list")
def my_referrals(db: DbDep, current: UserDep) -> list[dict]:
    """Lista de jugadores que invité, con su estado."""
    rows = db.execute(
        select(Referral, User, PlayerProfile)
        .join(User, Referral.referred_user_id == User.id)
        .outerjoin(PlayerProfile, PlayerProfile.user_id == User.id)
        .where(Referral.referrer_user_id == current.id)
        .order_by(Referral.id.desc())
    ).all()
    return [
        {
            "id": r.id,
            "status": r.status.value,
            "alias": p.alias if p else None,
            "elite_id": p.elite_id_code if p else None,
            "created_at": r.created_at,
            "activated_at": r.activated_at,
        }
        for r, u, p in rows
    ]
