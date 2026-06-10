"""Wrapped EliteCards — highlights del jugador para la temporada (estilo Spotify Wrapped).

Calcula in-memory desde los datos seedeados:
  - matches jugados / ganados / perdidos
  - win rate
  - mejor partido (mayor delta de rating)
  - racha más larga
  - eventos asistidos
  - EXP total ganada
  - títulos desbloqueados en la temporada
  - posición final en ranking
"""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import and_, desc, func, or_, select

from app.core.deps import DbDep, UserDep
from app.models import (
    Event, ExpTransaction, MatchResult, PlayerProfile, PlayerStreak,
    Season, SeasonProgress, SeasonStatus,
)

router = APIRouter()


class WrappedStat(BaseModel):
    label: str
    value: str
    sub: str | None = None
    accent: str = "violet"  # violet | amber | cyan | rose | emerald | fuchsia


class BestMatchOut(BaseModel):
    opponent_alias: str | None = None
    event_id: int | None = None
    event_name: str | None = None
    rating_delta: float | None = None
    occurred_at: datetime | None = None


class WrappedOut(BaseModel):
    season_id: int
    season_name: str
    player_alias: str
    matches_played: int
    matches_won: int
    matches_lost: int
    matches_drawn: int
    win_rate: float
    longest_streak: int
    events_attended: int
    exp_total: int
    rank_position: int | None
    best_match: BestMatchOut | None
    stats: list[WrappedStat]
    headline: str  # Frase grande para el slide final


@router.get("/me", response_model=WrappedOut)
def my_wrapped(db: DbDep, current: UserDep, season_id: int | None = None) -> WrappedOut:
    """Wrapped de la temporada indicada (o la activa si no se manda)."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")

    pid = current.profile.id

    if season_id:
        season = db.get(Season, season_id)
    else:
        season = db.scalar(select(Season).where(Season.status == SeasonStatus.ACTIVE))
    if not season:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Temporada no encontrada")

    # Matches en esta temporada (filtramos por eventos que pertenezcan a la season)
    matches_q = (
        select(MatchResult)
        .join(Event, MatchResult.event_id == Event.id)
        .where(
            Event.season_id == season.id,
            or_(MatchResult.player_a_id == pid, MatchResult.player_b_id == pid),
        )
    )
    matches = list(db.scalars(matches_q))

    won = lost = drawn = 0
    best = None
    best_score = -1.0
    for m in matches:
        is_a = m.player_a_id == pid
        my_games = m.games_a if is_a else m.games_b
        opp_games = m.games_b if is_a else m.games_a
        if m.is_draw or m.winner_id is None:
            drawn += 1
        elif m.winner_id == pid:
            won += 1
        else:
            lost += 1
        # Mejor match heurística: mayor (my_games - opp_games) ponderado por my_games
        score = (my_games - opp_games) + my_games * 0.5
        if score > best_score:
            best_score = float(score)
            opp_id = m.player_b_id if is_a else m.player_a_id
            best = (m, opp_id, my_games, opp_games)

    total = won + lost + drawn
    win_rate = round(won / total * 100, 1) if total else 0.0

    # Best match payload
    best_match = None
    if best:
        m, opp_id, my_g, opp_g = best
        opp = db.get(PlayerProfile, opp_id) if opp_id else None
        ev = db.get(Event, m.event_id) if m.event_id else None
        best_match = BestMatchOut(
            opponent_alias=opp.alias if opp else None,
            event_id=ev.id if ev else None,
            event_name=ev.name if ev else None,
            rating_delta=float(my_g - opp_g),
            occurred_at=m.created_at,
        )

    # Longest streak (toma el mayor entre todos los gremios del jugador)
    longest = db.scalar(
        select(func.coalesce(func.max(PlayerStreak.longest_streak), 0))
        .where(PlayerStreak.player_id == pid)
    ) or 0

    # Eventos asistidos: distintos event_ids con match del jugador
    events_attended = len({m.event_id for m in matches if m.event_id})

    # EXP total ganada en la temporada
    exp_total = db.scalar(
        select(func.coalesce(func.sum(ExpTransaction.amount), 0)).where(
            ExpTransaction.player_id == pid,
            ExpTransaction.season_id == season.id,
        )
    ) or 0

    # Posición en ranking
    rank_position = None
    progress = db.scalar(
        select(SeasonProgress).where(
            SeasonProgress.player_id == pid, SeasonProgress.season_id == season.id,
        )
    )
    if progress:
        ahead = db.scalar(
            select(func.count(SeasonProgress.id)).where(
                SeasonProgress.season_id == season.id,
                SeasonProgress.exp_total > progress.exp_total,
            )
        ) or 0
        rank_position = ahead + 1

    # Headline pegadora
    if win_rate >= 70:
        headline = f"Dominaste el {season.name}."
    elif won >= 30:
        headline = f"{won} victorias. Una bestia."
    elif total >= 20:
        headline = f"Disputaste {total} batallas. Veterano."
    elif total >= 5:
        headline = "Diste pelea. La próxima vas por más."
    else:
        headline = "Apenas calentaste motores."

    stats: list[WrappedStat] = [
        WrappedStat(label="Matches jugados", value=str(total), accent="violet"),
        WrappedStat(label="Victorias", value=str(won), sub=f"{win_rate}% win rate", accent="emerald"),
        WrappedStat(label="Racha más larga", value=str(longest), sub="victorias consecutivas", accent="amber"),
        WrappedStat(label="Eventos asistidos", value=str(events_attended), accent="cyan"),
        WrappedStat(label="EXP de la temporada", value=f"{int(exp_total):,}".replace(",", "."), accent="fuchsia"),
    ]
    if rank_position:
        stats.append(WrappedStat(
            label="Posición en ranking",
            value=f"#{rank_position}",
            sub=f"sobre {season.name}",
            accent="rose",
        ))

    return WrappedOut(
        season_id=season.id,
        season_name=season.name,
        player_alias=current.profile.alias,
        matches_played=total,
        matches_won=won,
        matches_lost=lost,
        matches_drawn=drawn,
        win_rate=win_rate,
        longest_streak=longest,
        events_attended=events_attended,
        exp_total=int(exp_total),
        rank_position=rank_position,
        best_match=best_match,
        stats=stats,
        headline=headline,
    )
