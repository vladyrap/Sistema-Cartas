"""AR Card Scanner — proxy a Scryfall + Pokémon TCG API para lookup de cartas.

Scryfall ya incluye `purchase_uris.tcgplayer` y precios Market Price (USD)
provenientes de TCGPlayer. No necesitamos la API gated de TCGPlayer para
mostrar precios y linkear al producto correcto.

Por qué proxy y no llamar directo desde el frontend:
  1. Scryfall pide User-Agent identificable + rate limit 10/seg.
  2. Cache lado servidor (Redis) — la mayoría de scans van a coincidir.
  3. Conversión USD→CLP centralizada.
  4. Permite agregar "decks que usan esta carta" cruzando con nuestra DB.
"""
import logging
import os

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from app.core.rate_limit import limiter
from app.services import fx

router = APIRouter()
log = logging.getLogger("scanner")

SCRYFALL_BASE = "https://api.scryfall.com"
USER_AGENT = "EliteCards/1.0 (https://elitecards.cl)"
TIMEOUT = 5.0


class CardLookupOut(BaseModel):
    name: str
    set_name: str | None = None
    set_code: str | None = None
    type_line: str | None = None
    mana_cost: str | None = None
    oracle_text: str | None = None
    image_normal: str | None = None
    image_art_crop: str | None = None
    rarity: str | None = None
    colors: list[str] = []
    cmc: float | None = None
    # Precios
    price_usd: float | None = None          # Market Price normal (TCGPlayer source)
    price_usd_foil: float | None = None     # Foil price (TCGPlayer source)
    price_eur: float | None = None          # Cardmarket EUR
    price_clp: int | None = None            # Conversión local estimada
    price_clp_foil: int | None = None
    # Links de compra
    tcgplayer_url: str | None = None        # Link directo al producto en TCGPlayer
    cardmarket_url: str | None = None
    cardhoarder_url: str | None = None
    scryfall_uri: str | None = None
    # Affiliate sugerido (búsqueda) cuando no hay link directo
    tcgplayer_search_url: str | None = None


@router.get("/lookup", response_model=CardLookupOut)
@limiter.limit("30/minute")
def lookup(request: Request, name: str) -> CardLookupOut:
    """Busca una carta por nombre exacto (o fuzzy). Proxy a Scryfall."""
    name = (name or "").strip()
    if not name or len(name) < 2:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nombre muy corto")

    # Scryfall: /cards/named?fuzzy=X
    try:
        with httpx.Client(timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}) as cli:
            r = cli.get(f"{SCRYFALL_BASE}/cards/named", params={"fuzzy": name})
    except httpx.RequestError as e:
        log.warning("Scryfall request error: %s", e)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Scryfall no responde")

    if r.status_code == 404:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Carta no encontrada en Scryfall")
    if r.status_code != 200:
        log.warning("Scryfall status %s: %s", r.status_code, r.text[:200])
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Scryfall error inesperado")

    j = r.json()
    images = j.get("image_uris") or {}
    # Doble-cara: tomar imagen del primer face
    if not images and j.get("card_faces"):
        images = (j["card_faces"][0] or {}).get("image_uris") or {}
    prices = j.get("prices") or {}
    purchase = j.get("purchase_uris") or {}

    def _to_float(v) -> float | None:
        try:
            return float(v) if v is not None else None
        except (TypeError, ValueError):
            return None

    usd = _to_float(prices.get("usd"))
    usd_foil = _to_float(prices.get("usd_foil"))
    card_name = j.get("name") or name

    return CardLookupOut(
        name=card_name,
        set_name=j.get("set_name"),
        set_code=j.get("set"),
        type_line=j.get("type_line"),
        mana_cost=j.get("mana_cost"),
        oracle_text=j.get("oracle_text"),
        image_normal=images.get("normal") or images.get("large"),
        image_art_crop=images.get("art_crop"),
        rarity=j.get("rarity"),
        colors=j.get("colors") or [],
        cmc=_to_float(j.get("cmc")),
        price_usd=usd,
        price_usd_foil=usd_foil,
        price_eur=_to_float(prices.get("eur")),
        price_clp=int(usd * fx.get_usd_clp()) if usd else None,
        price_clp_foil=int(usd_foil * fx.get_usd_clp()) if usd_foil else None,
        tcgplayer_url=purchase.get("tcgplayer"),
        cardmarket_url=purchase.get("cardmarket"),
        cardhoarder_url=purchase.get("cardhoarder"),
        scryfall_uri=j.get("scryfall_uri"),
        tcgplayer_search_url=f"https://www.tcgplayer.com/search/magic/product?q={card_name.replace(' ', '+')}",
    )


