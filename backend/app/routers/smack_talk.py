"""Smack Talk Generator — Claude genera taunts pre-match contra un opponent específico.

Recibe opponent_id, calcula contexto del rival (alias, winrate reciente, racha,
último resultado) y le pide a Claude 3 taunts personalizados.
"""
import json
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import desc, or_, select

from app.core.deps import DbDep, UserDep
from app.core.rate_limit import limiter
from app.models import MatchResult, PlayerProfile, PlayerRating, PlayerStreak
from app.services import ai_chat

router = APIRouter()
log = logging.getLogger("smack")


SYSTEM = """You are a witty, edgy trash-talk generator for a competitive TCG community.

Your job: invent 3 short, funny pre-match taunts from PLAYER A to PLAYER B.

Style rules:
  - Spanish (Chile / LatAm vibe). Informal pero sin insultos pesados.
  - Each taunt under 140 chars. No vulgar slurs, no real-world harm.
  - Reference the opponent's stats when possible (winrate, streak, recent loss).
  - Make them sound playful — locker-room banter, not bullying.

Respond ONLY with valid JSON in this exact shape:

{
  "taunts": [
    "<taunt 1>",
    "<taunt 2>",
    "<taunt 3>"
  ]
}"""


class TauntsOut(BaseModel):
    opponent_alias: str
    opponent_winrate: float | None = None
    opponent_streak: int | None = None
    taunts: list[str]
    is_mock: bool = False


@router.get("/{opponent_id}", response_model=TauntsOut)
@limiter.limit("12/hour")
def generate(request: Request, opponent_id: int, current: UserDep, db: DbDep) -> TauntsOut:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    opp = db.get(PlayerProfile, opponent_id)
    if not opp:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Oponente no encontrado")
    if opp.id == current.profile.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No puedes hablar mal de ti mismo")

    # Contexto del oponente: últimos 20 matches
    cutoff = datetime.now(timezone.utc) - timedelta(days=60)
    matches = list(db.scalars(
        select(MatchResult)
        .where(
            or_(MatchResult.player_a_id == opp.id, MatchResult.player_b_id == opp.id),
            MatchResult.created_at >= cutoff,
        )
        .order_by(desc(MatchResult.created_at))
        .limit(20)
    ))
    wins = sum(1 for m in matches if m.winner_id == opp.id)
    n = len(matches)
    winrate = round(wins / n * 100, 1) if n else None

    # Last 3 results
    last3 = []
    for m in matches[:3]:
        if m.is_draw or m.winner_id is None:
            last3.append("D")
        elif m.winner_id == opp.id:
            last3.append("W")
        else:
            last3.append("L")

    # Top rating
    top_rating = db.scalar(
        select(PlayerRating.rating)
        .where(PlayerRating.player_id == opp.id)
        .order_by(desc(PlayerRating.rating)).limit(1)
    )

    # Streak (mejor de todos los gremios)
    longest_streak = db.scalar(
        select(PlayerStreak.longest_streak)
        .where(PlayerStreak.player_id == opp.id)
        .order_by(desc(PlayerStreak.longest_streak)).limit(1)
    )

    me_alias = current.profile.alias
    ctx = {
        "from": me_alias,
        "to": opp.alias,
        "opponent_winrate_pct": winrate,
        "opponent_matches_recent": n,
        "opponent_last_3_results": last3,
        "opponent_rating": float(top_rating) if top_rating else None,
        "opponent_streak_record": int(longest_streak) if longest_streak else None,
    }

    prompt = (
        f"Generate 3 pre-match taunts. Context:\n{json.dumps(ctx, ensure_ascii=False, indent=2)}"
    )
    data = ai_chat.complete_json(prompt, system=SYSTEM, max_tokens=400, creative=True)

    taunts = data.get("taunts") if isinstance(data, dict) else None
    is_mock = bool(data.get("error") == "parse" or not taunts)
    if is_mock:
        taunts = _fallback_taunts(opp.alias, winrate, last3)

    # Sanitizar y limitar
    taunts = [str(t)[:200] for t in taunts if isinstance(t, str)][:3]
    while len(taunts) < 3:
        taunts.append(f"Suerte {opp.alias}. La vas a necesitar.")

    return TauntsOut(
        opponent_alias=opp.alias,
        opponent_winrate=winrate,
        opponent_streak=int(longest_streak) if longest_streak else None,
        taunts=taunts,
        is_mock=is_mock,
    )


def _fallback_taunts(alias: str, winrate: float | None, last3: list[str]) -> list[str]:
    """Sin Claude API key — pre-hechos."""
    base = [
        f"{alias}, traé pañuelos. Vas a llorar la mesa.",
        f"Espero que esta vez sí leas tus cartas, {alias}.",
        f"Avisame cuando puedas concederme, {alias}.",
    ]
    if winrate is not None and winrate < 40:
        base.append(f"{int(winrate)}% winrate. Esto va a ser rápido.")
    if last3.count("L") >= 2:
        base.append(f"Otra derrota y se vuelve costumbre, {alias}.")
    return base[:3]
