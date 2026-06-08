"""Endpoints públicos de rating Glicko-2 + bracket single-elim."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.core.deps import AdminDep, DbDep, UserDep
from app.models import Game, PlayerProfile, PlayerRating
from app.services import rating as rating_svc

router = APIRouter()


class RatingOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    player_id: int
    game_id: int
    rating: float
    rd: float
    volatility: float
    matches_played: int
    peak_rating: float


class LeaderboardRow(BaseModel):
    rank: int
    player_id: int
    alias: str
    elite_id_code: str
    rating: float
    rd: float
    matches_played: int
    peak_rating: float


@router.get("/me", response_model=list[RatingOut])
def my_ratings(db: DbDep, current: UserDep) -> list[RatingOut]:
    """Ratings del jugador autenticado por cada juego en que jugó ranked."""
    if not current.profile:
        return []
    return [
        RatingOut.model_validate(r)
        for r in db.scalars(
            select(PlayerRating)
            .where(PlayerRating.player_id == current.profile.id)
            .order_by(PlayerRating.rating.desc())
        )
    ]


@router.get("/leaderboard", response_model=list[LeaderboardRow])
def leaderboard(
    db: DbDep,
    game_id: int = Query(...),
    limit: int = Query(default=100, ge=1, le=500),
) -> list[LeaderboardRow]:
    """Top-N jugadores por Glicko-2 rating en un juego. Excluye con <5 matches."""
    rows = rating_svc.leaderboard(db, game_id=game_id, limit=limit)
    out: list[LeaderboardRow] = []
    for i, r in enumerate(rows, start=1):
        p = db.get(PlayerProfile, r.player_id)
        if not p:
            continue
        out.append(LeaderboardRow(
            rank=i, player_id=r.player_id,
            alias=p.alias, elite_id_code=p.elite_id_code,
            rating=r.rating, rd=r.rd,
            matches_played=r.matches_played,
            peak_rating=r.peak_rating,
        ))
    return out


# ============================== Bracket ==============================


class CreateBracketRequest(BaseModel):
    size: int = Field(default=8)


class BracketNodeOut(BaseModel):
    id: int
    level: int
    slot: int
    player_a_id: int | None
    player_b_id: int | None
    winner_id: int | None
    seed_a: int | None
    seed_b: int | None
    games_a: int
    games_b: int


class BracketOut(BaseModel):
    bracket: dict | None
    nodes: list[BracketNodeOut]


class BracketReportRequest(BaseModel):
    winner_id: int
    games_a: int = 2
    games_b: int = 0


bracket_router = APIRouter()


@bracket_router.post("/events/{event_id}/bracket", response_model=BracketOut)
def create_bracket(
    event_id: int, payload: CreateBracketRequest, db: DbDep, admin: AdminDep,
) -> BracketOut:
    """Crea bracket single-elim tomando top-N de standings (admin only)."""
    rating_svc.build_bracket(db, event_id=event_id, size=payload.size)
    db.commit()
    return BracketOut(**rating_svc.get_bracket_tree(db, event_id=event_id))


@bracket_router.get("/events/{event_id}/bracket", response_model=BracketOut)
def get_bracket(event_id: int, db: DbDep) -> BracketOut:
    """Bracket actual del evento — público."""
    return BracketOut(**rating_svc.get_bracket_tree(db, event_id=event_id))


@bracket_router.post("/events/{event_id}/bracket/nodes/{node_id}/report",
                     response_model=BracketNodeOut)
def report_bracket_node(
    event_id: int, node_id: int, payload: BracketReportRequest,
    db: DbDep, admin: AdminDep,
) -> BracketNodeOut:
    """Reporta resultado de un nodo y avanza ganador (admin)."""
    node = rating_svc.report_bracket_match(
        db, node_id=node_id, winner_id=payload.winner_id,
        games_a=payload.games_a, games_b=payload.games_b,
    )
    db.commit()
    return BracketNodeOut(
        id=node.id, level=node.level, slot=node.slot,
        player_a_id=node.player_a_id, player_b_id=node.player_b_id,
        winner_id=node.winner_id, seed_a=node.seed_a, seed_b=node.seed_b,
        games_a=node.games_a, games_b=node.games_b,
    )
