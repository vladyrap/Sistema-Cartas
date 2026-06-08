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
