"""Deck DNA — fingerprint determinístico de un deck + búsqueda de parientes.

DNA = SHA1 truncado de las cartas (con qty) ordenadas alfabéticamente.
Features = vector derivado: total cards, top 8 cards por qty, archetype, leader.
Relatives = Jaccard similarity sobre el set de nombres de carta.
"""
import hashlib
import re
from collections import Counter

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import DbDep, OptionalUserDep
from app.models import PlayerDeck, PlayerProfile

router = APIRouter()


def parse_decklist(text: str | None) -> Counter[str]:
    """Parsea texto tipo '4 Lightning Bolt\n2 Counterspell' → Counter."""
    if not text:
        return Counter()
    out: Counter[str] = Counter()
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("//") or line.startswith("#"):
            continue
        m = re.match(r"^(?:(\d+)x?\s+)?(.+?)(?:\s*\([^)]+\))?\s*$", line)
        if not m:
            continue
        qty = int(m.group(1) or 1)
        name = m.group(2).strip()
        if name and qty > 0 and qty < 100:
            out[name] += qty
    return out


def compute_dna(cards: Counter[str]) -> str:
    """Hash determinístico de las cartas. 16 hex chars."""
    if not cards:
        return "0" * 16
    canon = "|".join(f"{q}x{n}" for n, q in sorted(cards.items()))
    return hashlib.sha1(canon.encode("utf-8")).hexdigest()[:16]


def jaccard(a: set, b: set) -> float:
    if not a and not b:
        return 0.0
    return len(a & b) / max(len(a | b), 1)


class DNAFeatures(BaseModel):
    total_unique: int
    total_cards: int
    top_cards: list[dict]  # [{name, qty}]
    archetype: str | None = None
    leader: str | None = None
    main_count: int
    side_count: int


class DNAOut(BaseModel):
    deck_id: int
    deck_name: str
    dna: str
    features: DNAFeatures


@router.get("/{deck_id}/dna", response_model=DNAOut)
def get_dna(deck_id: int, db: DbDep) -> DNAOut:
    d = db.get(PlayerDeck, deck_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deck no encontrado")
    cards = parse_decklist(d.list_text)
    top = sorted(cards.items(), key=lambda kv: (-kv[1], kv[0]))[:8]
    return DNAOut(
        deck_id=d.id,
        deck_name=d.name,
        dna=compute_dna(cards),
        features=DNAFeatures(
            total_unique=len(cards),
            total_cards=sum(cards.values()),
            top_cards=[{"name": n, "qty": q} for n, q in top],
            archetype=d.archetype,
            leader=d.leader_card,
            main_count=d.main_count,
            side_count=d.side_count,
        ),
    )


class RelativeOut(BaseModel):
    deck_id: int
    deck_name: str
    player_alias: str | None
    archetype: str | None
    similarity: float  # 0.0-1.0
    shared_cards: list[str]


class RelativesOut(BaseModel):
    deck_id: int
    deck_name: str
    relatives: list[RelativeOut]


@router.get("/{deck_id}/relatives", response_model=RelativesOut)
def get_relatives(deck_id: int, db: DbDep, limit: int = 5) -> RelativesOut:
    """Top N decks más parecidos por Jaccard similarity de cartas."""
    src = db.get(PlayerDeck, deck_id)
    if not src:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deck no encontrado")
    src_cards = set(parse_decklist(src.list_text).keys())
    if not src_cards:
        return RelativesOut(deck_id=src.id, deck_name=src.name, relatives=[])

    others = list(db.scalars(
        select(PlayerDeck).where(
            PlayerDeck.id != src.id,
            PlayerDeck.game_id == src.game_id,
            PlayerDeck.list_text.is_not(None),
        ).limit(500)
    ))

    scored: list[tuple[float, PlayerDeck, set]] = []
    for o in others:
        o_cards = set(parse_decklist(o.list_text).keys())
        if not o_cards:
            continue
        sim = jaccard(src_cards, o_cards)
        if sim > 0:
            scored.append((sim, o, src_cards & o_cards))

    scored.sort(key=lambda t: t[0], reverse=True)
    out: list[RelativeOut] = []
    for sim, o, shared in scored[:limit]:
        player = db.get(PlayerProfile, o.player_id)
        out.append(RelativeOut(
            deck_id=o.id, deck_name=o.name,
            player_alias=player.alias if player else None,
            archetype=o.archetype,
            similarity=round(sim, 4),
            shared_cards=sorted(shared)[:10],
        ))
    return RelativesOut(deck_id=src.id, deck_name=src.name, relatives=out)
