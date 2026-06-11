"""Sealed Generator — abre 6 sobres random de un set Magic + IA sugiere deck óptimo."""
import logging
import random
from collections import Counter

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.core.rate_limit import limiter
from app.services import ai_chat

log = logging.getLogger("sealed")
router = APIRouter()

SCRYFALL = "https://api.scryfall.com"
USER_AGENT = "EliteCards/1.0"
TIMEOUT = 6.0


class SealedCard(BaseModel):
    name: str
    mana_cost: str | None = None
    type_line: str | None = None
    colors: list[str] = []
    rarity: str | None = None
    image_url: str | None = None
    set_code: str | None = None


class SealedPoolOut(BaseModel):
    set_code: str
    set_name: str | None
    pool_size: int
    cards: list[SealedCard]


def _card_from_scryfall(c: dict) -> SealedCard:
    images = c.get("image_uris") or {}
    if not images and c.get("card_faces"):
        images = (c["card_faces"][0] or {}).get("image_uris") or {}
    return SealedCard(
        name=c.get("name", ""),
        mana_cost=c.get("mana_cost"),
        type_line=c.get("type_line"),
        colors=c.get("colors") or [],
        rarity=c.get("rarity"),
        image_url=images.get("normal") or images.get("small"),
        set_code=c.get("set"),
    )


@router.get("/open", response_model=SealedPoolOut)
@limiter.limit("10/hour")
def open_pool(request: Request, set_code: str | None = None, packs: int = 6) -> SealedPoolOut:
    """Simula abrir N sobres. Cada sobre = 14 cartas (10C + 3U + 1R/M).

    Si set_code no se pasa, elegimos un set draftable random reciente.
    """
    packs = max(1, min(packs, 12))

    # Distribución por rareza: 10 commons, 3 uncommons, 1 rare/mythic (12.5% mythic)
    target = {"common": 10 * packs, "uncommon": 3 * packs, "rare": packs}

    pool: list[SealedCard] = []
    resolved_set: str | None = set_code

    with httpx.Client(timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}, follow_redirects=True) as cli:
        for rarity, count in target.items():
            for i in range(count):
                params = {"q": f"r:{rarity} game:paper -is:digital -is:funny"}
                if resolved_set:
                    params["q"] += f" e:{resolved_set}"
                try:
                    r = cli.get(f"{SCRYFALL}/cards/random", params=params)
                except httpx.RequestError:
                    raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Scryfall no responde")
                if r.status_code != 200:
                    continue
                c = r.json()
                card = _card_from_scryfall(c)
                # Posibilidad de mythic en el slot rare
                if rarity == "rare" and random.random() < 0.125 and c.get("rarity") != "mythic":
                    try:
                        r2 = cli.get(f"{SCRYFALL}/cards/random", params={"q": f"r:mythic e:{c.get('set')}"})
                        if r2.status_code == 200:
                            card = _card_from_scryfall(r2.json())
                    except Exception:
                        pass
                if not resolved_set:
                    resolved_set = c.get("set")
                pool.append(card)

    if not pool:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "No se pudo construir el pool")

    return SealedPoolOut(
        set_code=resolved_set or "",
        set_name=None,
        pool_size=len(pool),
        cards=pool,
    )


SUGGEST_SYSTEM = """You are a Magic: The Gathering Sealed format expert.

Given a card pool, recommend a 40-card sealed deck (basic lands not included in the count).

Output ONLY valid JSON in this exact shape:

{
  "main_colors": ["W", "U"],
  "splash_colors": [],
  "core_strategy": "<1-sentence summary>",
  "recommended_cards": [
    {"name": "<exact name>", "qty": 2, "reason": "<why>"}
  ],
  "tip": "<1 short tip for play>",
  "expected_archetype": "<like 'UW Skies', 'BR Aggro', 'GW Tokens'>"
}

Keep recommended_cards <= 25 entries. Pick the best playables, lean into 2 main colors.
Be concise on reasons (under 40 chars each). Be honest if the pool is weak."""


class SuggestIn(BaseModel):
    pool: list[SealedCard] = Field(min_length=10, max_length=200)


class SuggestOut(BaseModel):
    main_colors: list[str] = []
    splash_colors: list[str] = []
    core_strategy: str | None = None
    recommended_cards: list[dict] = []
    tip: str | None = None
    expected_archetype: str | None = None
    is_mock: bool = False


@router.post("/suggest", response_model=SuggestOut)
@limiter.limit("10/hour")
def suggest_deck(request: Request, payload: SuggestIn) -> SuggestOut:
    summary = []
    for c in payload.pool[:120]:
        line = f"- {c.name}"
        if c.colors:
            line += f" ({''.join(c.colors)})"
        if c.type_line:
            line += f" · {c.type_line}"
        if c.mana_cost:
            line += f" {c.mana_cost}"
        summary.append(line)
    prompt = "Card pool:\n" + "\n".join(summary) + "\n\nGive me the optimal 40-card sealed deck."

    data = ai_chat.complete_json(prompt, system=SUGGEST_SYSTEM, max_tokens=900)
    if data.get("error") == "parse":
        # Fallback heurístico simple: top colors por count
        colors = Counter()
        for c in payload.pool:
            for col in c.colors:
                colors[col] += 1
        main = [c for c, _ in colors.most_common(2)]
        return SuggestOut(
            main_colors=main,
            splash_colors=[],
            core_strategy="[Mock] Análisis sin IA — configurá ANTHROPIC_API_KEY",
            recommended_cards=[
                {"name": c.name, "qty": 1, "reason": "(mock pick)"}
                for c in payload.pool[:23] if any(col in main for col in c.colors)
            ][:23],
            tip="Configurá ANTHROPIC_API_KEY para análisis real",
            expected_archetype="?",
            is_mock=True,
        )
    return SuggestOut(
        main_colors=data.get("main_colors") or [],
        splash_colors=data.get("splash_colors") or [],
        core_strategy=data.get("core_strategy"),
        recommended_cards=data.get("recommended_cards") or [],
        tip=data.get("tip"),
        expected_archetype=data.get("expected_archetype"),
        is_mock=False,
    )
