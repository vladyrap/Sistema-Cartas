"""Devotion / Cult Mode — devotees + altares por archetype + ofrendas EXP."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError

from app.core.deps import DbDep, UserDep
from app.core.rate_limit import limiter
from app.models import (
    ArchetypeDevotion, ExpTransaction, PlayerProfile, Season, SeasonStatus,
)

log = logging.getLogger("devotion")
router = APIRouter()


class AltarOut(BaseModel):
    archetype: str
    devotee_count: int
    total_devotion: int
    total_offered_exp: int
    top_devotee_alias: str | None
    top_devotee_player_id: int | None
    rank_tier: str  # ascending: "Shrine" -> "Altar" -> "Temple" -> "Cathedral" -> "Pantheon"


def _tier(total_devotion: int, devotees: int) -> str:
    if devotees >= 50 and total_devotion >= 10000: return "Pantheon"
    if devotees >= 20 and total_devotion >= 5000: return "Cathedral"
    if devotees >= 10 and total_devotion >= 2000: return "Temple"
    if devotees >= 5: return "Altar"
    return "Shrine"


@router.get("/altars", response_model=list[AltarOut])
def list_altars(db: DbDep, limit: int = 30) -> list[AltarOut]:
    """Top altares (archetypes) por devoción total."""
    limit = max(1, min(limit, 100))
    rows = db.execute(
        select(
            ArchetypeDevotion.archetype,
            func.count(ArchetypeDevotion.id).label("devotees"),
            func.sum(ArchetypeDevotion.devotion_points).label("total"),
            func.sum(ArchetypeDevotion.offered_exp).label("offered"),
        )
        .group_by(ArchetypeDevotion.archetype)
        .order_by(desc("total"))
        .limit(limit)
    ).all()

    out: list[AltarOut] = []
    for archetype, devotees, total, offered in rows:
        top_row = db.execute(
            select(ArchetypeDevotion, PlayerProfile)
            .join(PlayerProfile, PlayerProfile.id == ArchetypeDevotion.player_id)
            .where(ArchetypeDevotion.archetype == archetype)
            .order_by(desc(ArchetypeDevotion.devotion_points))
            .limit(1)
        ).first()
        top_alias = top_row[1].alias if top_row else None
        top_pid = top_row[1].id if top_row else None
        out.append(AltarOut(
            archetype=archetype,
            devotee_count=int(devotees or 0),
            total_devotion=int(total or 0),
            total_offered_exp=int(offered or 0),
            top_devotee_alias=top_alias,
            top_devotee_player_id=top_pid,
            rank_tier=_tier(int(total or 0), int(devotees or 0)),
        ))
    return out


class DevoteeOut(BaseModel):
    player_id: int
    alias: str
    elite_id_code: str
    devotion_points: int
    offered_exp: int
    matches_played: int


@router.get("/altars/{archetype}/devotees", response_model=list[DevoteeOut])
def altar_devotees(archetype: str, db: DbDep, limit: int = 50) -> list[DevoteeOut]:
    rows = db.execute(
        select(ArchetypeDevotion, PlayerProfile)
        .join(PlayerProfile, PlayerProfile.id == ArchetypeDevotion.player_id)
        .where(ArchetypeDevotion.archetype == archetype)
        .order_by(desc(ArchetypeDevotion.devotion_points))
        .limit(min(limit, 200))
    ).all()
    return [
        DevoteeOut(
            player_id=p.id, alias=p.alias, elite_id_code=p.elite_id_code,
            devotion_points=d.devotion_points, offered_exp=d.offered_exp,
            matches_played=d.matches_played,
        )
        for d, p in rows
    ]


class MyDevotionOut(BaseModel):
    archetypes: list[dict]  # [{archetype, devotion_points, offered_exp}]
    primary_archetype: str | None


@router.get("/me", response_model=MyDevotionOut)
def my_devotion(current: UserDep, db: DbDep) -> MyDevotionOut:
    if not current.profile:
        return MyDevotionOut(archetypes=[], primary_archetype=None)
    rows = list(db.scalars(
        select(ArchetypeDevotion)
        .where(ArchetypeDevotion.player_id == current.profile.id)
        .order_by(desc(ArchetypeDevotion.devotion_points))
    ))
    return MyDevotionOut(
        archetypes=[
            {
                "archetype": r.archetype,
                "devotion_points": r.devotion_points,
                "offered_exp": r.offered_exp,
                "matches_played": r.matches_played,
            } for r in rows
        ],
        primary_archetype=rows[0].archetype if rows else None,
    )


class OfferIn(BaseModel):
    archetype: str = Field(min_length=1, max_length=80)
    exp: int = Field(ge=10, le=2000)


@router.post("/offer", response_model=MyDevotionOut)
@limiter.limit("10/day")
def make_offering(request: Request, payload: OfferIn, current: UserDep, db: DbDep) -> MyDevotionOut:
    """Ofrenda EXP al altar de un archetype. La EXP se debita de la season activa."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    active = db.scalar(select(Season).where(Season.status == SeasonStatus.ACTIVE))
    if not active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No hay temporada activa")

    # Verificar EXP disponible
    avail = db.scalar(
        select(func.coalesce(func.sum(ExpTransaction.amount), 0)).where(
            ExpTransaction.player_id == current.profile.id,
            ExpTransaction.season_id == active.id,
        )
    ) or 0
    if int(avail) < payload.exp:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"EXP insuficiente: tenés {int(avail)}, querés ofrendar {payload.exp}",
        )

    # Resolver o crear devotion row
    devotion = db.scalar(
        select(ArchetypeDevotion).where(
            ArchetypeDevotion.player_id == current.profile.id,
            ArchetypeDevotion.archetype == payload.archetype,
        )
    )
    if not devotion:
        devotion = ArchetypeDevotion(
            player_id=current.profile.id, archetype=payload.archetype,
        )
        db.add(devotion)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            devotion = db.scalar(select(ArchetypeDevotion).where(
                ArchetypeDevotion.player_id == current.profile.id,
                ArchetypeDevotion.archetype == payload.archetype,
            ))

    devotion.offered_exp += payload.exp
    devotion.devotion_points += payload.exp * 2  # ofrendas valen el doble

    db.add(ExpTransaction(
        player_id=current.profile.id,
        season_id=active.id,
        amount=-payload.exp,
        reason=f"devotion_offering:{payload.archetype}",
    ))
    db.commit()
    return my_devotion(current, db)


def increment_match_devotion(db, *, player_id: int, archetype: str, won: bool) -> None:
    """Helper para llamar desde el reporte de match: si el deck tiene archetype,
    incrementar devotion_points (3 por win, 1 por play). NO commitea — lo hace el caller.
    """
    if not archetype:
        return
    devotion = db.scalar(
        select(ArchetypeDevotion).where(
            ArchetypeDevotion.player_id == player_id,
            ArchetypeDevotion.archetype == archetype,
        )
    )
    if not devotion:
        devotion = ArchetypeDevotion(player_id=player_id, archetype=archetype)
        db.add(devotion)
        try:
            db.flush()
        except IntegrityError:
            db.rollback()
            return
    devotion.matches_played += 1
    devotion.devotion_points += 3 if won else 1
    devotion.last_played_at = datetime.now(timezone.utc)
