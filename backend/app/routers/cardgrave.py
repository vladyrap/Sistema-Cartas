"""Cardgrave — cementerio de cartas baneadas con epitafios IA.

GET /api/cardgrave — lista pública, devuelve todas las lápidas.
POST /api/cardgrave/{card_name}/visit — incrementa visitas (compartir métrica).
POST /api/cardgrave/seed — admin trigger: barre BanlistEntry status=BANNED y crea
                          entradas + epitafio IA para las que no estén ya.
"""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import desc, select

from app.core.deps import AdminDep, DbDep
from app.models import BanlistEntry, BanlistStatus, CardgraveEntry, Game
from app.services import ai_chat

log = logging.getLogger("cardgrave")
router = APIRouter()


EPITAPH_SYSTEM = """You write irreverent, melancholy, witty epitaphs (in Spanish, Chilean/LatAm tone) for banned TCG cards. Each epitaph should be:

- 1-2 sentences max (under 180 chars)
- Lyrical, slightly funny, dramatic — like a tombstone in a fantasy graveyard
- Reference WHY it was likely banned (combo, oppressive, broken, etc.) without being too on-the-nose
- No quote marks around it

Respond ONLY with the epitaph text. No preamble."""


class CardgraveOut(BaseModel):
    id: int
    card_name: str
    epitaph: str
    buried_year: int | None
    buried_at: datetime | None
    visit_count: int
    game_name: str | None = None
    rationale: str | None = None  # razón original de la banlist


@router.get("", response_model=list[CardgraveOut])
def list_graves(db: DbDep, limit: int = 200) -> list[CardgraveOut]:
    limit = max(1, min(limit, 500))
    rows = list(db.scalars(
        select(CardgraveEntry).order_by(desc(CardgraveEntry.buried_year), CardgraveEntry.card_name).limit(limit)
    ))
    out: list[CardgraveOut] = []
    for r in rows:
        be = db.get(BanlistEntry, r.banlist_entry_id) if r.banlist_entry_id else None
        game = db.get(Game, be.game_id) if be else None
        out.append(CardgraveOut(
            id=r.id, card_name=r.card_name, epitaph=r.epitaph,
            buried_year=r.buried_year, buried_at=r.buried_at,
            visit_count=r.visit_count,
            game_name=game.name if game else None,
            rationale=be.notes if be else None,
        ))
    return out


@router.post("/{card_name}/visit", status_code=204)
def visit(card_name: str, db: DbDep) -> None:
    e = db.scalar(select(CardgraveEntry).where(CardgraveEntry.card_name == card_name))
    if not e:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Tumba no encontrada")
    e.visit_count += 1
    db.commit()


class SeedResult(BaseModel):
    created: int
    skipped_existing: int
    failed: int


def _generate_epitaph(card_name: str, rationale: str | None) -> str:
    prompt = f"Card: {card_name}\nBan rationale: {rationale or '(none documented)'}\n\nWrite the epitaph."
    text = ai_chat.complete(prompt, system=EPITAPH_SYSTEM, max_tokens=180).strip()
    return text[:280] if text else f"{card_name}: roto. Demasiado libre para este meta."


@router.post("/seed", response_model=SeedResult)
def seed_from_banlist(admin: AdminDep, db: DbDep) -> SeedResult:
    """Admin trigger: por cada BanlistEntry status=BANNED, crea Cardgrave con epitafio IA."""
    bans = list(db.scalars(
        select(BanlistEntry).where(BanlistEntry.status == BanlistStatus.BANNED)
    ))
    created = skipped = failed = 0
    for ban in bans:
        existing = db.scalar(select(CardgraveEntry).where(CardgraveEntry.card_name == ban.card_name))
        if existing:
            skipped += 1
            continue
        try:
            epitaph = _generate_epitaph(ban.card_name, ban.notes)
            entry = CardgraveEntry(
                card_name=ban.card_name,
                banlist_entry_id=ban.id,
                epitaph=epitaph,
                buried_year=ban.created_at.year if ban.created_at else None,
                buried_at=ban.created_at,
            )
            db.add(entry)
            db.flush()
            created += 1
        except Exception:
            log.exception("Failed to seed cardgrave for %s", ban.card_name)
            failed += 1
    db.commit()
    return SeedResult(created=created, skipped_existing=skipped, failed=failed)
