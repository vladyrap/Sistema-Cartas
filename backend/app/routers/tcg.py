"""Endpoints TCG: búsqueda de cartas (autocomplete) + enriquecimiento de deck
con metadata real desde Scryfall/Pokémon/YGO/OP APIs.

Sirve también `/decks/{id}/enrich` que retorna la decklist parseada con
metadata por carta (image, set, rarity, mana_cost...) para que el frontend
renderice card art en vivo mientras el jugador edita.
"""
from __future__ import annotations

from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, Query, Request, status
from sqlalchemy import select

from app.core.deps import DbDep, UserDep
from app.core.rate_limit import limiter
from app.models import Game, GameFormat, PlayerDeck
from app.services import card_apis as ca
from app.services.tcg import parse_decklist

router = APIRouter()


# ============================== Schemas ==============================


class CardMetaOut(BaseModel):
    source: str
    name: str
    game_code: str
    set_code: str | None = None
    set_name: str | None = None
    collector_number: str | None = None
    rarity: str | None = None
    type_line: str | None = None
    mana_cost: str | None = None
    cmc: float | None = None
    power: str | None = None
    toughness: str | None = None
    image_url: str | None = None
    image_url_back: str | None = None
    legalities: dict = {}
    prices_usd: float | None = None


def _to_out(meta: ca.CardMeta | None) -> CardMetaOut | None:
    if not meta:
        return None
    return CardMetaOut(
        source=meta.source, name=meta.name, game_code=meta.game_code,
        set_code=meta.set_code, set_name=meta.set_name,
        collector_number=meta.collector_number, rarity=meta.rarity,
        type_line=meta.type_line, mana_cost=meta.mana_cost, cmc=meta.cmc,
        power=meta.power, toughness=meta.toughness,
        image_url=meta.image_url, image_url_back=meta.image_url_back,
        legalities=meta.legalities, prices_usd=meta.prices_usd,
    )


# ============================== Endpoints ==============================


def _game_code_from_id(db, game_id: int) -> str | None:
    """Mapea Game.code (en BD) a un code reconocido por card_apis.
    Tolera variaciones como 'pokemon_tcg', 'magic_the_gathering'."""
    g = db.get(Game, game_id)
    if not g:
        return None
    code = g.code.lower()
    if "magic" in code or code == "mtg":
        return "mtg"
    if "pokemon" in code or "pokémon" in code:
        return "pokemon"
    if "yugi" in code or code in {"ygo"}:
        return "ygo"
    if "one_piece" in code or "onepiece" in code or code == "op":
        return "one_piece"
    return None


@router.get("/cards/search", response_model=list[CardMetaOut])
@limiter.limit("60/minute")
def search_cards(
    request: Request,
    db: DbDep,
    q: str = Query(min_length=2, max_length=80),
    game_id: int | None = Query(default=None),
    game_code: str | None = Query(default=None),
    limit: int = Query(default=10, ge=1, le=25),
) -> list[CardMetaOut]:
    """Autocomplete de cartas. Pasá game_id (de la BD) o game_code directo
    (mtg/pokemon/ygo/one_piece). Cacheado por 10 minutos."""
    code = game_code
    if code is None and game_id is not None:
        code = _game_code_from_id(db, game_id)
    if not code:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Falta game_code o game_id válido para mapear al API correcto",
        )
    results = ca.search_cards(code, q, limit=limit)
    return [m for m in (_to_out(r) for r in results) if m]


@router.get("/cards/by-name", response_model=CardMetaOut | None)
@limiter.limit("120/minute")
def card_by_name(
    request: Request,
    db: DbDep,
    name: str = Query(min_length=1, max_length=160),
    game_id: int | None = Query(default=None),
    game_code: str | None = Query(default=None),
) -> CardMetaOut | None:
    """Resuelve UNA carta por nombre exacto (con tolerancia fuzzy del API)."""
    code = game_code
    if code is None and game_id is not None:
        code = _game_code_from_id(db, game_id)
    if not code:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "game_code o game_id requerido")
    meta = ca.resolve_card_by_name(code, name)
    return _to_out(meta)


# ============================== Deck enrich ==============================


class EnrichedCard(BaseModel):
    qty: int
    name: str
    meta: CardMetaOut | None = None


class EnrichedDeck(BaseModel):
    leader: EnrichedCard | None = None
    main: list[EnrichedCard]
    side: list[EnrichedCard]
    extra: list[EnrichedCard]
    main_count: int
    side_count: int
    extra_count: int
    total_price_usd: float | None = None
    cards_resolved: int
    cards_total: int


