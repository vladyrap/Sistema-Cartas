"""Clientes para APIs públicas de cartas: Scryfall (MTG), Pokémon TCG API,
YGOPRODeck (Yu-Gi-Oh!), One Piece TCG (fan API). Devuelven un formato
unificado `CardMeta` para que el resto del backend no se preocupe de qué
API la sirvió.

Todas las llamadas tienen timeout de 4s + cache in-process con TTL de 1h.
Si una API cae o tarda, devuelve None — el caller decide qué hacer (mostrar
la carta sin metadata, mostrar warning, etc.).
"""
from __future__ import annotations

import logging
import time
from dataclasses import asdict, dataclass, field
from typing import Any
from urllib.parse import quote

import httpx

from app.services.tcg import normalize_card_name

logger = logging.getLogger(__name__)


# ============================== Modelo unificado ==============================


@dataclass
class CardMeta:
    """Metadata normalizada de una carta. None si no se pudo resolver."""
    source: str  # "scryfall", "pokemontcg", "ygoprodeck", "optcg"
    name: str  # nombre canónico de la API
    game_code: str  # "mtg" | "pokemon" | "ygo" | "one_piece"
    set_code: str | None = None
    set_name: str | None = None
    collector_number: str | None = None
    rarity: str | None = None
    type_line: str | None = None
    mana_cost: str | None = None  # MTG
    power: str | None = None
    toughness: str | None = None
    cmc: float | None = None  # converted mana cost (MTG)
    image_url: str | None = None
    image_url_back: str | None = None  # caras dobles MTG / YGO
    legalities: dict[str, str] = field(default_factory=dict)  # format → legal/banned/restricted
    prices_usd: float | None = None
    extra: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


# ============================== Cache TTL simple ==============================


class _TTLCache:
    def __init__(self, ttl_seconds: float = 3600):
        self.ttl = ttl_seconds
        self._store: dict[str, tuple[float, Any]] = {}

    def get(self, key: str) -> Any | None:
        item = self._store.get(key)
        if not item:
            return None
        ts, value = item
        if time.time() - ts > self.ttl:
            self._store.pop(key, None)
            return None
        return value

    def set(self, key: str, value: Any) -> None:
        self._store[key] = (time.time(), value)

    def clear(self) -> None:
        self._store.clear()


_cache_by_name = _TTLCache(ttl_seconds=3600)
_cache_search = _TTLCache(ttl_seconds=600)


# ============================== Backends ==============================


_HTTP_TIMEOUT = httpx.Timeout(4.0, connect=2.0)
_HEADERS = {"User-Agent": "EliteCards/1.0 (+https://elitecards.cl)"}


def _http_get(url: str) -> dict[str, Any] | None:
    try:
        with httpx.Client(timeout=_HTTP_TIMEOUT, headers=_HEADERS, follow_redirects=True) as client:
            r = client.get(url)
            if r.status_code == 404:
                return None
            r.raise_for_status()
            return r.json()
    except (httpx.HTTPError, ValueError) as e:
        logger.warning("card_api error url=%s err=%s", url, e)
        return None


# ----- Scryfall (MTG) -----


def _scryfall_card_to_meta(data: dict) -> CardMeta:
    img = data.get("image_uris") or {}
    if not img and data.get("card_faces"):
        # Carta de dos caras
        face0 = data["card_faces"][0]
        img = face0.get("image_uris") or {}
    prices = data.get("prices") or {}
    usd = prices.get("usd")
    return CardMeta(
        source="scryfall",
        name=data.get("name", ""),
        game_code="mtg",
        set_code=data.get("set"),
        set_name=data.get("set_name"),
        collector_number=data.get("collector_number"),
        rarity=data.get("rarity"),
        type_line=data.get("type_line"),
        mana_cost=data.get("mana_cost"),
        cmc=data.get("cmc"),
        power=data.get("power"),
        toughness=data.get("toughness"),
        image_url=img.get("normal") or img.get("large"),
        image_url_back=(
            data["card_faces"][1].get("image_uris", {}).get("normal")
            if data.get("card_faces") and len(data["card_faces"]) > 1 else None
        ),
        legalities=data.get("legalities", {}),
        prices_usd=float(usd) if usd else None,
        extra={"oracle_text": data.get("oracle_text"), "id": data.get("id")},
    )


