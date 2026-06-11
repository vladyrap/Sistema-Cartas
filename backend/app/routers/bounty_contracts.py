"""Bounty Contracts — jugadores ponen EXP de su bolsillo como cabeza-con-precio."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select

from app.core.deps import DbDep, UserDep
from app.core.rate_limit import limiter
from app.models import (
    BountyContract, ExpTransaction, PlayerProfile, Season, SeasonStatus,
)

router = APIRouter()


MIN_EXP_OFFER = 50
MAX_EXP_OFFER = 5000


class CreateBountyIn(BaseModel):
    target_player_id: int
    exp_offered: int = Field(ge=MIN_EXP_OFFER, le=MAX_EXP_OFFER)
    message: str | None = Field(default=None, max_length=280)
    expires_in_days: int = Field(default=7, ge=1, le=30)


class BountyOut(BaseModel):
    id: int
    sponsor_alias: str
    sponsor_player_id: int
    target_alias: str
    target_player_id: int
    exp_offered: int
    message: str | None
    status: str
    expires_at: datetime | None
    claimed_by_alias: str | None
    claimed_at: datetime | None
    created_at: datetime


def _to_out(db, c: BountyContract) -> BountyOut:
    sp = db.get(PlayerProfile, c.sponsor_player_id)
    tg = db.get(PlayerProfile, c.target_player_id)
    cl = db.get(PlayerProfile, c.claimed_by_player_id) if c.claimed_by_player_id else None
    return BountyOut(
        id=c.id,
        sponsor_alias=sp.alias if sp else "?",
        sponsor_player_id=c.sponsor_player_id,
        target_alias=tg.alias if tg else "?",
        target_player_id=c.target_player_id,
        exp_offered=c.exp_offered,
        message=c.message,
        status=c.status,
        expires_at=c.expires_at,
        claimed_by_alias=cl.alias if cl else None,
        claimed_at=c.claimed_at,
        created_at=c.created_at,
    )


@router.post("", response_model=BountyOut)
@limiter.limit("10/hour")
def create_contract(request: Request, payload: CreateBountyIn, current: UserDep, db: DbDep) -> BountyOut:
    """Crea un contrato. El EXP se debita al sponsor en el momento (compromiso)."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    if payload.target_player_id == current.profile.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No podés ponerte precio a vos mismo")

    target = db.get(PlayerProfile, payload.target_player_id)
    if not target:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Target no encontrado")

    active = db.scalar(select(Season).where(Season.status == SeasonStatus.ACTIVE))
    if not active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No hay temporada activa")

    # Verificar EXP disponible del sponsor en la season activa
    sponsor_exp = db.scalar(
        select(func.coalesce(func.sum(ExpTransaction.amount), 0)).where(
            ExpTransaction.player_id == current.profile.id,
            ExpTransaction.season_id == active.id,
        )
    ) or 0
    if int(sponsor_exp) < payload.exp_offered:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"EXP insuficiente: tenés {int(sponsor_exp)}, ofreciste {payload.exp_offered}",
        )

    # Verificar que no haya otro contrato OPEN del mismo sponsor al mismo target
    existing = db.scalar(
        select(BountyContract).where(
            BountyContract.sponsor_player_id == current.profile.id,
            BountyContract.target_player_id == target.id,
            BountyContract.season_id == active.id,
            BountyContract.status == "OPEN",
        )
    )
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Ya tenés un contrato OPEN sobre ese jugador",
        )

    # Crear contrato y debitar EXP del sponsor (escrow)
    db.add(ExpTransaction(
        player_id=current.profile.id,
        season_id=active.id,
        amount=-payload.exp_offered,
        reason=f"bounty_contract:escrow:{target.alias}",
        reason_code="bounty_escrow",
    ))
    contract = BountyContract(
        sponsor_player_id=current.profile.id,
        target_player_id=target.id,
        season_id=active.id,
        exp_offered=payload.exp_offered,
        message=payload.message,
        expires_at=datetime.now(timezone.utc) + timedelta(days=payload.expires_in_days),
    )
    db.add(contract)
    db.commit()
    db.refresh(contract)
    return _to_out(db, contract)


@router.get("", response_model=list[BountyOut])
def list_contracts(
    db: DbDep,
    status_filter: str | None = None,
    target_player_id: int | None = None,
    sponsor_player_id: int | None = None,
    limit: int = 50,
) -> list[BountyOut]:
    limit = max(1, min(limit, 100))
    q = select(BountyContract).order_by(desc(BountyContract.created_at)).limit(limit)
    if status_filter:
        q = q.where(BountyContract.status == status_filter.upper())
    if target_player_id:
        q = q.where(BountyContract.target_player_id == target_player_id)
    if sponsor_player_id:
        q = q.where(BountyContract.sponsor_player_id == sponsor_player_id)
    rows = list(db.scalars(q))
    return [_to_out(db, c) for c in rows]


@router.post("/{contract_id}/cancel", response_model=BountyOut)
def cancel_contract(contract_id: int, current: UserDep, db: DbDep) -> BountyOut:
    """El sponsor puede cancelar su propio contrato. Devuelve la EXP."""
    c = db.get(BountyContract, contract_id)
    if not c:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contrato no encontrado")
    if not current.profile or c.sponsor_player_id != current.profile.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo el sponsor puede cancelar")
    if c.status != "OPEN":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Contrato no está OPEN (status={c.status})")
    c.status = "CANCELLED"
    db.add(ExpTransaction(
        player_id=c.sponsor_player_id,
        season_id=c.season_id,
        amount=c.exp_offered,
        reason=f"bounty_contract:refund:{c.id}",
        reason_code="bounty_refund",
    ))
    db.commit()
    return _to_out(db, c)


class StatsOut(BaseModel):
    contracts_sponsored: int
    contracts_claimed_against_me: int
    exp_in_escrow: int
    open_contracts_on_me: int


@router.get("/me/stats", response_model=StatsOut)
def my_stats(current: UserDep, db: DbDep) -> StatsOut:
    if not current.profile:
        return StatsOut(contracts_sponsored=0, contracts_claimed_against_me=0, exp_in_escrow=0, open_contracts_on_me=0)
    pid = current.profile.id
    sponsored = db.scalar(
        select(func.count(BountyContract.id)).where(BountyContract.sponsor_player_id == pid)
    ) or 0
    claimed_against = db.scalar(
        select(func.count(BountyContract.id)).where(
            BountyContract.target_player_id == pid,
            BountyContract.status == "CLAIMED",
        )
    ) or 0
    escrow = db.scalar(
        select(func.coalesce(func.sum(BountyContract.exp_offered), 0)).where(
            BountyContract.sponsor_player_id == pid,
            BountyContract.status == "OPEN",
        )
    ) or 0
    open_on_me = db.scalar(
        select(func.count(BountyContract.id)).where(
            BountyContract.target_player_id == pid,
            BountyContract.status == "OPEN",
        )
    ) or 0
    return StatsOut(
        contracts_sponsored=int(sponsored),
        contracts_claimed_against_me=int(claimed_against),
        exp_in_escrow=int(escrow),
        open_contracts_on_me=int(open_on_me),
    )
