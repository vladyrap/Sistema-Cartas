"""Card Drama — Claude escribe un microfic dramático entre 2 cartas.

Cacheo simple en memoria (key = (a,b) ordenado) por proceso. Las microfics
son determinísticas por par, así que solo se genera una vez. Si reiniciás el
server se regenera (no persistimos por ahora — son texto descartable).
"""
import logging

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel

from app.core.rate_limit import limiter
from app.services import ai_chat

log = logging.getLogger("card_drama")
router = APIRouter()


SYSTEM = """You are a flash-fiction writer for a TCG community in Chile/LatAm.

Given TWO card names (could be from Magic, Pokémon, Yu-Gi-Oh!, One Piece, etc.),
write a dramatic micro-fiction of EXACTLY 150-200 words in Spanish (Chilean tone)
in which both cards face off as if they were characters in an epic confrontation.

Rules:
- Treat each card as a sentient being with personality matching its lore.
- Set a brief scene (cosmic plane, ruined cathedral, neon city, etc.).
- Use vivid metaphors. Be a little melodramatic on purpose.
- End with an open or surprising line — no clean winner.
- No quote marks around the whole text. Just the story.

Respond ONLY with the story. No preamble, no title."""


_CACHE: dict[tuple[str, str], str] = {}


class DramaIn(BaseModel):
    card_a: str
    card_b: str


class DramaOut(BaseModel):
    card_a: str
    card_b: str
    drama: str
    is_mock: bool = False
    cached: bool = False


@router.get("/", response_model=DramaOut)
@limiter.limit("20/hour")
def get_drama(request: Request, card_a: str, card_b: str) -> DramaOut:
    a = (card_a or "").strip()
    b = (card_b or "").strip()
    if not a or not b:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Faltan card_a y card_b")
    if len(a) > 120 or len(b) > 120:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Nombres muy largos")
    if a.lower() == b.lower():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Tienen que ser distintas")

    key = tuple(sorted([a.lower(), b.lower()]))
    if key in _CACHE:
        return DramaOut(card_a=a, card_b=b, drama=_CACHE[key], cached=True)

    prompt = f"Cards:\n- {a}\n- {b}\n\nWrite the drama."
    text = ai_chat.complete(prompt, system=SYSTEM, max_tokens=400).strip()
    is_mock = text.startswith("[MOCK]") or text.startswith("[Error AI]")

    if not is_mock and text:
        _CACHE[key] = text

    if is_mock:
        text = _fallback_drama(a, b)

    return DramaOut(card_a=a, card_b=b, drama=text, is_mock=is_mock)


def _fallback_drama(a: str, b: str) -> str:
    return (
        f"En la cima de una catedral en ruinas, {a} levanta la voz y desafía al cielo. "
        f"Frente a ella, {b} la mira con la indiferencia de quien ha visto caer imperios. "
        f"\"No te conozco\", dice {b}. \"Pero ya sé cómo va a terminar esto.\" "
        f"{a} responde con un gesto que parece arrogancia y termina siendo nostalgia. "
        f"Las nubes giran. Algo en el horizonte se quiebra. Y entonces — silencio."
    )
