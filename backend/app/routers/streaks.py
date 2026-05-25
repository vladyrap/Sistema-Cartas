"""Streaks por jugador + leaderboard en vivo de la temporada activa."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import func, select

from app.core.deps import DbDep, GuildContext, UserDep
from app.models import (
    ExpTransaction, PlayerProfile, PlayerStreak, Season, SeasonProgress, SeasonStatus,
)
from app.schemas.common import LeaderboardRow, StreakOut
from app.services import streak as streak_svc
from app.services.progression import rank_from_level

router = APIRouter()


def _next_milestone(current: int) -> int | None:
    """Próximo hito relevante (incremento de bonus EXP)."""
    # +5% por nivel hasta +50% (streak 11). Hitos cada 5: 5, 10, 11.
    for m in (2, 5, 10, 11, 20, 50, 100):
        if m > current:
            return m
    return None


@router.get("/me", response_model=StreakOut)
def my_streak(db: DbDep, current: UserDep, guild: GuildContext) -> StreakOut:
    """Racha del jugador en el Gremio actual."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil de jugador")
    if not guild:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Falta header X-Guild-Id")
    s = streak_svc.get(db, player_id=current.profile.id, guild_id=guild.id)
    if not s:
        return StreakOut(
            guild_id=guild.id,
            current_streak=0,
            longest_streak=0,
            last_attended_at=None,
            exp_multiplier=1.0,
            next_milestone=2,
        )
    return StreakOut(
        guild_id=s.guild_id,
        current_streak=s.current_streak,
        longest_streak=s.longest_streak,
        last_attended_at=s.last_attended_at,
        exp_multiplier=streak_svc.exp_multiplier(s.current_streak),
        next_milestone=_next_milestone(s.current_streak),
    )


@router.get("/live", response_model=list[LeaderboardRow])
def leaderboard_live(
    db: DbDep, guild: GuildContext,
    limit: int = Query(default=10, ge=1, le=100),
) -> list[LeaderboardRow]:
    """Top de la temporada activa, scopeado al Gremio actual.

    Incluye delta de EXP en las últimas 24h (para mostrar quién está moviendo el ranking).
    """
    # Temporada activa del Gremio
    season_stmt = select(Season).where(Season.status == SeasonStatus.ACTIVE)
    if guild:
        season_stmt = season_stmt.where(Season.guild_id == guild.id)
    season = db.scalar(season_stmt)
    if not season:
        return []

    # Top por exp_total
    rows = db.execute(
        select(SeasonProgress, PlayerProfile)
        .join(PlayerProfile, SeasonProgress.player_id == PlayerProfile.id)
        .where(SeasonProgress.season_id == season.id)
        .order_by(SeasonProgress.exp_total.desc(), SeasonProgress.level.desc())
        .limit(limit)
    ).all()
    if not rows:
        return []

    # Delta 24h: suma de ExpTransaction.amount por player en las últimas 24h
    cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
    player_ids = [p.id for _, p in rows]
    deltas: dict[int, int] = {}
    if player_ids:
        delta_rows = db.execute(
            select(ExpTransaction.player_id, func.coalesce(func.sum(ExpTransaction.amount), 0))
            .where(
                ExpTransaction.player_id.in_(player_ids),
                ExpTransaction.season_id == season.id,
                ExpTransaction.created_at >= cutoff,
            )
            .group_by(ExpTransaction.player_id)
        ).all()
        for pid, total in delta_rows:
            deltas[pid] = int(total)

    out: list[LeaderboardRow] = []
    for idx, (sp, player) in enumerate(rows, start=1):
        out.append(LeaderboardRow(
            rank=idx,
            player_id=player.id,
            player_alias=player.alias,
            player_elite_id=player.elite_id_code,
            level=sp.level,
            rank_name=rank_from_level(sp.level).value,
            exp_total=sp.exp_total,
            exp_in_level=sp.exp_in_level,
            delta_24h=deltas.get(player.id, 0),
        ))
    return out
