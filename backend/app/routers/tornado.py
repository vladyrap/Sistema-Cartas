"""Tornado of Fate — un buff random diario para un jugador random."""
import json
import logging
import random
from datetime import date as _date, datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import desc, select
from sqlalchemy.exc import IntegrityError

from app.core.deps import DbDep, GuildContext, OptionalUserDep
from app.models import (
    ExpTransaction, Guild, GuildMembership, PlayerProfile, Season,
    SeasonStatus, TornadoEvent,
)

log = logging.getLogger("tornado")
router = APIRouter()


BUFFS = [
    {"kind": "exp_double", "label": "Doble EXP por 24h", "weight": 25},
    {"kind": "exp_bonus", "label": "+250 EXP instantáneos", "weight": 30, "exp": 250},
    {"kind": "exp_bonus", "label": "+500 EXP instantáneos", "weight": 15, "exp": 500},
    {"kind": "exp_bonus", "label": "+1000 EXP instantáneos", "weight": 5, "exp": 1000},
    {"kind": "lucky_match", "label": "Próximo match con +50% EXP", "weight": 15},
    {"kind": "title", "label": "Título efímero 'Elegido del Tornado'", "weight": 8},
    {"kind": "spinner_bonus", "label": "Spinner del día garantiza Epic+", "weight": 2},
]


class TornadoOut(BaseModel):
    id: int
    event_date: _date
    target_alias: str
    target_elite_id: str
    target_player_id: int
    buff_kind: str
    buff_label: str
    expires_at: datetime
    claimed_at: datetime | None
    is_me: bool = False


def _to_out(t: TornadoEvent, profile: PlayerProfile, *, me_pid: int | None) -> TornadoOut:
    return TornadoOut(
        id=t.id, event_date=t.event_date,
        target_alias=profile.alias, target_elite_id=profile.elite_id_code,
        target_player_id=profile.id,
        buff_kind=t.buff_kind, buff_label=t.buff_label,
        expires_at=t.expires_at, claimed_at=t.claimed_at,
        is_me=(me_pid is not None and profile.id == me_pid),
    )


@router.get("/current", response_model=TornadoOut | None)
def current_tornado(db: DbDep, guild: GuildContext, current: OptionalUserDep = None) -> TornadoOut | None:
    """Devuelve el tornado activo del día (si lo hay) del Gremio seleccionado."""
    gid = guild.id if guild else None
    if not gid:
        return None
    today = _date.today()
    t = db.scalar(
        select(TornadoEvent)
        .where(TornadoEvent.guild_id == gid, TornadoEvent.event_date == today)
    )
    if not t:
        return None
    profile = db.get(PlayerProfile, t.target_player_id)
    if not profile:
        return None
    me_pid = current.profile.id if current and current.profile else None
    return _to_out(t, profile, me_pid=me_pid)


@router.get("/history", response_model=list[TornadoOut])
def history(db: DbDep, guild: GuildContext, limit: int = 14, current: OptionalUserDep = None) -> list[TornadoOut]:
    limit = max(1, min(limit, 30))
    if not guild:
        return []
    rows = list(db.scalars(
        select(TornadoEvent).where(TornadoEvent.guild_id == guild.id)
        .order_by(desc(TornadoEvent.event_date)).limit(limit)
    ))
    me_pid = current.profile.id if current and current.profile else None
    out: list[TornadoOut] = []
    for r in rows:
        p = db.get(PlayerProfile, r.target_player_id)
        if p:
            out.append(_to_out(r, p, me_pid=me_pid))
    return out


def _pick_buff() -> dict:
    weights = [b["weight"] for b in BUFFS]
    return random.choices(BUFFS, weights=weights, k=1)[0]


def _award_buff(db, profile: PlayerProfile, buff: dict, active_season: Season | None) -> None:
    """Si el buff es de EXP inmediata, acreditarla. Otros buffs se marcan pero
    se aplican lazy cuando aplique (en el match correspondiente)."""
    if buff["kind"] == "exp_bonus" and active_season and buff.get("exp"):
        db.add(ExpTransaction(
            player_id=profile.id,
            season_id=active_season.id,
            amount=int(buff["exp"]),
            reason="tornado_of_fate",
        ))


def fire_tornado(db, *, guild_id: int) -> TornadoEvent | None:
    """Dispara el tornado del día para un gremio. Idempotente — si ya hay uno
    hoy, devuelve None (no crea segundo)."""
    today = _date.today()
    existing = db.scalar(
        select(TornadoEvent).where(
            TornadoEvent.guild_id == guild_id, TornadoEvent.event_date == today,
        )
    )
    if existing:
        return None

    # Elegir un miembro activo random del gremio
    members = list(db.scalars(
        select(PlayerProfile)
        .join(GuildMembership, GuildMembership.user_id == PlayerProfile.user_id)
        .where(GuildMembership.guild_id == guild_id, GuildMembership.is_active.is_(True))
    ))
    if not members:
        return None
    target = random.choice(members)

    buff = _pick_buff()
    active_season = db.scalar(select(Season).where(Season.status == SeasonStatus.ACTIVE))
    expires = datetime.now(timezone.utc) + timedelta(hours=24)

    t = TornadoEvent(
        guild_id=guild_id,
        event_date=today,
        target_player_id=target.id,
        buff_kind=buff["kind"],
        buff_label=buff["label"],
        buff_payload=json.dumps({k: v for k, v in buff.items() if k != "weight"}, default=str),
        expires_at=expires,
    )
    db.add(t)
    try:
        db.flush()
    except IntegrityError:
        db.rollback()
        return None

    _award_buff(db, target, buff, active_season)
    db.commit()
    log.info("Tornado fired for guild %s target=%s buff=%s", guild_id, target.alias, buff["label"])
    return t


@router.post("/fire", response_model=TornadoOut)
def manual_fire(db: DbDep, guild: GuildContext) -> TornadoOut:
    """Trigger manual del tornado del día (idempotente). Útil para testing."""
    if not guild:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Falta X-Guild-Id")
    t = fire_tornado(db, guild_id=guild.id)
    if not t:
        existing = db.scalar(
            select(TornadoEvent).where(
                TornadoEvent.guild_id == guild.id, TornadoEvent.event_date == _date.today(),
            )
        )
        if not existing:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "Sin miembros para sortear")
        t = existing
    profile = db.get(PlayerProfile, t.target_player_id)
    return _to_out(t, profile, me_pid=None)
