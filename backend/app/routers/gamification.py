"""Router de gamificación: misiones del jugador, medallas, Hall of Fame."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.core.deps import AdminDep, DbDep, GuildContext, ScopedAdminDep, UserDep, assert_resource_in_user_guild
from app.models import Achievement, Mission, Season, SeasonStatus
from app.schemas.common import (
    AchievementOut,
    GrantAchievementRequest,
    HallOfFameRow,
    MissionOut,
    PlayerAchievementOut,
    PlayerMissionOut,
    PlayerMissionWithMission,
)
from app.services import gamification as gm

router = APIRouter()
admin_router = APIRouter()


# ============================== Missions (jugador) ==============================


@router.get("/missions/me", response_model=list[PlayerMissionWithMission])
def my_missions(db: DbDep, current: UserDep, guild: GuildContext) -> list[PlayerMissionWithMission]:
    if not current.profile:
        return []
    active_stmt = select(Season).where(Season.status == SeasonStatus.ACTIVE)
    if guild is not None:
        active_stmt = active_stmt.where(Season.guild_id == guild.id)
    active = db.scalar(active_stmt)
    pairs = gm.get_or_create_player_missions(
        db,
        player_id=current.profile.id,
        season_id=active.id if active else None,
        guild_id=guild.id if guild else None,
    )
    db.commit()
    return [
        PlayerMissionWithMission(
            mission=MissionOut.model_validate(m),
            state=PlayerMissionOut.model_validate(pm),
        )
        for m, pm in pairs
    ]


@router.get("/missions/active", response_model=list[MissionOut])
def list_missions_active(db: DbDep, guild: GuildContext) -> list[Mission]:
    active_stmt = select(Season).where(Season.status == SeasonStatus.ACTIVE)
    if guild is not None:
        active_stmt = active_stmt.where(Season.guild_id == guild.id)
    active = db.scalar(active_stmt)
    return gm.list_active_missions(
        db,
        season_id=active.id if active else None,
        guild_id=guild.id if guild else None,
    )


# ============================== Achievements (jugador) ==============================


@router.get("/achievements", response_model=list[AchievementOut])
def list_achievements_catalog(db: DbDep, guild: GuildContext) -> list[Achievement]:
    stmt = select(Achievement).where(Achievement.is_secret.is_(False))
    if guild is not None:
        stmt = stmt.where(Achievement.guild_id == guild.id)
    return list(db.scalars(stmt.order_by(Achievement.name)))


@router.get("/achievements/me", response_model=list[PlayerAchievementOut])
def my_achievements(db: DbDep, current: UserDep) -> list[PlayerAchievementOut]:
    if not current.profile:
        return []
    items = gm.list_player_achievements(db, player_id=current.profile.id)
    return [
        PlayerAchievementOut(
            achievement=AchievementOut.model_validate(ach),
            season_id=pa.season_id,
            earned_at=pa.earned_at,
        )
        for ach, pa in items
    ]


@router.get("/achievements/player/{player_id}", response_model=list[PlayerAchievementOut])
def achievements_of_player(player_id: int, db: DbDep) -> list[PlayerAchievementOut]:
    items = gm.list_player_achievements(db, player_id=player_id)
    return [
        PlayerAchievementOut(
            achievement=AchievementOut.model_validate(ach),
            season_id=pa.season_id,
            earned_at=pa.earned_at,
        )
        for ach, pa in items
    ]


# ============================== Hall of Fame ==============================


@router.get("/hall-of-fame", response_model=list[HallOfFameRow])
def hall_of_fame(
    db: DbDep,
    guild: GuildContext,
    season_id: int | None = Query(default=None),
    scope: str = Query(default="guild", description="'guild' = filtra por X-Guild-Id; 'global' = todos los Gremios"),
) -> list[dict]:
    effective_guild = guild.id if (guild and scope != "global") else None
    return gm.list_hall_of_fame(
        db, season_id=season_id, guild_id=effective_guild,
    )


# ============================== Admin actions ==============================


@admin_router.post("/missions/{player_mission_id}/complete", response_model=PlayerMissionOut)
def admin_complete_mission(player_mission_id: int, db: DbDep, admin: ScopedAdminDep, guild: GuildContext):
    from app.models import Mission, PlayerMission
    pm_row = db.get(PlayerMission, player_mission_id)
    if pm_row:
        mission = db.get(Mission, pm_row.mission_id)
        assert_resource_in_user_guild(
            user=admin,
            resource_guild_id=mission.guild_id if mission else None,
            x_guild_id=guild.id if guild else None,
        )
    pm = gm.complete_mission(db, player_mission_id=player_mission_id, admin_id=admin.id)
    db.commit()
    db.refresh(pm)
    return pm


@admin_router.post("/achievements/grant", response_model=PlayerAchievementOut)
def admin_grant_achievement(payload: GrantAchievementRequest, db: DbDep, admin: ScopedAdminDep, guild: GuildContext):
    ach_check = db.get(Achievement, payload.achievement_id)
    assert_resource_in_user_guild(
        user=admin,
        resource_guild_id=ach_check.guild_id if ach_check else None,
        x_guild_id=guild.id if guild else None,
    )
    pa = gm.grant_achievement(
        db,
        player_id=payload.player_id,
        achievement_id=payload.achievement_id,
        season_id=payload.season_id,
        admin_id=admin.id,
    )
    ach = db.get(Achievement, pa.achievement_id)
    db.commit()
    if not ach:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Medalla no encontrada")
    return PlayerAchievementOut(
        achievement=AchievementOut.model_validate(ach),
        season_id=pa.season_id,
        earned_at=pa.earned_at,
    )
