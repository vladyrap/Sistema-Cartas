"""Quantum Deck — pool de cartas que colapsa determinísticamente con un seed compartido.

Workflow:
  1. Jugador define un pool de 60-100 cartas (con qty).
  2. Al iniciar un match, ambos jugadores acuerdan un seed (típicamente fecha + match_id).
  3. POST /collapse?seed=X devuelve el deck final de N cartas (default 40), determinístico
     por (pool, seed). Mismo seed + mismo pool = mismo deck. Nadie puede predecirlo
     hasta el momento del collapse.
"""
import hashlib
import random
import re
from collections import Counter
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select

from app.core.deps import DbDep, UserDep
from app.models import QuantumDeck, PlayerProfile

router = APIRouter()


def parse_pool(text: str) -> Counter[str]:
    out: Counter[str] = Counter()
    for line in (text or "").splitlines():
        line = line.strip()
        if not line or line.startswith("//") or line.startswith("#"):
            continue
        m = re.match(r"^(?:(\d+)x?\s+)?(.+?)(?:\s*\([^)]+\))?\s*$", line)
        if not m:
            continue
        qty = int(m.group(1) or 1)
        name = m.group(2).strip()
        if name and 1 <= qty <= 12:
            out[name] += qty
    return out


def collapse(pool: Counter[str], target_size: int, seed: str) -> dict[str, int]:
    """Colapso determinístico: random.Random(seed) selecciona cartas proporcionalmente
    a su qty en el pool hasta llegar a target_size."""
    if not pool:
        return {}
    h = hashlib.sha256(seed.encode("utf-8")).digest()
    rnd = random.Random(int.from_bytes(h[:8], "big"))

    bag: list[str] = []
    for name, qty in pool.items():
        bag.extend([name] * qty)
    rnd.shuffle(bag)

    result: dict[str, int] = {}
    max_copies = 4  # límite típico de TCG; configurable a futuro
    for name in bag:
        if sum(result.values()) >= target_size:
            break
        if result.get(name, 0) >= max_copies:
            continue
        result[name] = result.get(name, 0) + 1
    return result


# ─────────────────────── Schemas ───────────────────────

class CreateIn(BaseModel):
    name: str = Field(min_length=2, max_length=120)
    pool_text: str = Field(min_length=10)
    target_size: int = Field(default=40, ge=20, le=80)


class QuantumOut(BaseModel):
    id: int
    name: str
    target_size: int
    pool_unique_cards: int
    pool_total_cards: int
    seed_used: str | None
    last_collapse_at: datetime | None
    last_collapse_result: list[dict] | None


def _to_out(q: QuantumDeck) -> QuantumOut:
    pool = parse_pool(q.pool_text)
    last_result = None
    if q.last_collapse_result:
        result_pool = parse_pool(q.last_collapse_result)
        last_result = [{"name": n, "qty": c} for n, c in result_pool.most_common()]
    return QuantumOut(
        id=q.id, name=q.name, target_size=q.target_size,
        pool_unique_cards=len(pool), pool_total_cards=sum(pool.values()),
        seed_used=q.seed_used,
        last_collapse_at=q.last_collapse_at,
        last_collapse_result=last_result,
    )


# ─────────────────────── Endpoints ───────────────────────


@router.get("/me", response_model=list[QuantumOut])
def my_quantum_decks(current: UserDep, db: DbDep) -> list[QuantumOut]:
    if not current.profile:
        return []
    rows = list(db.scalars(
        select(QuantumDeck).where(QuantumDeck.player_id == current.profile.id)
    ))
    return [_to_out(q) for q in rows]


@router.post("/", response_model=QuantumOut)
def create_quantum_deck(payload: CreateIn, current: UserDep, db: DbDep) -> QuantumOut:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    pool = parse_pool(payload.pool_text)
    if len(pool) < 5:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "El pool debe tener al menos 5 cartas únicas (formato: '4 Lightning Bolt')",
        )
    total = sum(pool.values())
    if total < payload.target_size:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Pool ({total} cartas) menor que target_size ({payload.target_size})",
        )

    q = QuantumDeck(
        player_id=current.profile.id,
        name=payload.name,
        pool_text=payload.pool_text,
        target_size=payload.target_size,
    )
    db.add(q)
    db.commit()
    db.refresh(q)
    return _to_out(q)


class CollapseIn(BaseModel):
    seed: str = Field(min_length=3, max_length=120)


class CollapseOut(BaseModel):
    quantum_id: int
    seed: str
    cards: list[dict]
    target_size: int
    actual_size: int


@router.post("/{quantum_id}/collapse", response_model=CollapseOut)
def collapse_deck(quantum_id: int, payload: CollapseIn, current: UserDep, db: DbDep) -> CollapseOut:
    q = db.get(QuantumDeck, quantum_id)
    if not q:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quantum deck no encontrado")
    if not current.profile or q.player_id != current.profile.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No es tu deck")

    pool = parse_pool(q.pool_text)
    result = collapse(pool, q.target_size, payload.seed)
    cards = [{"name": n, "qty": c} for n, c in sorted(result.items(), key=lambda kv: (-kv[1], kv[0]))]

    # Guardar último colapso
    q.seed_used = payload.seed
    q.last_collapse_at = datetime.now(timezone.utc)
    q.last_collapse_result = "\n".join(f"{c['qty']} {c['name']}" for c in cards)
    db.commit()

    return CollapseOut(
        quantum_id=q.id, seed=payload.seed,
        cards=cards, target_size=q.target_size,
        actual_size=sum(result.values()),
    )


@router.delete("/{quantum_id}", status_code=204)
def delete_quantum(quantum_id: int, current: UserDep, db: DbDep) -> None:
    q = db.get(QuantumDeck, quantum_id)
    if not q:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Quantum deck no encontrado")
    if not current.profile or q.player_id != current.profile.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No es tu deck")
    db.delete(q)
    db.commit()