class SuggestOut(BaseModel):
    suggestions: list[str]


@router.get("/suggest", response_model=SuggestOut)
@limiter.limit("60/minute")
def suggest(request: Request, q: str) -> SuggestOut:
    """Autocomplete (typeahead) — útil mientras el usuario tipea lo que vio."""
    q = (q or "").strip()
    if not q or len(q) < 2:
        return SuggestOut(suggestions=[])
    try:
        with httpx.Client(timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}) as cli:
            r = cli.get(f"{SCRYFALL_BASE}/cards/autocomplete", params={"q": q})
    except httpx.RequestError:
        return SuggestOut(suggestions=[])
    if r.status_code != 200:
        return SuggestOut(suggestions=[])
    return SuggestOut(suggestions=r.json().get("data", [])[:15])


# ─────────────────  Batch lookup (para Shop Radar / Wishlist)  ─────────────────


class BatchLookupIn(BaseModel):
    names: list[str]


class BatchLookupItem(BaseModel):
    name: str
    found: bool
    price_usd: float | None = None
    price_clp: int | None = None
    image_url: str | None = None
    tcgplayer_url: str | None = None
    set_code: str | None = None


class BatchLookupOut(BaseModel):
    items: list[BatchLookupItem]
    total_usd: float
    total_clp: int
    usd_clp_rate: float


@router.post("/batch", response_model=BatchLookupOut)
@limiter.limit("10/minute")
def batch_lookup(request: Request, payload: BatchLookupIn) -> BatchLookupOut:
    """Lookup masivo (hasta 50 cartas) — devuelve precio + total wishlist en CLP."""
    names = [n.strip() for n in (payload.names or []) if n and n.strip()]
    if not names:
        return BatchLookupOut(items=[], total_usd=0.0, total_clp=0, usd_clp_rate=fx.get_usd_clp())
    if len(names) > 50:
        names = names[:50]

    items: list[BatchLookupItem] = []
    total_usd = 0.0
    with httpx.Client(timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}) as cli:
        for name in names:
            try:
                r = cli.get(f"{SCRYFALL_BASE}/cards/named", params={"fuzzy": name})
                if r.status_code != 200:
                    items.append(BatchLookupItem(name=name, found=False))
                    continue
                j = r.json()
                prices = j.get("prices") or {}
                purchase = j.get("purchase_uris") or {}
                images = j.get("image_uris") or {}
                if not images and j.get("card_faces"):
                    images = (j["card_faces"][0] or {}).get("image_uris") or {}
                try:
                    usd = float(prices.get("usd")) if prices.get("usd") else None
                except (TypeError, ValueError):
                    usd = None
                if usd:
                    total_usd += usd
                items.append(BatchLookupItem(
                    name=j.get("name") or name,
                    found=True,
                    price_usd=usd,
                    price_clp=int(usd * fx.get_usd_clp()) if usd else None,
                    image_url=images.get("normal") or images.get("small"),
                    tcgplayer_url=purchase.get("tcgplayer"),
                    set_code=j.get("set"),
                ))
            except httpx.RequestError:
                items.append(BatchLookupItem(name=name, found=False))

    return BatchLookupOut(
        items=items,
        total_usd=round(total_usd, 2),
        total_clp=int(total_usd * fx.get_usd_clp()),
        usd_clp_rate=fx.get_usd_clp(),
    )