def scryfall_by_name(name: str) -> CardMeta | None:
    cache_key = f"scryfall:name:{normalize_card_name(name)}"
    cached = _cache_by_name.get(cache_key)
    if cached is not None:
        return cached
    data = _http_get(f"https://api.scryfall.com/cards/named?fuzzy={quote(name)}")
    if not data:
        _cache_by_name.set(cache_key, None)
        return None
    meta = _scryfall_card_to_meta(data)
    _cache_by_name.set(cache_key, meta)
    return meta


def scryfall_search(query: str, *, limit: int = 10) -> list[CardMeta]:
    cache_key = f"scryfall:q:{query.lower()}:{limit}"
    cached = _cache_search.get(cache_key)
    if cached is not None:
        return cached
    data = _http_get(f"https://api.scryfall.com/cards/search?q={quote(query)}&order=name")
    if not data:
        _cache_search.set(cache_key, [])
        return []
    results = [_scryfall_card_to_meta(c) for c in data.get("data", [])[:limit]]
    _cache_search.set(cache_key, results)
    return results


# ----- Pokémon TCG API -----


def _pokemon_card_to_meta(data: dict) -> CardMeta:
    images = data.get("images") or {}
    set_obj = data.get("set") or {}
    cardmarket = (data.get("cardmarket") or {}).get("prices", {}) or {}
    tcgplayer = (data.get("tcgplayer") or {}).get("prices", {}) or {}
    usd = None
    for variant in ("holofoil", "reverseHolofoil", "normal", "1stEditionHolofoil"):
        v = tcgplayer.get(variant) or {}
        if v.get("market"):
            usd = v["market"]
            break
    return CardMeta(
        source="pokemontcg",
        name=data.get("name", ""),
        game_code="pokemon",
        set_code=set_obj.get("id"),
        set_name=set_obj.get("name"),
        collector_number=data.get("number"),
        rarity=data.get("rarity"),
        type_line=" / ".join(data.get("subtypes", []) + data.get("types", [])) or data.get("supertype"),
        image_url=images.get("large") or images.get("small"),
        legalities=data.get("legalities", {}),
        prices_usd=usd,
        extra={"hp": data.get("hp"), "id": data.get("id"), "attacks": data.get("attacks")},
    )


def pokemontcg_by_name(name: str) -> CardMeta | None:
    cache_key = f"pokemontcg:name:{normalize_card_name(name)}"
    cached = _cache_by_name.get(cache_key)
    if cached is not None:
        return cached
    data = _http_get(f"https://api.pokemontcg.io/v2/cards?q=name:\"{quote(name)}\"&pageSize=1")
    items = (data or {}).get("data") or []
    if not items:
        _cache_by_name.set(cache_key, None)
        return None
    meta = _pokemon_card_to_meta(items[0])
    _cache_by_name.set(cache_key, meta)
    return meta


def pokemontcg_search(query: str, *, limit: int = 10) -> list[CardMeta]:
    cache_key = f"pokemontcg:q:{query.lower()}:{limit}"
    cached = _cache_search.get(cache_key)
    if cached is not None:
        return cached
    data = _http_get(
        f"https://api.pokemontcg.io/v2/cards?q=name:\"{quote(query)}*\"&pageSize={limit}"
    )
    items = (data or {}).get("data") or []
    results = [_pokemon_card_to_meta(c) for c in items]
    _cache_search.set(cache_key, results)
    return results


# ----- YGOPRODeck (Yu-Gi-Oh!) -----


def _ygo_card_to_meta(data: dict) -> CardMeta:
    sets = data.get("card_sets") or []
    first_set = sets[0] if sets else {}
    images = data.get("card_images") or []
    img = images[0] if images else {}
    prices = (data.get("card_prices") or [{}])[0]
    usd = prices.get("tcgplayer_price")
    return CardMeta(
        source="ygoprodeck",
        name=data.get("name", ""),
        game_code="ygo",
        set_code=first_set.get("set_code"),
        set_name=first_set.get("set_name"),
        rarity=first_set.get("set_rarity"),
        type_line=data.get("type"),
        power=str(data.get("atk")) if data.get("atk") is not None else None,
        toughness=str(data.get("def")) if data.get("def") is not None else None,
        image_url=img.get("image_url"),
        legalities={
            "tcg": data.get("banlist_info", {}).get("ban_tcg", "Unlimited"),
            "ocg": data.get("banlist_info", {}).get("ban_ocg", "Unlimited"),
        },
        prices_usd=float(usd) if usd and usd != "0.00" else None,
        extra={"id": data.get("id"), "desc": data.get("desc"),
               "level": data.get("level"), "attribute": data.get("attribute")},
    )


