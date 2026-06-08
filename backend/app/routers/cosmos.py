"""Cosmos endpoints — alimenta el planetario 3D del Hall of Fame.

Cada jugador es una estrella; coordenadas 3D deterministas derivadas de su
elite_id_number (golden-angle distribution sobre esfera Fibonacci), con
radio modulado por rating Glicko-2 y temperatura por player_class.
"""
from __future__ import annotations

import math
from typing import Optional

from pydantic import BaseModel
from fastapi import APIRouter, Query
from sqlalchemy import func, select

from app.core.deps import DbDep
from app.models import (
    Event,
    EventRegistration,
    EventStatus,
    Game,
    MatchResult,
    PlayerProfile,
    PlayerRating,
    SeasonHistory,
    User,
)


router = APIRouter()


class CosmosStar(BaseModel):
    player_id: int
    alias: str
    elite_id_code: str
    player_class: str
    # Posición sobre esfera unitaria (cliente la escala).
    x: float
    y: float
    z: float
    # Tamaño relativo 0.4-2.5 según rating.
    size: float
    # Hue HSL 0-360 según clase.
    hue: int
    # Brillo 0-1 (mientras más matches, más brilla).
    luminosity: float
    rating: float | None
    matches: int
    championships: int


class CosmosEdge(BaseModel):
    a: int
    b: int
    weight: int  # cantidad de matches entre a y b


class CosmosOut(BaseModel):
    stars: list[CosmosStar]
    edges: list[CosmosEdge]
    champion_id: int | None  # último campeón global (si aplica)


CLASS_HUES = {
    "DUELISTA":      0,    # rojo
    "ESTRATEGA":     220,  # azul
    "MENTOR":        45,   # ámbar
    "COLECCIONISTA": 280,  # violeta
    "TRADER":        140,  # verde
    "EXPLORADOR":    180,  # cyan
}


def _fibonacci_sphere(i: int, n: int) -> tuple[float, float, float]:
    """Distribución uniforme de N puntos sobre esfera unitaria via golden angle."""
    if n <= 0:
        return 0.0, 0.0, 0.0
    phi = math.pi * (3.0 - math.sqrt(5.0))  # golden angle
    y = 1.0 - (i / float(n - 1 if n > 1 else 1)) * 2.0
    radius = math.sqrt(max(0.0, 1.0 - y * y))
    theta = phi * i
    return radius * math.cos(theta), y, radius * math.sin(theta)


