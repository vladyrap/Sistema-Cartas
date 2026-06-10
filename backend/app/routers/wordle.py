"""Card Wordle — adivina la carta Magic del día con 6 intentos.

Cada intento devuelve por columna:
  - mana_cost: exact | close | far
  - cmc:       exact | up (+) | down (-)
  - colors:    exact | partial | far
  - type:      exact | partial | far
  - rarity:    exact | partial | far

El target del día se selecciona aleatoriamente de Scryfall la primera vez
que alguien pega `/today` y se cachea en wordle_puzzles.
"""
import json
import logging
from datetime import date as _date
from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from app.core.deps import DbDep, UserDep
from app.core.rate_limit import limiter
from app.models import WordleAttempt, WordlePuzzle

router = APIRouter()
log = logging.getLogger("wordle")

SCRYFALL = "https://api.scryfall.com"
USER_AGENT = "EliteCards/1.0"
MAX_ATTEMPTS = 6


# ─── Schemas ───────────────────────────────────────────────────────────


class WordleStatusOut(BaseModel):
    date: _date
    attempts_left: int
    attempts: list[dict]
    is_solved: bool
    is_failed: bool
    answer: dict | None = None  # solo cuando solved o failed


class GuessIn(BaseModel):
    guess: str


class GuessOut(BaseModel):
    attempt_num: int
    guess_name: str
    is_win: bool
    is_failed: bool
    result: dict
    answer: dict | None = None  # solo cuando win o failed


# ─── Helpers ───────────────────────────────────────────────────────────


def _get_or_create_puzzle(db, today: _date) -> WordlePuzzle:
    p = db.scalar(select(WordlePuzzle).where(WordlePuzzle.puzzle_date == today))
    if p:
        return p
    # Tirar carta random de Scryfall — restringimos a CMC 1-7 y first-print
    try:
        with httpx.Client(timeout=5.0, headers={"User-Agent": USER_AGENT}) as cli:
            r = cli.get(
                f"{SCRYFALL}/cards/random",
                params={"q": "is:firstprint cmc>=1 cmc<=7 -is:digital game:paper"},
            )
        r.raise_for_status()
        j = r.json()
    except Exception as e:
        log.exception("Scryfall random falló: %s", e)
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "No se pudo elegir carta del día")

    images = j.get("image_uris") or {}
    if not images and j.get("card_faces"):
        images = (j["card_faces"][0] or {}).get("image_uris") or {}

    puzzle = WordlePuzzle(
        puzzle_date=today,
        answer_name=j.get("name") or "?",
        mana_cost=j.get("mana_cost"),
        cmc=int(j.get("cmc") or 0),
        colors_csv=",".join(j.get("colors") or []) or None,
        type_line=j.get("type_line"),
        set_code=j.get("set"),
        rarity=j.get("rarity"),
        image_url=images.get("normal") or images.get("large"),
    )
    try:
        db.add(puzzle)
        db.commit()
        db.refresh(puzzle)
    except IntegrityError:
        db.rollback()
        puzzle = db.scalar(select(WordlePuzzle).where(WordlePuzzle.puzzle_date == today))
    return puzzle


def _lookup_card(name: str) -> dict | None:
    """Resuelve un guess vía Scryfall fuzzy."""
    try:
        with httpx.Client(timeout=5.0, headers={"User-Agent": USER_AGENT}) as cli:
            r = cli.get(f"{SCRYFALL}/cards/named", params={"fuzzy": name})
        if r.status_code != 200:
            return None
        return r.json()
    except Exception:
        return None


