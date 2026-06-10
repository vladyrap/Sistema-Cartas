"""Bounty del Campeón — el #1 del ranking tiene cabeza con precio.

Vencerlo en evento oficial otorga EXP bonus + título efímero "Regicida del Mes".
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import desc, func, select

from app.core.deps import DbDep, OptionalUserDep
from app.models import (
    BountyKill, ExpTransaction, PlayerProfile, Season, SeasonProgress, SeasonStatus,
)

router = APIRouter()

# EXP bonus por vencer al campeón. Generoso para que se note el evento.
BOUNTY_EXP_REWARD = 500


class BountyChampionOut(BaseModel):
    season_id: int
    season_name: str
    player_id: int | None
    alias: str | None
    elite_id: str | None
    exp_total: int
    avatar_url: str | None = None
    is_me: bool = False
    bounty_exp: int


class BountyKillFeedItem(BaseModel):
    killer_alias: str
    victim_alias: str
    event_id: int | None
    occurred_at: datetime
    exp_awarded: int


@router.get("/current", response_model=BountyChampionOut)
def current_bounty(db: DbDep, current: OptionalUserDep) -> BountyChampionOut:
    """Devuelve el #1 del ranking de la temporada activa = target de bounty."""
    active = db.scalar(select(Season).where(Season.status == SeasonStatus.ACTIVE))
    if not active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No hay temporada activa")

    # #1 por EXP total en SeasonProgress
    top = db.execute(
        select(SeasonProgress, PlayerProfile)
        .join(PlayerProfile, SeasonProgress.player_id == PlayerProfile.id)
        .where(SeasonProgress.season_id == active.id)
        .order_by(desc(SeasonProgress.exp_total))
        .limit(1)
    ).first()

    if not top:
        return BountyChampionOut(
            season_id=active.id, season_name=active.name,
            player_id=None, alias=None, elite_id=None,
            exp_total=0, bounty_exp=BOUNTY_EXP_REWARD,
        )

    progress, profile = top
    me_pid = current.profile.id if current and current.profile else None
    return BountyChampionOut(
        season_id=active.id,
        season_name=active.name,
        player_id=profile.id,
        alias=profile.alias,
        elite_id=profile.elite_id_code,
        exp_total=progress.exp_total or 0,
        avatar_url=profile.avatar_url,
        is_me=(profile.id == me_pid),
        bounty_exp=BOUNTY_EXP_REWARD,
    )


@router.get("/feed", response_model=list[BountyKillFeedItem])
def bounty_feed(db: DbDep, limit: int = 20) -> list[BountyKillFeedItem]:
    """Últimas victorias sobre el campeón. Para mostrar 'wall of regicidas'."""
    limit = max(1, min(limit, 50))
    killer = PlayerProfile.__table__.alias("killer")
    victim = PlayerProfile.__table__.alias("victim")
    rows = db.execute(
        select(
            BountyKill.created_at,
            BountyKill.event_id,
            BountyKill.exp_awarded,
            killer.c.alias.label("killer_alias"),
            victim.c.alias.label("victim_alias"),
        )
        .join(killer, killer.c.id == BountyKill.killer_player_id)
        .join(victim, victim.c.id == BountyKill.victim_player_id)
        .order_by(desc(BountyKill.created_at))
        .limit(limit)
    ).all()
    return [
        BountyKillFeedItem(
            killer_alias=r.killer_alias,
            victim_alias=r.victim_alias,
            event_id=r.event_id,
            occurred_at=r.created_at,
            exp_awarded=r.exp_awarded,
        )
        for r in rows
    ]


class MyBountyOut(BaseModel):
    total_kills: int
    season_kills: int
    total_bounty_exp: int


@router.get("/me", response_model=MyBountyOut)
def my_bounties(db: DbDep, current: OptionalUserDep) -> MyBountyOut:
    """Cuántos regicidios tiene el usuario actual."""
    if not current or not current.profile:
        return MyBountyOut(total_kills=0, season_kills=0, total_bounty_exp=0)
    active = db.scalar(select(Season).where(Season.status == SeasonStatus.ACTIVE))
    total = db.scalar(
        select(func.count(BountyKill.id)).where(BountyKill.killer_player_id == current.profile.id)
    ) or 0
    season = 0
    if active:
        season = db.scalar(
            select(func.count(BountyKill.id)).where(
                BountyKill.killer_player_id == current.profile.id,
                BountyKill.season_id == active.id,
            )
        ) or 0
    total_exp = db.scalar(
        select(func.coalesce(func.sum(BountyKill.exp_awarded), 0)).where(
            BountyKill.killer_player_id == current.profile.id
        )
    ) or 0
    return MyBountyOut(total_kills=total, season_kills=season, total_bounty_exp=int(total_exp))