@router.get("", response_model=CosmosOut)
def cosmos(
    db: DbDep,
    game_id: Optional[int] = Query(default=None),
    max_edges: int = Query(default=300, ge=10, le=2000),
) -> CosmosOut:
    """Devuelve estrellas (jugadores) + edges (matches jugados) para el planetario."""
    players = list(db.scalars(select(PlayerProfile).join(User, User.id == PlayerProfile.user_id)))
    n = len(players)

    # Ratings cacheados por (player, game).
    rating_stmt = select(PlayerRating)
    if game_id is not None:
        rating_stmt = rating_stmt.where(PlayerRating.game_id == game_id)
    ratings_map: dict[int, PlayerRating] = {}
    for r in db.scalars(rating_stmt):
        # Si pidieron por game, usamos esa; sino, el mejor rating del jugador.
        cur = ratings_map.get(r.player_id)
        if cur is None or r.rating > cur.rating:
            ratings_map[r.player_id] = r

    # Championships históricos (final_position == 1).
    champ_counts: dict[int, int] = {}
    for pid, cnt in db.execute(
        select(SeasonHistory.player_id, func.count(SeasonHistory.id))
        .where(SeasonHistory.final_position == 1)
        .group_by(SeasonHistory.player_id)
    ).all():
        champ_counts[pid] = int(cnt)

    # Match counts.
    match_counts: dict[int, int] = {}
    rows_a = db.execute(
        select(MatchResult.player_a_id, func.count(MatchResult.id))
        .group_by(MatchResult.player_a_id)
    ).all()
    rows_b = db.execute(
        select(MatchResult.player_b_id, func.count(MatchResult.id))
        .where(MatchResult.player_b_id.is_not(None))
        .group_by(MatchResult.player_b_id)
    ).all()
    for pid, c in rows_a:
        if pid: match_counts[pid] = match_counts.get(pid, 0) + int(c)
    for pid, c in rows_b:
        if pid: match_counts[pid] = match_counts.get(pid, 0) + int(c)

    stars: list[CosmosStar] = []
    max_rating = max((r.rating for r in ratings_map.values()), default=1500.0)
    min_rating = min((r.rating for r in ratings_map.values()), default=1500.0)
    rspan = max(1.0, max_rating - min_rating)

    # Ordenar por elite_id_number para Fibonacci consistente.
    sorted_players = sorted(players, key=lambda p: p.elite_id_number)
    for idx, p in enumerate(sorted_players):
        x, y, z = _fibonacci_sphere(idx, max(n, 1))
        # Variación suave por elite_id (no cambia frame a frame)
        seed = (p.elite_id_number * 1103515245 + 12345) & 0x7FFFFFFF
        jitter = ((seed % 1000) / 1000.0 - 0.5) * 0.05
        x += jitter; y += jitter; z -= jitter

        rating = ratings_map.get(p.id)
        size = 0.5
        if rating:
            size = 0.5 + 2.0 * ((rating.rating - min_rating) / rspan)
        # Boost para campeones
        champs = champ_counts.get(p.id, 0)
        size += champs * 0.25

        matches = match_counts.get(p.id, 0)
        # Luminosity: log-scaled 0..1
        lum = 0.35 + min(0.65, math.log10(matches + 1) / 3.0)

        hue = CLASS_HUES.get(p.player_class.value if hasattr(p.player_class, "value") else str(p.player_class), 270)
        # Variación de tono por seed para que no sean todos iguales por clase
        hue = (hue + (seed % 30) - 15) % 360

        stars.append(CosmosStar(
            player_id=p.id, alias=p.alias, elite_id_code=p.elite_id_code,
            player_class=str(p.player_class.value if hasattr(p.player_class, "value") else p.player_class),
            x=round(x, 4), y=round(y, 4), z=round(z, 4),
            size=round(size, 3), hue=hue, luminosity=round(lum, 3),
            rating=round(rating.rating, 1) if rating else None,
            matches=matches,
            championships=champs,
        ))

    # Edges: top max_edges pares con más matches entre ellos.
    edge_rows = db.execute(
        select(
            MatchResult.player_a_id,
            MatchResult.player_b_id,
            func.count(MatchResult.id),
        )
        .where(MatchResult.player_b_id.is_not(None))
        .group_by(MatchResult.player_a_id, MatchResult.player_b_id)
        .order_by(func.count(MatchResult.id).desc())
        .limit(max_edges)
    ).all()
    edges = [CosmosEdge(a=int(a), b=int(b), weight=int(w)) for a, b, w in edge_rows]

    # Champion actual: último ganador (final_position=1 en SeasonHistory más reciente).
    last_champ = db.scalar(
        select(SeasonHistory.player_id)
        .where(SeasonHistory.final_position == 1)
        .order_by(SeasonHistory.id.desc())
        .limit(1)
    )

    return CosmosOut(stars=stars, edges=edges, champion_id=last_champ)


# ============================== War Room Aggregates ==============================


class WarRoomMeta(BaseModel):
    archetype: str
    game_id: int
    game_name: str
    deck_count: int
    legal_count: int
    win_rate: float | None = None


class WarRoomEvent(BaseModel):
    id: int
    name: str
    starts_at: str
    status: str
    registered: int
    slots: int
    game_name: str


class WarRoomTopPlayer(BaseModel):
    player_id: int
    alias: str
    elite_id_code: str
    player_class: str
    rating: float
    matches: int
    championships: int


class WarRoomActivity(BaseModel):
    timestamp: str
    type: str   # match_result | event_finalized | player_joined | ...
    summary: str


class WarRoomTicker(BaseModel):
    label: str
    value: int


class WarRoomOut(BaseModel):
    tickers: list[WarRoomTicker]
    meta: list[WarRoomMeta]
    upcoming_events: list[WarRoomEvent]
    top_players: list[WarRoomTopPlayer]
    activity: list[WarRoomActivity]
    cosmos_summary: dict


