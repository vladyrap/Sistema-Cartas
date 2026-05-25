"""Decks del jugador autenticado."""
from pydantic import BaseModel, ConfigDict, Field
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import DbDep, UserDep
from app.models import PlayerDeck, Game

router = APIRouter()


class DeckOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    game_id: int
    game_name: str | None = None
    name: str
    archetype: str | None = None
    list_text: str | None = None
    notes: str | None = None


class DeckCreate(BaseModel):
    game_id: int
    name: str = Field(min_length=1, max_length=120)
    archetype: str | None = Field(default=None, max_length=80)
    list_text: str | None = None
    notes: str | None = None


class DeckUpdate(BaseModel):
    name: str | None = None
    archetype: str | None = None
    list_text: str | None = None
    notes: str | None = None


@router.get("/me", response_model=list[DeckOut])
def list_my_decks(db: DbDep, current: UserDep) -> list[DeckOut]:
    if not current.profile:
        return []
    rows = db.execute(
        select(PlayerDeck, Game)
        .join(Game, PlayerDeck.game_id == Game.id)
        .where(PlayerDeck.player_id == current.profile.id)
        .order_by(PlayerDeck.id.desc())
    ).all()
    return [
        DeckOut(
            id=d.id, game_id=d.game_id, game_name=g.name, name=d.name,
            archetype=d.archetype, list_text=d.list_text, notes=d.notes,
        )
        for d, g in rows
    ]


@router.post("/me", response_model=DeckOut, status_code=201)
def create_deck(payload: DeckCreate, db: DbDep, current: UserDep) -> DeckOut:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    game = db.get(Game, payload.game_id)
    if not game:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Juego no encontrado")
    d = PlayerDeck(player_id=current.profile.id, **payload.model_dump())
    db.add(d); db.commit(); db.refresh(d)
    return DeckOut(
        id=d.id, game_id=d.game_id, game_name=game.name, name=d.name,
        archetype=d.archetype, list_text=d.list_text, notes=d.notes,
    )


@router.patch("/me/{deck_id}", response_model=DeckOut)
def update_deck(deck_id: int, payload: DeckUpdate, db: DbDep, current: UserDep) -> DeckOut:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    d = db.get(PlayerDeck, deck_id)
    if not d or d.player_id != current.profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deck no encontrado")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(d, k, v)
    db.commit(); db.refresh(d)
    g = db.get(Game, d.game_id)
    return DeckOut(
        id=d.id, game_id=d.game_id, game_name=g.name if g else None, name=d.name,
        archetype=d.archetype, list_text=d.list_text, notes=d.notes,
    )


@router.delete("/me/{deck_id}", status_code=204)
def delete_deck(deck_id: int, db: DbDep, current: UserDep):
    if not current.profile:
        return None
    d = db.get(PlayerDeck, deck_id)
    if d and d.player_id == current.profile.id:
        db.delete(d); db.commit()
    return None