# ─────────────────────────  Pokémon TCG  ─────────────────────────


POKEMON_API = "https://api.pokemontcg.io/v2"
POKEMON_API_KEY = os.getenv("POKEMON_TCG_API_KEY", "")  # opcional


class PokemonCardOut(BaseModel):
    id: str
    name: str
    set_name: str | None = None
    set_id: str | None = None
    number: str | None = None
    rarity: str | None = None
    image_small: str | None = None
    image_large: str | None = None
    types: list[str] = []
    hp: str | None = None
    price_usd: float | None = None          # TCGPlayer market price (normal)
    price_clp: int | None = None
    tcgplayer_url: str | None = None
    cardmarket_url: str | None = None


@router.get("/pokemon/lookup", response_model=list[PokemonCardOut])
@limiter.limit("30/minute")
def pokemon_lookup(request: Request, name: str) -> list[PokemonCardOut]:
    """Busca cartas Pokémon por nombre. Múltiples impresiones se devuelven todas."""
    name = (name or "").strip()
    if not name or len(name) < 2:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nombre muy corto")

    headers = {"User-Agent": USER_AGENT}
    if POKEMON_API_KEY:
        headers["X-Api-Key"] = POKEMON_API_KEY
    try:
        with httpx.Client(timeout=TIMEOUT, headers=headers) as cli:
            r = cli.get(
                f"{POKEMON_API}/cards",
                params={"q": f'name:"{name}"', "pageSize": 12, "orderBy": "-set.releaseDate"},
            )
    except httpx.RequestError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Pokémon TCG API no responde")
    if r.status_code != 200:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Pokémon TCG API error")

    out: list[PokemonCardOut] = []
    for c in r.json().get("data", []):
        images = c.get("images") or {}
        s = c.get("set") or {}
        tcgp = (c.get("tcgplayer") or {})
        # Tomar precio "normal" de cualquier variante reportada
        usd: float | None = None
        for variant_data in (tcgp.get("prices") or {}).values():
            if isinstance(variant_data, dict) and variant_data.get("market"):
                try:
                    usd = float(variant_data["market"])
                    break
                except (TypeError, ValueError):
                    pass
        out.append(PokemonCardOut(
            id=c.get("id", ""),
            name=c.get("name", ""),
            set_name=s.get("name"),
            set_id=s.get("id"),
            number=c.get("number"),
            rarity=c.get("rarity"),
            image_small=images.get("small"),
            image_large=images.get("large"),
            types=c.get("types") or [],
            hp=c.get("hp"),
            price_usd=usd,
            price_clp=int(usd * fx.get_usd_clp()) if usd else None,
            tcgplayer_url=tcgp.get("url"),
            cardmarket_url=(c.get("cardmarket") or {}).get("url"),
        ))
    return out


@router.get("/pokemon/suggest", response_model=SuggestOut)
@limiter.limit("60/minute")
def pokemon_suggest(request: Request, q: str) -> SuggestOut:
    """Typeahead de Pokémon — devuelve nombres únicos de las primeras 20 cartas que matchean."""
    q = (q or "").strip()
    if not q or len(q) < 2:
        return SuggestOut(suggestions=[])
    headers = {"User-Agent": USER_AGENT}
    if POKEMON_API_KEY:
        headers["X-Api-Key"] = POKEMON_API_KEY
    try:
        with httpx.Client(timeout=TIMEOUT, headers=headers) as cli:
            r = cli.get(
                f"{POKEMON_API}/cards",
                params={"q": f'name:"{q}*"', "pageSize": 20, "select": "name"},
            )
    except httpx.RequestError:
        return SuggestOut(suggestions=[])
    if r.status_code != 200:
        return SuggestOut(suggestions=[])
    seen: list[str] = []
    for c in r.json().get("data", []):
        n = c.get("name")
        if n and n not in seen:
            seen.append(n)
    return SuggestOut(suggestions=seen[:15])