def _compare(guess: dict, puzzle: WordlePuzzle) -> dict:
    """Devuelve diff colorimétrico por atributo."""
    g_cmc = int(guess.get("cmc") or 0)
    g_colors = set(guess.get("colors") or [])
    p_colors = set((puzzle.colors_csv or "").split(",")) - {""}
    g_type = (guess.get("type_line") or "").lower()
    p_type = (puzzle.type_line or "").lower()
    g_rarity = (guess.get("rarity") or "").lower()
    g_set = (guess.get("set") or "").lower()
    p_set = (puzzle.set_code or "").lower()

    # CMC: exact / arrow direction
    if g_cmc == (puzzle.cmc or 0):
        cmc_r = "exact"
    elif g_cmc < (puzzle.cmc or 0):
        cmc_r = "up"
    else:
        cmc_r = "down"

    # Colors: exact subset comparison
    if g_colors == p_colors:
        colors_r = "exact"
    elif g_colors & p_colors:
        colors_r = "partial"
    else:
        colors_r = "far"

    # Type: tokens compartidos
    g_tokens = set(g_type.replace("—", " ").split())
    p_tokens = set(p_type.replace("—", " ").split())
    if g_type == p_type:
        type_r = "exact"
    elif g_tokens & p_tokens:
        type_r = "partial"
    else:
        type_r = "far"

    # Rarity: exact match only
    rarity_r = "exact" if g_rarity == (puzzle.rarity or "").lower() else "far"

    # Set: exact match only
    set_r = "exact" if g_set == p_set else "far"

    return {
        "name": guess.get("name"),
        "cmc": {"value": g_cmc, "result": cmc_r},
        "colors": {"value": sorted(g_colors), "result": colors_r},
        "type": {"value": guess.get("type_line"), "result": type_r},
        "rarity": {"value": g_rarity, "result": rarity_r},
        "set": {"value": g_set, "result": set_r},
        "image_url": (guess.get("image_uris") or {}).get("art_crop"),
    }


def _answer_payload(p: WordlePuzzle) -> dict:
    return {
        "name": p.answer_name,
        "mana_cost": p.mana_cost,
        "cmc": p.cmc,
        "colors": (p.colors_csv or "").split(",") if p.colors_csv else [],
        "type_line": p.type_line,
        "set_code": p.set_code,
        "rarity": p.rarity,
        "image_url": p.image_url,
    }


# ─── Endpoints ─────────────────────────────────────────────────────────


@router.get("/status", response_model=WordleStatusOut)
def get_status(current: UserDep, db: DbDep) -> WordleStatusOut:
    today = _date.today()
    puzzle = _get_or_create_puzzle(db, today)

    attempts = list(db.scalars(
        select(WordleAttempt)
        .where(WordleAttempt.user_id == current.id, WordleAttempt.puzzle_date == today)
        .order_by(WordleAttempt.attempt_num)
    ))
    attempt_payloads = [json.loads(a.result_json) for a in attempts]
    is_solved = any(a.is_win for a in attempts)
    is_failed = len(attempts) >= MAX_ATTEMPTS and not is_solved
    answer = _answer_payload(puzzle) if (is_solved or is_failed) else None
    return WordleStatusOut(
        date=today,
        attempts_left=max(0, MAX_ATTEMPTS - len(attempts)),
        attempts=attempt_payloads,
        is_solved=is_solved,
        is_failed=is_failed,
        answer=answer,
    )


@router.post("/guess", response_model=GuessOut)
@limiter.limit("30/minute")
def guess(request: Request, payload: GuessIn, current: UserDep, db: DbDep) -> GuessOut:
    today = _date.today()
    puzzle = _get_or_create_puzzle(db, today)

    existing = list(db.scalars(
        select(WordleAttempt)
        .where(WordleAttempt.user_id == current.id, WordleAttempt.puzzle_date == today)
        .order_by(WordleAttempt.attempt_num)
    ))
    if any(a.is_win for a in existing):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya resolviste el wordle de hoy")
    if len(existing) >= MAX_ATTEMPTS:
        raise HTTPException(status.HTTP_409_CONFLICT, "Sin intentos restantes")

    g = _lookup_card(payload.guess.strip())
    if not g:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Esa carta no existe")

    diff = _compare(g, puzzle)
    is_win = (g.get("name") or "").lower() == puzzle.answer_name.lower()
    attempt_num = len(existing) + 1
    db.add(WordleAttempt(
        user_id=current.id,
        puzzle_date=today,
        attempt_num=attempt_num,
        guess_name=g.get("name") or payload.guess,
        result_json=json.dumps(diff),
        is_win=1 if is_win else 0,
    ))
    db.commit()

    is_failed = (attempt_num >= MAX_ATTEMPTS) and not is_win
    answer = _answer_payload(puzzle) if (is_win or is_failed) else None
    return GuessOut(
        attempt_num=attempt_num,
        guess_name=g.get("name") or payload.guess,
        is_win=is_win,
        is_failed=is_failed,
        result=diff,
        answer=answer,
    )
