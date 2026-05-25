"""Feed público de actividad reciente en la plataforma."""
from __future__ import annotations

from sqlalchemy import select

from fastapi import APIRouter, Query

from app.core.deps import DbDep
from app.models import (
    EventRegistration,
    ExpTransaction,
    HallOfFameEntry,
    PlayerAchievement,
    PlayerProfile,
    Season,
    SeasonProgress,
)
from app.models.event import Event
from app.models.achievement import Achievement
from app.schemas.common import ActivityRow

router = APIRouter()


@router.get("/feed", response_model=list[ActivityRow])
def activity_feed(db: DbDep, limit: int = Query(default=30, ge=1, le=100)) -> list[ActivityRow]:
    """Combina varios feeds de actividad ordenados por timestamp DESC."""
    out: list[ActivityRow] = []

    # Inscripciones recientes
    regs = db.execute(
        select(EventRegistration, PlayerProfile, Event)
        .join(PlayerProfile, EventRegistration.player_id == PlayerProfile.id)
        .join(Event, EventRegistration.event_id == Event.id)
        .order_by(EventRegistration.registered_at.desc().nulls_last())
        .limit(limit)
    ).all()
    for reg, player, ev in regs:
        if reg.registered_at is None:
            continue
        out.append(ActivityRow(
            kind="event_registration",
            at=reg.registered_at,
            player_id=player.id,
            player_alias=player.alias,
            description=f"se inscribió a {ev.name}",
            link=f"/events/{ev.id}",
        ))

    # Medallas recientes
    achievements = db.execute(
        select(PlayerAchievement, PlayerProfile, Achievement)
        .join(PlayerProfile, PlayerAchievement.player_id == PlayerProfile.id)
        .join(Achievement, PlayerAchievement.achievement_id == Achievement.id)
        .where(PlayerAchievement.earned_at.is_not(None))
        .order_by(PlayerAchievement.earned_at.desc())
        .limit(limit)
    ).all()
    for pa, player, ach in achievements:
        out.append(ActivityRow(
            kind="achievement",
            at=pa.earned_at,
            player_id=player.id,
            player_alias=player.alias,
            description=f"obtuvo la medalla '{ach.name}'",
            link=f"/players/{player.id}",
        ))

    # Campeones de temporadas cerradas (HoF entries)
    hof = db.execute(
        select(HallOfFameEntry, PlayerProfile, Season)
        .join(PlayerProfile, HallOfFameEntry.player_id == PlayerProfile.id)
        .join(Season, HallOfFameEntry.season_id == Season.id)
        .where(HallOfFameEntry.category == "season_champion")
        .order_by(Season.closed_at.desc().nulls_last())
        .limit(limit)
    ).all()
    for entry, player, season in hof:
        if season.closed_at is None:
            continue
        out.append(ActivityRow(
            kind="champion",
            at=season.closed_at,
            player_id=player.id,
            player_alias=player.alias,
            description=f"👑 fue Campeón de la {season.name}",
            link="/hall-of-fame",
        ))

    # EXP grandes (top 8, finalist, champion) — feed competitivo
    big_exp_codes = ("champion", "finalist", "top_4", "top_8")
    big_exp = db.execute(
        select(ExpTransaction, PlayerProfile, Event)
        .join(PlayerProfile, ExpTransaction.player_id == PlayerProfile.id)
        .outerjoin(Event, ExpTransaction.related_event_id == Event.id)
        .where(ExpTransaction.reason_code.in_(big_exp_codes))
        .order_by(ExpTransaction.created_at.desc())
        .limit(limit)
    ).all()
    code_to_label = {
        "champion": "🥇 fue campeón",
        "finalist": "🥈 llegó a la final",
        "top_4": "🥉 top 4",
        "top_8": "top 8",
    }
    for tx, player, ev in big_exp:
        label = code_to_label.get(tx.reason_code, "destacó")
        ev_name = ev.name if ev else "un evento"
        out.append(ActivityRow(
            kind="result",
            at=tx.created_at,
            player_id=player.id,
            player_alias=player.alias,
            description=f"{label} en {ev_name}",
            link=f"/events/{ev.id}" if ev else None,
        ))

    out.sort(key=lambda r: r.at, reverse=True)
    return out[:limit]