# ─────────────────────────  Yu-Gi-Oh! (YGOPRODeck)  ─────────────────────────


YGO_API = "https://db.ygoprodeck.com/api/v7"


class YgoCardOut(BaseModel):
    id: int
    name: str
    type: str | None = None
    desc: str | None = None
    atk: int | None = None
    def_: int | None = None  # `def` es keyword
    level: int | None = None
    race: str | None = None
    attribute: str | None = None
    archetype: str | None = None
    image_url: str | None = None
    image_small: str | None = None
    price_usd: float | None = None
    price_clp: int | None = None
    tcgplayer_search_url: str | None = None
    ygoprodeck_url: str | None = None


def _ygo_to_out(c: dict) -> YgoCardOut:
    imgs = (c.get("card_images") or [{}])[0]
    prices = (c.get("card_prices") or [{}])[0]
    try:
        usd = float(prices.get("tcgplayer_price")) if prices.get("tcgplayer_price") not in (None, "0", "0.00") else None
    except (TypeError, ValueError):
        usd = None
    name = c.get("name") or ""
    return YgoCardOut(
        id=c.get("id") or 0,
        name=name,
        type=c.get("type"),
        desc=c.get("desc"),
        atk=c.get("atk"),
        def_=c.get("def"),
        level=c.get("level"),
        race=c.get("race"),
        attribute=c.get("attribute"),
        archetype=c.get("archetype"),
        image_url=imgs.get("image_url"),
        image_small=imgs.get("image_url_small"),
        price_usd=usd,
        price_clp=int(usd * fx.get_usd_clp()) if usd else None,
        tcgplayer_search_url=f"https://www.tcgplayer.com/search/yugioh/product?q={name.replace(' ', '+')}" if name else None,
        ygoprodeck_url=f"https://ygoprodeck.com/card/?search={c.get('id')}" if c.get("id") else None,
    )


@router.get("/yugioh/lookup", response_model=list[YgoCardOut])
@limiter.limit("30/minute")
def yugioh_lookup(request: Request, name: str) -> list[YgoCardOut]:
    name = (name or "").strip()
    if not name or len(name) < 2:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nombre muy corto")
    try:
        with httpx.Client(timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}) as cli:
            r = cli.get(f"{YGO_API}/cardinfo.php", params={"fname": name})
    except httpx.RequestError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "YGOPRODeck no responde")
    if r.status_code == 400:
        return []  # YGOPRODeck devuelve 400 si no encontró nada
    if r.status_code != 200:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "YGOPRODeck error")
    data = (r.json() or {}).get("data") or []
    return [_ygo_to_out(c) for c in data[:12]]


@router.get("/yugioh/suggest", response_model=SuggestOut)
@limiter.limit("60/minute")
def yugioh_suggest(request: Request, q: str) -> SuggestOut:
    """YGOPRODeck no tiene autocomplete: reusamos fname (substring match) y devolvemos nombres únicos."""
    q = (q or "").strip()
    if not q or len(q) < 2:
        return SuggestOut(suggestions=[])
    try:
        with httpx.Client(timeout=TIMEOUT, headers={"User-Agent": USER_AGENT}) as cli:
            r = cli.get(f"{YGO_API}/cardinfo.php", params={"fname": q, "num": 15, "offset": 0})
    except httpx.RequestError:
        return SuggestOut(suggestions=[])
    if r.status_code != 200:
        return SuggestOut(suggestions=[])
    seen: list[str] = []
    for c in (r.json().get("data") or []):
        n = c.get("name")
        if n and n not in seen:
            seen.append(n)
    return SuggestOut(suggestions=seen[:15])


# ───────────────────────  apitcg.com (OP + UA + Digimon)  ───────────────────────


