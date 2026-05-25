from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import DbDep, GuildContext
from app.models import PlayerProfile, Season, SeasonProgress, SeasonStatus
from app.schemas.common import RankingResponse, RankingRow

router = APIRouter()


def _build_ranking(db, season: Season) -> RankingResponse:
    rows = db.execute(
        select(
            PlayerProfile.id,
            PlayerProfile.alias,
            PlayerProfile.player_class,
            PlayerProfile.prestige,
            SeasonProgress.level,
            SeasonProgress.current_rank,
            SeasonProgress.exp_total,
            SeasonProgress.was_promoted_start,
        )
        .join(SeasonProgress, SeasonProgress.player_id == PlayerProfile.id)
        .where(SeasonProgress.season_id == season.id)
        .order_by(SeasonProgress.exp_total.desc(), SeasonProgress.level.desc())
    ).all()
    ranking = [
        RankingRow(
            position=i + 1,
            player_id=r[0],
            alias=r[1],
            player_class=r[2],
            prestige=r[3],
            level=r[4],
            current_rank=r[5],
            exp_total=r[6],
            was_promoted_start=r[7],
        )
        for i, r in enumerate(rows)
    ]
    return RankingResponse(season_id=season.id, season_name=season.name, rows=ranking)


@router.get("/active", response_model=RankingResponse)
def ranking_active(db: DbDep, guild: GuildContext) -> RankingResponse:
    stmt = select(Season).where(Season.status == SeasonStatus.ACTIVE)
    if guild is not None:
        stmt = stmt.where(Season.guild_id == guild.id)
    season = db.scalar(stmt)
    if not season:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No hay temporada activa")
    return _build_ranking(db, season)


@router.get("/season/{season_id}", response_model=RankingResponse)
def ranking_by_season(season_id: int, db: DbDep, guild: GuildContext) -> RankingResponse:
    season = db.get(Season, season_id)
    if not season or (guild is not None and season.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Temporada no encontrada")
    return _build_ranking(db, season)