@router.get("/warroom", response_model=WarRoomOut)
def warroom(db: DbDep) -> WarRoomOut:
    """Endpoint agregado para la pantalla holographic War Room."""
    from datetime import datetime, timedelta, timezone
    from sqlalchemy import desc

    now = datetime.now(timezone.utc)

    # ---- Tickers ----
    tickers = [
        WarRoomTicker(label="Jugadores", value=db.scalar(select(func.count(PlayerProfile.id))) or 0),
        WarRoomTicker(label="Matches", value=db.scalar(select(func.count(MatchResult.id))) or 0),
        WarRoomTicker(label="Eventos", value=db.scalar(select(func.count(Event.id))) or 0),
        WarRoomTicker(label="Ratings", value=db.scalar(select(func.count(PlayerRating.id))) or 0),
    ]

    # ---- Meta (archetypes con más decks) ----
    from app.models import PlayerDeck as _PD, Game as _G
    meta_rows = db.execute(
        select(
            _PD.archetype,
            _PD.game_id,
            _G.name,
            func.count(_PD.id),
            func.sum(func.case((_PD.is_legal.is_(True), 1), else_=0)) if False else func.count(_PD.id),
        )
        .join(_G, _PD.game_id == _G.id)
        .where(_PD.archetype.is_not(None))
        .group_by(_PD.archetype, _PD.game_id, _G.name)
        .order_by(func.count(_PD.id).desc())
        .limit(12)
    ).all()
    meta = [
        WarRoomMeta(
            archetype=r[0], game_id=r[1], game_name=r[2],
            deck_count=int(r[3]), legal_count=int(r[3]),
        )
        for r in meta_rows
    ]

    # ---- Upcoming events (próximos OPEN/CLOSED) ----
    upcoming = list(db.scalars(
        select(Event)
        .where(Event.status.in_([EventStatus.OPEN, EventStatus.CLOSED, EventStatus.DRAFT]))
        .where(Event.starts_at >= now - timedelta(hours=24))
        .order_by(Event.starts_at)
        .limit(8)
    )) if hasattr(Event, "status") else []
    from app.models import EventStatus as _ES
    upcoming = list(db.scalars(
        select(Event)
        .where(Event.starts_at >= now - timedelta(hours=24))
        .order_by(Event.starts_at)
        .limit(8)
    ))
    upcoming_data = []
    for ev in upcoming:
        regs = db.scalar(
            select(func.count(EventRegistration.id)).where(EventRegistration.event_id == ev.id)
        ) or 0
        g = db.get(Game, ev.game_id)
        upcoming_data.append(WarRoomEvent(
            id=ev.id, name=ev.name,
            starts_at=ev.starts_at.isoformat(),
            status=ev.status.value if hasattr(ev.status, "value") else str(ev.status),
            registered=int(regs), slots=ev.slots,
            game_name=g.name if g else "—",
        ))

    # ---- Top players por rating ----
    top_rating_rows = db.execute(
        select(PlayerRating, PlayerProfile)
        .join(PlayerProfile, PlayerProfile.id == PlayerRating.player_id)
        .where(PlayerRating.matches_played >= 5)
        .order_by(PlayerRating.rating.desc())
        .limit(8)
    ).all()
    # Championships counts
    champ_counts = dict(db.execute(
        select(SeasonHistory.player_id, func.count(SeasonHistory.id))
        .where(SeasonHistory.final_position == 1)
        .group_by(SeasonHistory.player_id)
    ).all())
    top_players = [
        WarRoomTopPlayer(
            player_id=p.id, alias=p.alias, elite_id_code=p.elite_id_code,
            player_class=p.player_class.value if hasattr(p.player_class, "value") else str(p.player_class),
            rating=round(r.rating, 1), matches=r.matches_played,
            championships=int(champ_counts.get(p.id, 0)),
        )
        for r, p in top_rating_rows
    ]

    # ---- Activity feed (matches recientes finalizados) ----
    recent_matches = list(db.scalars(
        select(MatchResult)
        .where(MatchResult.reported_at.is_not(None))
        .order_by(MatchResult.reported_at.desc())
        .limit(15)
    ))
    activity: list[WarRoomActivity] = []
    for m in recent_matches:
        a = db.get(PlayerProfile, m.player_a_id)
        b = db.get(PlayerProfile, m.player_b_id) if m.player_b_id else None
        if m.is_bye:
            summary = f"{a.alias if a else '?'} → BYE"
        elif m.is_draw:
            summary = f"{a.alias} vs {b.alias if b else '?'} · empate {m.games_a}-{m.games_b}"
        else:
            winner = a if m.winner_id == m.player_a_id else b
            loser = b if m.winner_id == m.player_a_id else a
            summary = (f"{winner.alias if winner else '?'} venció a "
                       f"{loser.alias if loser else '?'} · {m.games_a}-{m.games_b}")
        activity.append(WarRoomActivity(
            timestamp=m.reported_at.isoformat() if m.reported_at else now.isoformat(),
            type="match_result", summary=summary,
        ))

    # ---- Cosmos summary ----
    cosmos_summary = {
        "total_stars": db.scalar(select(func.count(PlayerProfile.id))) or 0,
        "champion_count": db.scalar(
            select(func.count(SeasonHistory.id)).where(SeasonHistory.final_position == 1)
        ) or 0,
        "edges": db.scalar(
            select(func.count(func.distinct(
                func.concat(MatchResult.player_a_id, ":", MatchResult.player_b_id)
            )))
        ) or 0,
    }

    return WarRoomOut(
        tickers=tickers, meta=meta,
        upcoming_events=upcoming_data,
        top_players=top_players,
        activity=activity,
        cosmos_summary=cosmos_summary,
    )