def ygo_by_name(name: str) -> CardMeta | None:
    cache_key = f"ygo:name:{normalize_card_name(name)}"
    cached = _cache_by_name.get(cache_key)
    if cached is not None:
        return cached
    data = _http_get(
        f"https://db.ygoprodeck.com/api/v7/cardinfo.php?name={quote(name)}"
    )
    items = (data or {}).get("data") or []
    if not items:
        _cache_by_name.set(cache_key, None)
        return None
    meta = _ygo_card_to_meta(items[0])
    _cache_by_name.set(cache_key, meta)
    return meta


def ygo_search(query: str, *, limit: int = 10) -> list[CardMeta]:
    cache_key = f"ygo:q:{query.lower()}:{limit}"
    cached = _cache_search.get(cache_key)
    if cached is not None:
        return cached
    data = _http_get(
        f"https://db.ygoprodeck.com/api/v7/cardinfo.php?fname={quote(query)}&num={limit}&offset=0"
    )
    items = (data or {}).get("data") or []
    results = [_ygo_card_to_meta(c) for c in items[:limit]]
    _cache_search.set(cache_key, results)
    return results


# ----- One Piece TCG (no hay API oficial pública estable, usamos optcgapi.com como best-effort) -----


def _optcg_card_to_meta(data: dict) -> CardMeta:
    return CardMeta(
        source="optcg",
        name=data.get("name", ""),
        game_code="one_piece",
        set_code=data.get("set", {}).get("id") if isinstance(data.get("set"), dict) else data.get("set"),
        set_name=data.get("set", {}).get("name") if isinstance(data.get("set"), dict) else None,
        collector_number=data.get("card_number") or data.get("id"),
        rarity=data.get("rarity"),
        type_line=data.get("type"),
        power=str(data.get("power")) if data.get("power") is not None else None,
        image_url=data.get("image_url") or data.get("image"),
        extra={"id": data.get("id"), "color": data.get("color"),
               "cost": data.get("cost"), "counter": data.get("counter")},
    )


def optcg_by_name(name: str) -> CardMeta | None:
    """API One Piece — endpoint público varía. Hacemos best-effort y devolvemos None si falla.
    Si más adelante hay una API oficial estable, se reemplaza acá."""
    cache_key = f"optcg:name:{normalize_card_name(name)}"
    cached = _cache_by_name.get(cache_key)
    if cached is not None:
        return cached
    # Best effort: optcgapi.com (puede cambiar). Si no responde, return None.
    data = _http_get(f"https://optcgapi.com/api/Cards/name/{quote(name)}")
    if not data:
        _cache_by_name.set(cache_key, None)
        return None
    # Algunos endpoints devuelven lista, otros objeto.
    if isinstance(data, list):
        if not data:
            _cache_by_name.set(cache_key, None)
            return None
        data = data[0]
    meta = _optcg_card_to_meta(data)
    _cache_by_name.set(cache_key, meta)
    return meta


# ============================== Dispatcher por game_code ==============================


_BACKENDS_BY_NAME = {
    "mtg": scryfall_by_name,
    "magic": scryfall_by_name,
    "pokemon": pokemontcg_by_name,
    "pokémon": pokemontcg_by_name,
    "ygo": ygo_by_name,
    "yugioh": ygo_by_name,
    "yu-gi-oh": ygo_by_name,
    "one_piece": optcg_by_name,
    "op": optcg_by_name,
}

_BACKENDS_SEARCH = {
    "mtg": scryfall_search,
    "magic": scryfall_search,
    "pokemon": pokemontcg_search,
    "pokémon": pokemontcg_search,
    "ygo": ygo_search,
    "yugioh": ygo_search,
    "yu-gi-oh": ygo_search,
}


def resolve_card_by_name(game_code: str, name: str) -> CardMeta | None:
    """Devuelve metadata para una carta dado el game_code (MTG/Pokemon/YGO/OP)."""
    backend = _BACKENDS_BY_NAME.get(game_code.lower())
    if not backend:
        return None
    return backend(name)


def search_cards(game_code: str, query: str, *, limit: int = 10) -> list[CardMeta]:
    backend = _BACKENDS_SEARCH.get(game_code.lower())
    if not backend:
        return []
    return backend(query, limit=limit)
