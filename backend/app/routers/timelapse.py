"""Time-Lapse Replay — devuelve la serie de snapshots del evento para animar.

Cada snapshot es el estado de standings tras cada ronda. El frontend interpola
entre snapshots para producir una animación de ~30s.
"""
from collections import defaultdict
from datetime import datetime

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import DbDep
from app.models import Event, EventRegistration, MatchResult, PlayerProfile

router = APIRouter()


class RoundStanding(BaseModel):
    player_id: int
    alias: str
    rank: int
    match_points: int
    rounds_won: int


class RoundSnapshot(BaseModel):
    round_number: int
    standings: list[RoundStanding]
    finished_at: datetime | None


class TimelapseOut(BaseModel):
    event_id: int
    event_name: str
    total_rounds: int
    players: int
    snapshots: list[RoundSnapshot]


@router.get("/events/{event_id}/timelapse", response_model=TimelapseOut)
def get_timelapse(event_id: int, db: DbDep) -> TimelapseOut:
    """Recalcula standings ronda-por-ronda a partir de match_results. O(rounds × players)."""
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")

    matches = list(db.scalars(
        select(MatchResult).where(MatchResult.event_id == event_id).order_by(MatchResult.round_number)
    ))
    if not matches:
        return TimelapseOut(
            event_id=ev.id, event_name=ev.name, total_rounds=0, players=0, snapshots=[],
        )

    # Cargar todos los profiles involucrados
    pids: set[int] = set()
    for m in matches:
        pids.add(m.player_a_id)
        if m.player_b_id:
            pids.add(m.player_b_id)
    profiles = {p.id: p for p in db.scalars(
        select(PlayerProfile).where(PlayerProfile.id.in_(pids))
    )}

    # Acumular MP, rounds_won, etc. round-by-round
    state: dict[int, dict[str, int]] = defaultdict(lambda: {"mp": 0, "w": 0, "l": 0, "d": 0})
    by_round: dict[int, list[MatchResult]] = defaultdict(list)
    for m in matches:
        by_round[m.round_number].append(m)

    snapshots: list[RoundSnapshot] = []
    rounds_sorted = sorted(by_round.keys())
    for rnd in rounds_sorted:
        round_finished_at: datetime | None = None
        for m in by_round[rnd]:
            if m.reported_at and (round_finished_at is None or m.reported_at > round_finished_at):
                round_finished_at = m.reported_at
            if m.reported_at is None and not m.is_bye:
                continue  # ignorar matches sin reportar
            if m.is_bye:
                state[m.player_a_id]["mp"] += 3
                state[m.player_a_id]["w"] += 1
            elif m.is_draw:
                state[m.player_a_id]["mp"] += 1
                state[m.player_a_id]["d"] += 1
                if m.player_b_id:
                    state[m.player_b_id]["mp"] += 1
                    state[m.player_b_id]["d"] += 1
            elif m.winner_id == m.player_a_id:
                state[m.player_a_id]["mp"] += 3
                state[m.player_a_id]["w"] += 1
                if m.player_b_id:
                    state[m.player_b_id]["l"] += 1
            elif m.winner_id == m.player_b_id and m.player_b_id:
                state[m.player_b_id]["mp"] += 3
                state[m.player_b_id]["w"] += 1
                state[m.player_a_id]["l"] += 1

        rows_sorted = sorted(state.items(), key=lambda kv: (-kv[1]["mp"], -kv[1]["w"]))
        round_standings: list[RoundStanding] = []
        for i, (pid, st) in enumerate(rows_sorted, start=1):
            p = profiles.get(pid)
            if not p:
                continue
            round_standings.append(RoundStanding(
                player_id=pid, alias=p.alias, rank=i,
                match_points=st["mp"], rounds_won=st["w"],
            ))
        snapshots.append(RoundSnapshot(
            round_number=rnd, standings=round_standings, finished_at=round_finished_at,
        ))

    return TimelapseOut(
        event_id=ev.id, event_name=ev.name,
        total_rounds=len(rounds_sorted), players=len(pids),
        snapshots=snapshots,
    )
