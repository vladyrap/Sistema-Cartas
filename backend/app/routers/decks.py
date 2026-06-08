"""Decks del jugador autenticado + parser/validador contra GameFormat + banlist."""
from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import DbDep, UserDep
from app.models import BanlistEntry, BanlistStatus, Game, GameFormat, PlayerDeck
from app.services.tcg import (
    DeckValidationResult,
    ParsedDeck,
    parse_decklist,
    validate_deck,
)

router = APIRouter()


# ============================== Schemas ==============================


class DeckOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    game_id: int
    game_name: str | None = None
    format_id: int | None = None
    format_name: str | None = None
    name: str
    archetype: str | None = None
    list_text: str | None = None
    notes: str | None = None
    leader_card: str | None = None
    main_count: int
    side_count: int
    extra_count: int
    is_legal: bool | None = None
    validation_notes: str | None = None
    is_public: bool = False
    is_locked: bool = False


class DeckCreate(BaseModel):
    game_id: int
    format_id: int | None = None
    name: str = Field(min_length=1, max_length=120)
    archetype: str | None = Field(default=None, max_length=80)
    list_text: str | None = None
    notes: str | None = None
    leader_card: str | None = Field(default=None, max_length=160)
    is_public: bool = False


class DeckUpdate(BaseModel):
    format_id: int | None = None
    name: str | None = Field(default=None, min_length=1, max_length=120)
    archetype: str | None = Field(default=None, max_length=80)
    list_text: str | None = None
    notes: str | None = None
    leader_card: str | None = Field(default=None, max_length=160)
    is_public: bool | None = None


class ParsedCardOut(BaseModel):
    qty: int
    name: str


class ParsedDeckOut(BaseModel):
    leader: str | None = None
    main: list[ParsedCardOut]
    side: list[ParsedCardOut]
    extra: list[ParsedCardOut]
    main_count: int
    side_count: int
    extra_count: int
    parse_errors: list[str]


class ValidationIssueOut(BaseModel):
    severity: str
    code: str
    message: str


class ValidationOut(BaseModel):
    is_legal: bool
    issues: list[ValidationIssueOut]
    parsed: ParsedDeckOut


# ============================== Helpers ==============================


def _to_out(d: PlayerDeck, g: Game | None, f: GameFormat | None) -> DeckOut:
    return DeckOut(
        id=d.id, game_id=d.game_id, game_name=g.name if g else None,
        format_id=d.format_id, format_name=f.name if f else None,
        name=d.name, archetype=d.archetype, list_text=d.list_text, notes=d.notes,
        leader_card=d.leader_card,
        main_count=d.main_count, side_count=d.side_count, extra_count=d.extra_count,
        is_legal=d.is_legal, validation_notes=d.validation_notes,
        is_public=d.is_public, is_locked=d.is_locked,
    )


def _parsed_to_out(p: ParsedDeck) -> ParsedDeckOut:
    return ParsedDeckOut(
        leader=p.leader,
        main=[ParsedCardOut(qty=q, name=n) for q, n in p.main],
        side=[ParsedCardOut(qty=q, name=n) for q, n in p.side],
        extra=[ParsedCardOut(qty=q, name=n) for q, n in p.extra],
        main_count=p.main_count, side_count=p.side_count, extra_count=p.extra_count,
        parse_errors=p.parse_errors,
    )


def _refresh_counts(d: PlayerDeck) -> ParsedDeck:
    """Reparsea list_text y actualiza counts cachados. Devuelve el parsed."""
    parsed = parse_decklist(d.list_text or "")
    d.main_count = parsed.main_count
    d.side_count = parsed.side_count
    d.extra_count = parsed.extra_count
    if parsed.leader and not d.leader_card:
        d.leader_card = parsed.leader
    return parsed


def _validate_against_format(db, parsed: ParsedDeck, fmt: GameFormat) -> DeckValidationResult:
    banlist_rows = db.execute(
        select(BanlistEntry.card_name_norm, BanlistEntry.status)
        .where(BanlistEntry.format_id == fmt.id)
    ).all()
    banlist = [(n, s.value if hasattr(s, "value") else s) for n, s in banlist_rows]
    return validate_deck(
        parsed,
        min_main=fmt.min_main,
        max_main=fmt.max_main,
        min_side=fmt.min_side,
        max_side=fmt.max_side,
        min_extra=fmt.min_extra,
        max_extra=fmt.max_extra,
        max_copies=fmt.max_copies,
        has_leader=fmt.has_leader,
        is_singleton=fmt.is_singleton,
        banlist=banlist,
    )


# ============================== Endpoints ==============================


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
    out: list[DeckOut] = []
    fmt_ids = [d.format_id for d, _ in rows if d.format_id]
    fmts = {f.id: f for f in db.scalars(select(GameFormat).where(GameFormat.id.in_(fmt_ids)))} if fmt_ids else {}
    for d, g in rows:
        out.append(_to_out(d, g, fmts.get(d.format_id) if d.format_id else None))
    return out


