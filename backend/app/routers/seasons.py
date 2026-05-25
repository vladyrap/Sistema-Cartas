from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import DbDep, GuildContext
from app.models import Season, SeasonStatus
from app.schemas.common import SeasonOut

router = APIRouter()


@router.get("/active", response_model=SeasonOut | None)
def active_season(db: DbDep, guild: GuildContext) -> Season | None:
    stmt = select(Season).where(Season.status == SeasonStatus.ACTIVE)
    if guild is not None:
        stmt = stmt.where(Season.guild_id == guild.id)
    return db.scalar(stmt)


@router.get("", response_model=list[SeasonOut])
def list_seasons(db: DbDep, guild: GuildContext) -> list[Season]:
    stmt = select(Season).order_by(Season.number.desc())
    if guild is not None:
        stmt = stmt.where(Season.guild_id == guild.id)
    return list(db.scalars(stmt))


@router.get("/{season_id}", response_model=SeasonOut)
def get_season(season_id: int, db: DbDep, guild: GuildContext) -> Season:
    s = db.get(Season, season_id)
    if not s or (guild is not None and s.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Temporada no encontrada")
    return s
