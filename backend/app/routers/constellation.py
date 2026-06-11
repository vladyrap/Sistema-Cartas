"""Player Constellation Map — grafo 3D de similitud entre jugadores.

Similitud computada como cosine similarity sobre un vector por jugador:
  [winrate, rating_norm, archetype_top_1_hot, total_matches_norm]

Posiciones 3D vienen de un layout simple basado en hashing del player_id
(determinístico, sin necesitar t-SNE o force-directed simulation cara).
Las "estrellas" cercanas en el espacio están conectadas por edges si su
similarity supera un umbral.
"""
import math
import hashlib
from collections import Counter

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import desc, func, select

from app.core.deps import DbDep
from app.models import (
    MatchResult, PlayerDeck, PlayerProfile, PlayerRating, Season, SeasonStatus,
)

router = APIRouter()


class NodeOut(BaseModel):
    id: int
    alias: str
    elite_id: str
    x: float
    y: float
    z: float
    rating: float
    winrate: float
    matches: int
    top_archetype: str | None = None
    is_champion: bool = False


class EdgeOut(BaseModel):
    a: int
    b: int
    weight: float


class ConstellationOut(BaseModel):
    nodes: list[NodeOut]
    edges: list[EdgeOut]
    season_name: str | None = None
    similarity_threshold: float


def _pos_from_id(pid: int, rating: float) -> tuple[float, float, float]:
    """Posición 3D determinística: dos hashes para angle + tilt, rating modula r."""
    h = hashlib.sha1(str(pid).encode()).hexdigest()
    a = (int(h[0:8], 16) / 0xFFFFFFFF) * 2 * math.pi
    b = (int(h[8:16], 16) / 0xFFFFFFFF) * math.pi - math.pi / 2
    # rating modula distancia (mejor rating = más lejos, más visible)
    r = 80 + ((rating - 1500) / 1000) * 30
    r = max(60, min(140, r))
    x = r * math.cos(b) * math.cos(a)
    z = r * math.cos(b) * math.sin(a)
    y = r * math.sin(b)
    return (round(x, 2), round(y, 2), round(z, 2))


def _vec_for(player_id: int, rating: float, wr: float, total: int, top_archetype: str | None) -> list[float]:
    """Vector feature simple para cosine similarity."""
    # Normalizamos
    rating_n = (rating - 1500) / 500.0
    wr_n = (wr - 0.5) * 2
    total_n = min(1.0, total / 50.0)
    # Archetype: hash bucket en 16 bins (one-hot disperso)
    arch_bin = 0
    if top_archetype:
        arch_bin = int(hashlib.sha1(top_archetype.lower().encode()).hexdigest()[0:2], 16) % 16
    one_hot = [1.0 if i == arch_bin else 0.0 for i in range(16)]
    return [rating_n, wr_n, total_n] + one_hot


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(x * x for x in b))
    if na == 0 or nb == 0:
        return 0.0
    return dot / (na * nb)


@router.get("/", response_model=ConstellationOut)
def constellation(db: DbDep, limit: int = 80, threshold: float = 0.85, game_id: int | None = None) -> ConstellationOut:
    """Devuelve top N players (por rating) como nodos + edges entre los similares."""
    limit = max(10, min(limit, 200))

    # Game default: el más rating-poblado
    if game_id is None:
        row = db.execute(
            select(PlayerRating.game_id, func.count(PlayerRating.id).label("c"))
            .group_by(PlayerRating.game_id).order_by(desc("c")).limit(1)
        ).first()
        game_id = row[0] if row else None

    if not game_id:
        return ConstellationOut(nodes=[], edges=[], season_name=None, similarity_threshold=threshold)

    # Top ratings del game
    rating_rows = list(db.execute(
        select(PlayerRating, PlayerProfile)
        .join(PlayerProfile, PlayerProfile.id == PlayerRating.player_id)
        .where(PlayerRating.game_id == game_id, PlayerRating.matches_played >= 3)
        .order_by(desc(PlayerRating.rating))
        .limit(limit)
    ).all())

    if not rating_rows:
        return ConstellationOut(nodes=[], edges=[], season_name=None, similarity_threshold=threshold)

    # Champion (top rating)
    champion_id = rating_rows[0][1].id

    # Por cada player: features (winrate + top archetype) — un solo loop
    nodes: list[NodeOut] = []
    vectors: dict[int, list[float]] = {}
    for rt, p in rating_rows:
        # Winrate desde MatchResult
        won = db.scalar(
            select(func.count(MatchResult.id)).where(MatchResult.winner_id == p.id)
        ) or 0
        played = db.scalar(
            select(func.count(MatchResult.id)).where(
                (MatchResult.player_a_id == p.id) | (MatchResult.player_b_id == p.id),
                MatchResult.is_bye.is_(False),
                MatchResult.reported_at.is_not(None),
            )
        ) or 0
        wr = (won / played) if played else 0.5
        # Top archetype
        arch_row = db.execute(
            select(PlayerDeck.archetype, func.count(PlayerDeck.id).label("c"))
            .where(PlayerDeck.player_id == p.id, PlayerDeck.archetype.is_not(None))
            .group_by(PlayerDeck.archetype).order_by(desc("c")).limit(1)
        ).first()
        top_arch = arch_row[0] if arch_row else None
        x, y, z = _pos_from_id(p.id, rt.rating)
        vectors[p.id] = _vec_for(p.id, rt.rating, wr, int(played), top_arch)
        nodes.append(NodeOut(
            id=p.id, alias=p.alias, elite_id=p.elite_id_code,
            x=x, y=y, z=z,
            rating=round(rt.rating, 1),
            winrate=round(wr, 3),
            matches=int(played),
            top_archetype=top_arch,
            is_champion=(p.id == champion_id),
        ))

    # Edges entre los más similares
    edges: list[EdgeOut] = []
    ids = [n.id for n in nodes]
    for i, a in enumerate(ids):
        for b in ids[i + 1:]:
            sim = _cosine(vectors[a], vectors[b])
            if sim >= threshold:
                edges.append(EdgeOut(a=a, b=b, weight=round(sim, 4)))
    # Cap edges para no saturar 3D
    edges.sort(key=lambda e: e.weight, reverse=True)
    edges = edges[:min(len(edges), len(nodes) * 4)]

    active = db.scalar(select(Season).where(Season.status == SeasonStatus.ACTIVE))
    return ConstellationOut(
        nodes=nodes,
        edges=edges,
        season_name=active.name if active else None,
        similarity_threshold=threshold,
    )
