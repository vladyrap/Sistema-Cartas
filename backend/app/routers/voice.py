"""Voice Match Reporter — Claude parsea texto del juez a estructura match-result."""
import json
import logging

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field

from app.core.deps import UserDep
from app.core.rate_limit import limiter
from app.services import ai_chat

log = logging.getLogger("voice")
router = APIRouter()


PARSE_SYSTEM = """You parse spoken/typed match-result phrases for a TCG tournament app.

Examples of INPUT and expected JSON OUTPUT:

Input: "Lightning won round 3 vs Bolt, 2-1"
Output: {"winner": "Lightning", "loser": "Bolt", "games_winner": 2, "games_loser": 1, "is_draw": false, "round_number": 3, "confidence": 0.95}

Input: "draw between PixelMage y ShadowKaiser, 1-1"
Output: {"winner": null, "loser": null, "games_winner": 1, "games_loser": 1, "is_draw": true, "round_number": null, "players": ["PixelMage", "ShadowKaiser"], "confidence": 0.9}

Input: "Vladimir ganó 2 a 0"
Output: {"winner": "Vladimir", "loser": null, "games_winner": 2, "games_loser": 0, "is_draw": false, "round_number": null, "confidence": 0.7}

Rules:
- ALWAYS respond with valid JSON, nothing else.
- If the input is unclear, set confidence < 0.5 and add a "warning" field explaining.
- Names should be normalized: keep the original spelling.
- games are 0-3 typically (BO3 or BO5).
- "round_number" is null unless explicitly mentioned."""


class ParseIn(BaseModel):
    transcript: str = Field(min_length=2, max_length=500)


class ParseOut(BaseModel):
    winner: str | None = None
    loser: str | None = None
    games_winner: int = 0
    games_loser: int = 0
    is_draw: bool = False
    round_number: int | None = None
    players: list[str] = []
    confidence: float = 0.0
    warning: str | None = None
    raw_transcript: str
    is_mock: bool = False


@router.post("/parse-match", response_model=ParseOut)
@limiter.limit("60/hour")
def parse_match(request: Request, payload: ParseIn, current: UserDep) -> ParseOut:
    """Parsea texto/transcript a estructura match-result. NO reporta automáticamente —
    el frontend debe mostrar preview y pedir confirmación al juez."""
    text = payload.transcript.strip()
    data = ai_chat.complete_json(f"Input: \"{text}\"", system=PARSE_SYSTEM, max_tokens=300)

    is_mock = False
    if data.get("error") == "parse":
        is_mock = True
        # Fallback: regex súper básico para "X gana N-M"
        import re
        m = re.search(r"(\d+)\s*[-–a]\s*(\d+)", text)
        gw, gl = (int(m.group(1)), int(m.group(2))) if m else (0, 0)
        winner_match = re.match(r"^(\S+)\s+(gan[oó]|won|gana)", text, re.IGNORECASE)
        return ParseOut(
            winner=winner_match.group(1) if winner_match else None,
            games_winner=gw, games_loser=gl,
            is_draw=False,
            confidence=0.4 if winner_match else 0.2,
            warning="[Mock] Sin Claude API. Verificá manualmente.",
            raw_transcript=text,
            is_mock=True,
        )

    return ParseOut(
        winner=data.get("winner"),
        loser=data.get("loser"),
        games_winner=int(data.get("games_winner") or 0),
        games_loser=int(data.get("games_loser") or 0),
        is_draw=bool(data.get("is_draw")),
        round_number=data.get("round_number"),
        players=data.get("players") or [],
        confidence=float(data.get("confidence") or 0),
        warning=data.get("warning"),
        raw_transcript=text,
        is_mock=False,
    )