@router.post("/decks/{deck_id}/enrich", response_model=EnrichedDeck)
@limiter.limit("30/hour")
def enrich_deck(
    deck_id: int, request: Request, db: DbDep, current: UserDep,
) -> EnrichedDeck:
    """Parsea el deck y resuelve cada nombre contra el API correspondiente.
    Devuelve la lista con image_url/set/rarity/mana_cost por carta.
    Si una carta no resuelve, queda con `meta: null` y el frontend la marca."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    deck = db.get(PlayerDeck, deck_id)
    if not deck or deck.player_id != current.profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deck no encontrado")
    code = _game_code_from_id(db, deck.game_id)
    if not code:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "El juego del deck no tiene API externa configurada",
        )

    parsed = parse_decklist(deck.list_text or "")

    def _resolve_list(items: list[tuple[int, str]]) -> list[EnrichedCard]:
        out: list[EnrichedCard] = []
        for qty, name in items:
            meta = ca.resolve_card_by_name(code, name)
            out.append(EnrichedCard(qty=qty, name=name, meta=_to_out(meta)))
        return out

    main = _resolve_list(parsed.main)
    side = _resolve_list(parsed.side)
    extra = _resolve_list(parsed.extra)

    leader = None
    if parsed.leader:
        leader_meta = ca.resolve_card_by_name(code, parsed.leader)
        leader = EnrichedCard(qty=1, name=parsed.leader, meta=_to_out(leader_meta))

    all_cards = main + side + extra + ([leader] if leader else [])
    total_price = 0.0
    has_price = False
    cards_resolved = 0
    for c in all_cards:
        if c.meta and c.meta.prices_usd is not None:
            total_price += c.meta.prices_usd * c.qty
            has_price = True
        if c.meta:
            cards_resolved += 1
    return EnrichedDeck(
        leader=leader,
        main=main, side=side, extra=extra,
        main_count=parsed.main_count, side_count=parsed.side_count, extra_count=parsed.extra_count,
        total_price_usd=round(total_price, 2) if has_price else None,
        cards_resolved=cards_resolved,
        cards_total=len(all_cards),
    )


# ============================== Matchup predictor (LLM) ==============================


from app.services import ai_chat


MATCHUP_SYSTEM = """You are a competitive TCG meta analyst.
Given a player's deck and their game's format, predict the matchups against the 5 most popular meta decks.
Respond ONLY with valid JSON in this exact shape:

{
  "meta_decks": [
    {"name": "<archetype name>", "favorability": <-100 to 100>, "key_cards": ["<card>", "<card>"], "notes": "<1 sentence>"},
    ...
  ],
  "overall_meta_score": <0-100 score: how well-positioned in current meta>,
  "tech_choices": ["<sideboard suggestion 1>", "<suggestion 2>"]
}

favorability: -100 (very bad matchup) to +100 (very favored). Be honest.
Output ONLY JSON, no markdown."""


class MatchupOut(BaseModel):
    meta_decks: list[dict] = []
    overall_meta_score: float | None = None
    tech_choices: list[str] = []
    raw: str | None = None


@router.post("/decks/{deck_id}/predict-matchups", response_model=MatchupOut)
@limiter.limit("5/hour")
def predict_matchups(deck_id: int, request: Request, db: DbDep, current: UserDep) -> MatchupOut:
    """LLM predice matchups del deck contra el meta actual del formato.
    Más caro en tokens que /analyze, por eso rate-limit estricto."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    deck = db.get(PlayerDeck, deck_id)
    if not deck or deck.player_id != current.profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deck no encontrado")
    if not deck.list_text:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Deck sin lista")
    game = db.get(Game, deck.game_id)
    fmt = db.get(GameFormat, deck.format_id) if deck.format_id else None

    prompt = (
        f"Game: {game.name if game else 'unknown'}\n"
        f"Format: {fmt.name if fmt else 'casual/no format'}\n"
        f"Deck name: {deck.name}\n"
        f"Archetype hint: {deck.archetype or 'unknown'}\n\n"
        f"Decklist:\n{deck.list_text}\n"
    )
    result = ai_chat.complete_json(prompt, system=MATCHUP_SYSTEM, max_tokens=1200)
    return MatchupOut(
        meta_decks=result.get("meta_decks", []),
        overall_meta_score=result.get("overall_meta_score"),
        tech_choices=result.get("tech_choices", []),
        raw=result.get("raw"),
    )
