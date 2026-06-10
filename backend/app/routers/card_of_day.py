"""Card of the Day — Claude genera una carta TCG nueva cada día. Cacheada en DB."""
import json
from datetime import date

from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import select

from app.core.deps import DbDep
from app.models import DailyCard
from app.services import ai_chat

router = APIRouter()

CARD_GEN_SYSTEM = """You are a creative TCG card designer for a fictional card game called "EliteCards".

Invent ONE original card. Respond ONLY with valid JSON in this exact shape:

{
  "name": "<creative name, 2-4 words>",
  "mana_cost": "<short cost string like '2RR' or '3' — keep it 1-5 chars>",
  "card_type": "<like 'Creature — Dragon', 'Sorcery', 'Artifact — Equipment'>",
  "text": "<rules text, 1-3 sentences. Keywords allowed. Under 200 chars.>",
  "flavor": "<flavor quote, evocative, under 120 chars>",
  "power": "<if creature, like '4', else empty string>",
  "toughness": "<if creature, like '3', else empty string>",
  "rarity": "<common|uncommon|rare|mythic>",
  "art_prompt": "<vivid Midjourney-style art prompt, under 200 chars>",
  "color": "<one of: red, blue, green, white, black, gold, colorless>"
}

Make it balanced (no 0-mana auto-win bombs). Vary themes day to day."""


class CardOut(BaseModel):
    date: date
    name: str
    mana_cost: str | None = None
    card_type: str | None = None
    text: str | None = None
    flavor: str | None = None
    power: str | None = None
    toughness: str | None = None
    rarity: str | None = None
    art_prompt: str | None = None
    color: str | None = None
    is_fresh: bool = False  # True si se generó ahora; False si vino del cache


@router.get("/today", response_model=CardOut)
def get_today(db: DbDep) -> CardOut:
    today = date.today()
    existing = db.scalar(select(DailyCard).where(DailyCard.card_date == today))
    if existing:
        return CardOut(
            date=existing.card_date,
            name=existing.name,
            mana_cost=existing.mana_cost,
            card_type=existing.card_type,
            text=existing.text,
            flavor=existing.flavor,
            power=existing.power,
            toughness=existing.toughness,
            rarity=existing.rarity,
            art_prompt=existing.art_prompt,
            color=existing.color,
            is_fresh=False,
        )

    # Generar carta nueva
    prompt = f"Today is {today.isoformat()}. Invent today's card."
    data = ai_chat.complete_json(prompt, system=CARD_GEN_SYSTEM, max_tokens=600)

    # Si la IA falla y devuelve {"raw": ..., "error": ...}, usar fallback
    if data.get("error") == "parse":
        data = _fallback_card()

    card = DailyCard(
        card_date=today,
        name=str(data.get("name") or "Carta Misteriosa")[:120],
        mana_cost=str(data.get("mana_cost") or "")[:40] or None,
        card_type=str(data.get("card_type") or "")[:120] or None,
        text=(data.get("text") or None),
        flavor=(data.get("flavor") or None),
        power=str(data.get("power") or "")[:8] or None,
        toughness=str(data.get("toughness") or "")[:8] or None,
        rarity=str(data.get("rarity") or "common")[:20],
        art_prompt=(data.get("art_prompt") or None),
        color=str(data.get("color") or "violet")[:20],
    )
    db.add(card)
    db.commit()
    db.refresh(card)

    return CardOut(
        date=card.card_date,
        name=card.name, mana_cost=card.mana_cost, card_type=card.card_type,
        text=card.text, flavor=card.flavor, power=card.power, toughness=card.toughness,
        rarity=card.rarity, art_prompt=card.art_prompt, color=card.color,
        is_fresh=True,
    )


def _fallback_card() -> dict:
    """Carta determinista si la IA falla. Para que el endpoint nunca quede 500."""
    return {
        "name": "Sello del Iniciado",
        "mana_cost": "1",
        "card_type": "Artifact",
        "text": "Cuando entre al juego, robá una carta.",
        "flavor": "Cada gran maestro empezó dando un solo paso.",
        "power": "", "toughness": "",
        "rarity": "common",
        "art_prompt": "Glowing arcane seal floating over an ancient parchment, soft violet runes",
        "color": "violet",
    }