APITCG = "https://www.apitcg.com/api"
APITCG_API_KEY = os.getenv("APITCG_API_KEY", "")  # free signup en apitcg.com/platform


class GenericCardOut(BaseModel):
    """Schema común para One Piece, Union Arena, Digimon, Dragon Ball Fusion."""
    id: str
    name: str
    rarity: str | None = None
    image_url: str | None = None
    set_name: str | None = None
    set_code: str | None = None
    card_text: str | None = None
    cost: str | None = None
    power: str | None = None
    color: str | None = None
    type: str | None = None
    tcgplayer_search_url: str | None = None


def _generic_to_out(c: dict, *, tcg_search_path: str) -> GenericCardOut:
    name = c.get("name") or ""
    s = c.get("set") or {}
    return GenericCardOut(
        id=str(c.get("id") or c.get("code") or ""),
        name=name,
        rarity=c.get("rarity"),
        image_url=(c.get("images") or {}).get("large") or (c.get("images") or {}).get("small") or c.get("image"),
        set_name=s.get("name") if isinstance(s, dict) else (c.get("set_name") or s),
        set_code=s.get("code") if isinstance(s, dict) else c.get("set_code"),
        card_text=c.get("effect") or c.get("text") or c.get("ability"),
        cost=str(c.get("cost")) if c.get("cost") is not None else None,
        power=str(c.get("power")) if c.get("power") is not None else None,
        color=c.get("color"),
        type=c.get("type"),
        tcgplayer_search_url=f"https://www.tcgplayer.com/search/{tcg_search_path}/product?q={name.replace(' ', '+')}" if name else None,
    )


_GAME_MAP = {
    # game key → (apitcg path, TCGPlayer search path)
    "onepiece":   ("one-piece-card-game", "one-piece-card-game"),
    "union":      ("union-arena", "union-arena"),
    "digimon":    ("digimon-card-game", "digimon"),
    "dbf":        ("dragon-ball-fusion-world", "dragonball-super-card-game-fusion-world"),
}


def _apitcg_lookup(game: str, name: str, limit: int = 12) -> list[GenericCardOut]:
    if game not in _GAME_MAP:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Juego no soportado")
    if not APITCG_API_KEY:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "apitcg.com requiere APITCG_API_KEY (free signup en https://apitcg.com/platform)",
        )
    api_path, tcg_path = _GAME_MAP[game]
    headers = {"User-Agent": USER_AGENT, "x-api-key": APITCG_API_KEY}
    try:
        with httpx.Client(timeout=TIMEOUT, headers=headers, follow_redirects=True) as cli:
            r = cli.get(f"{APITCG}/{api_path}/cards", params={"name": name, "limit": limit})
    except httpx.RequestError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "apitcg.com no responde")
    if r.status_code != 200:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"apitcg.com error {r.status_code}")
    j = r.json()
    items = j.get("data") if isinstance(j, dict) else j
    return [_generic_to_out(c, tcg_search_path=tcg_path) for c in (items or [])][:limit]


@router.get("/onepiece/lookup", response_model=list[GenericCardOut])
@limiter.limit("30/minute")
def onepiece_lookup(request: Request, name: str) -> list[GenericCardOut]:
    return _apitcg_lookup("onepiece", name)


@router.get("/union/lookup", response_model=list[GenericCardOut])
@limiter.limit("30/minute")
def union_lookup(request: Request, name: str) -> list[GenericCardOut]:
    return _apitcg_lookup("union", name)


@router.get("/digimon/lookup", response_model=list[GenericCardOut])
@limiter.limit("30/minute")
def digimon_lookup(request: Request, name: str) -> list[GenericCardOut]:
    return _apitcg_lookup("digimon", name)


@router.get("/dbf/lookup", response_model=list[GenericCardOut])
@limiter.limit("30/minute")
def dbf_lookup(request: Request, name: str) -> list[GenericCardOut]:
    return _apitcg_lookup("dbf", name)