@router.get("/me/{deck_id}", response_model=DeckOut)
def get_my_deck(deck_id: int, db: DbDep, current: UserDep) -> DeckOut:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    d = db.get(PlayerDeck, deck_id)
    if not d or d.player_id != current.profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deck no encontrado")
    return _to_out(d, db.get(Game, d.game_id), db.get(GameFormat, d.format_id) if d.format_id else None)


@router.post("/me", response_model=DeckOut, status_code=201)
def create_deck(payload: DeckCreate, db: DbDep, current: UserDep) -> DeckOut:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    game = db.get(Game, payload.game_id)
    if not game:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Juego no encontrado")
    fmt = None
    if payload.format_id is not None:
        fmt = db.get(GameFormat, payload.format_id)
        if not fmt or fmt.game_id != game.id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Formato no compatible con el juego")
    d = PlayerDeck(player_id=current.profile.id, **payload.model_dump())
    _refresh_counts(d)
    db.add(d)
    db.commit()
    db.refresh(d)
    return _to_out(d, game, fmt)


@router.patch("/me/{deck_id}", response_model=DeckOut)
def update_deck(deck_id: int, payload: DeckUpdate, db: DbDep, current: UserDep) -> DeckOut:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    d = db.get(PlayerDeck, deck_id)
    if not d or d.player_id != current.profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deck no encontrado")
    if d.is_locked:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Deck bloqueado por evento en curso — no se puede editar."
        )
    changes = payload.model_dump(exclude_unset=True)
    if "format_id" in changes and changes["format_id"] is not None:
        fmt = db.get(GameFormat, changes["format_id"])
        if not fmt or fmt.game_id != d.game_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Formato no compatible")
    for k, v in changes.items():
        setattr(d, k, v)
    if "list_text" in changes or "leader_card" in changes:
        _refresh_counts(d)
        # Reset validación cuando cambia la lista.
        d.is_legal = None
        d.validation_notes = None
    db.commit()
    db.refresh(d)
    return _to_out(d, db.get(Game, d.game_id), db.get(GameFormat, d.format_id) if d.format_id else None)


@router.delete("/me/{deck_id}", status_code=204)
def delete_deck(deck_id: int, db: DbDep, current: UserDep):
    if not current.profile:
        return None
    d = db.get(PlayerDeck, deck_id)
    if not d or d.player_id != current.profile.id:
        return None
    if d.is_locked:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Deck bloqueado — está en uso en un evento."
        )
    db.delete(d)
    db.commit()


@router.get("/me/{deck_id}/parsed", response_model=ParsedDeckOut)
def get_parsed(deck_id: int, db: DbDep, current: UserDep) -> ParsedDeckOut:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    d = db.get(PlayerDeck, deck_id)
    if not d or d.player_id != current.profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deck no encontrado")
    return _parsed_to_out(parse_decklist(d.list_text or ""))


@router.post("/me/{deck_id}/validate", response_model=ValidationOut)
def validate_my_deck(deck_id: int, db: DbDep, current: UserDep) -> ValidationOut:
    """Valida el deck contra su GameFormat y persiste is_legal + validation_notes."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    d = db.get(PlayerDeck, deck_id)
    if not d or d.player_id != current.profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deck no encontrado")
    if not d.format_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Asigna un formato antes de validar."
        )
    fmt = db.get(GameFormat, d.format_id)
    if not fmt:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Formato no encontrado")
    parsed = _refresh_counts(d)
    result = _validate_against_format(db, parsed, fmt)
    d.is_legal = result.is_legal
    d.validation_notes = "\n".join(
        f"[{i.severity}] {i.message}" for i in result.issues[:20]
    ) or None
    db.commit()
    return ValidationOut(
        is_legal=result.is_legal,
        issues=[
            ValidationIssueOut(severity=i.severity, code=i.code, message=i.message)
            for i in result.issues
        ],
        parsed=_parsed_to_out(parsed),
    )


@router.get("/public/by-player/{player_id}", response_model=list[DeckOut])
def list_public_decks_of_player(player_id: int, db: DbDep) -> list[DeckOut]:
    """Decks que el jugador marcó como públicos. Visible para cualquiera."""
    rows = db.execute(
        select(PlayerDeck, Game)
        .join(Game, PlayerDeck.game_id == Game.id)
        .where(PlayerDeck.player_id == player_id, PlayerDeck.is_public.is_(True))
        .order_by(PlayerDeck.id.desc())
    ).all()
    fmt_ids = [d.format_id for d, _ in rows if d.format_id]
    fmts = {f.id: f for f in db.scalars(select(GameFormat).where(GameFormat.id.in_(fmt_ids)))} if fmt_ids else {}
    return [_to_out(d, g, fmts.get(d.format_id) if d.format_id else None) for d, g in rows]
