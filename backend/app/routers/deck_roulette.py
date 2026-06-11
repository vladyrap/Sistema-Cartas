"""Deck Roulette — asigna deck random del top metagame y trackea su record."""
import random
from collections import Counter
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, select

from app.core.deps import DbDep, UserDep
from app.core.rate_limit import limiter
from app.models import (
    DeckRouletteAssignment, ExpTransaction, Game, PlayerDeck, Season, SeasonStatus,
)

router = APIRouter()

# Fallback list si la DB no tiene archetypes suficientes
ARCHETYPE_POOL_FALLBACK = [
    "Mono Red Aggro", "Esper Control", "Selesnya Tokens", "Izzet Phoenix",
    "Mono Black Devotion", "Gruul Stompy", "Dimir Rogues", "Bant Ramp",
    "Boros Burn", "Simic Merfolk", "Naya Zoo", "Jeskai Combo",
]


class AssignmentOut(BaseModel):
    id: int
    archetype: str
    game_id: int | None
    game_name: str | None
    started_at: datetime
    completed_at: datetime | None
    wins: int
    losses: int
    draws: int
    target_rounds: int
    polyglot_awarded: bool


def _to_out(db, a: DeckRouletteAssignment) -> AssignmentOut:
    game = db.get(Game, a.game_id) if a.game_id else None
    return AssignmentOut(
        id=a.id, archetype=a.archetype,
        game_id=a.game_id, game_name=game.name if game else None,
        started_at=a.started_at, completed_at=a.completed_at,
        wins=a.wins, losses=a.losses, draws=a.draws,
        target_rounds=a.target_rounds,
        polyglot_awarded=bool(a.polyglot_awarded),
    )


class SpinIn(BaseModel):
    game_id: int | None = None
    target_rounds: int = Field(default=5, ge=3, le=10)


@router.post("/spin", response_model=AssignmentOut)
@limiter.limit("3/day")
def spin(request: Request, payload: SpinIn, current: UserDep, db: DbDep) -> AssignmentOut:
    """Asigna un archetype random del top metagame al jugador.

    No permite más de 1 asignación activa por usuario a la vez.
    """
    # Verificar que no haya assignment activo
    active = db.scalar(
        select(DeckRouletteAssignment).where(
            DeckRouletteAssignment.user_id == current.id,
            DeckRouletteAssignment.completed_at.is_(None),
        )
    )
    if active:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            f"Ya tenés un Deck Roulette activo: {active.archetype}. Terminalo o cancelalo primero.",
        )

    # Top metagame: archetypes más usados en PlayerDeck activos
    q = select(PlayerDeck.archetype).where(
        PlayerDeck.archetype.is_not(None),
        PlayerDeck.is_active.is_(True),
    )
    if payload.game_id:
        q = q.where(PlayerDeck.game_id == payload.game_id)
    archetypes = [a for a in db.scalars(q) if a]
    if len(archetypes) >= 12:
        counts = Counter(archetypes)
        top_100 = [a for a, _ in counts.most_common(100)]
        archetype = random.choice(top_100)
    else:
        archetype = random.choice(ARCHETYPE_POOL_FALLBACK)

    assignment = DeckRouletteAssignment(
        user_id=current.id,
        archetype=archetype,
        game_id=payload.game_id,
        started_at=datetime.now(timezone.utc),
        target_rounds=payload.target_rounds,
    )
    db.add(assignment)
    db.commit()
    db.refresh(assignment)
    return _to_out(db, assignment)


class RecordResultIn(BaseModel):
    result: str = Field(pattern="^(win|loss|draw)$")


@router.post("/{assignment_id}/record", response_model=AssignmentOut)
def record_result(assignment_id: int, payload: RecordResultIn, current: UserDep, db: DbDep) -> AssignmentOut:
    a = db.get(DeckRouletteAssignment, assignment_id)
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asignación no encontrada")
    if a.user_id != current.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No es tu asignación")
    if a.completed_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ya está completada")

    if payload.result == "win":
        a.wins += 1
    elif payload.result == "loss":
        a.losses += 1
    else:
        a.draws += 1

    total = a.wins + a.losses + a.draws
    if total >= a.target_rounds:
        a.completed_at = datetime.now(timezone.utc)
        wr = a.wins / total if total else 0
        if wr > 0.5 and not a.polyglot_awarded and current.profile:
            a.polyglot_awarded = 1
            active = db.scalar(select(Season).where(Season.status == SeasonStatus.ACTIVE))
            if active:
                db.add(ExpTransaction(
                    player_id=current.profile.id,
                    season_id=active.id,
                    amount=300,
                    reason=f"deck_roulette:polyglot:{a.archetype}",
                    reason_code="deck_roulette",
                ))

    db.commit()
    db.refresh(a)
    return _to_out(db, a)


@router.post("/{assignment_id}/cancel", status_code=204)
def cancel(assignment_id: int, current: UserDep, db: DbDep) -> None:
    a = db.get(DeckRouletteAssignment, assignment_id)
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Asignación no encontrada")
    if a.user_id != current.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No es tu asignación")
    a.completed_at = datetime.now(timezone.utc)
    a.notes = (a.notes or "") + " [cancelled]"
    db.commit()


@router.get("/me", response_model=list[AssignmentOut])
def my_assignments(current: UserDep, db: DbDep, limit: int = 20) -> list[AssignmentOut]:
    limit = max(1, min(limit, 50))
    rows = list(db.scalars(
        select(DeckRouletteAssignment)
        .where(DeckRouletteAssignment.user_id == current.id)
        .order_by(desc(DeckRouletteAssignment.started_at)).limit(limit)
    ))
    return [_to_out(db, a) for a in rows]
