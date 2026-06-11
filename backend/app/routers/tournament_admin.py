"""Tournament admin actions: pairing swap, force-bye, auto-chain round."""
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import func, select

from app.core.deps import AdminDep, DbDep
from app.models import (
    Event, EventRegistration, EventStatus, MatchResult, PlayerProfile, RoundTimer,
)
from app.services import audit
from app.services import event as event_svc
from app.services import realtime as rt
from app.services import tournament as tour_svc

log = logging.getLogger("tournament_admin")
router = APIRouter()


# ═══════════════════════════════════════════════════════════════════════
#  PAIRING SWAP — intercambia jugadores entre dos mesas de la misma ronda
# ═══════════════════════════════════════════════════════════════════════


class SwapIn(BaseModel):
    match_a_id: int
    match_b_id: int
    swap_position: str = Field(default="a", pattern="^(a|b)$")  # cuál posición de A intercambia


@router.post("/events/{event_id}/pairings/swap")
def swap_pairings(event_id: int, payload: SwapIn, admin: AdminDep, db: DbDep) -> dict:
    """Intercambia un jugador del match A con un jugador del match B.

    Requisitos:
      - Ambos matches en la misma ronda y mismo evento.
      - Ninguno reportado todavía (reported_at IS NULL).
      - No es bye.

    Para evitar violar el UNIQUE (event,round,player_a) durante el swap, vamos
    a:
      1. Vaciar temporalmente player_a o player_b en ambos a un valor sentinela
         imposible (-1) flusheando entre medio NO funciona porque la FK rompe.
      2. Mejor: usar SAVEPOINT y aceptar que SQLite no chequea UNIQUE diferido,
         entonces hacemos el swap "in-memory" del Python ANTES del flush —
         SQLAlchemy emite ambos UPDATE en el mismo flush y SQLite valida al
         COMMIT, no entre updates. Postgres con DEFERRABLE haría lo mismo si
         tuviera la constraint con `INITIALLY DEFERRED`.
    """
    m_a = db.get(MatchResult, payload.match_a_id)
    m_b = db.get(MatchResult, payload.match_b_id)
    if not m_a or not m_b:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Match no encontrado")
    if m_a.event_id != event_id or m_b.event_id != event_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Matches de eventos distintos")
    if m_a.round_number != m_b.round_number:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Matches en distintas rondas")
    if m_a.id == m_b.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El mismo match dos veces")
    if m_a.reported_at or m_b.reported_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ya hay match reportado en este swap")
    if m_a.is_bye or m_b.is_bye:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No se puede swappear contra bye — usá force-bye en lugar de swap")

    # Source/target en match A
    if payload.swap_position == "a":
        src_a_attr = "player_a_id"
    else:
        if not m_a.player_b_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Match A no tiene player_b")
        src_a_attr = "player_b_id"

    # Heurística: swappeamos contra player_a del match B (la posición "principal")
    src_b_attr = "player_a_id"

    a_player = getattr(m_a, src_a_attr)
    b_player = getattr(m_b, src_b_attr)
    if a_player == b_player:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mismo jugador en ambas mesas")

    # Swap in-memory — flush en una sola transacción
    setattr(m_a, src_a_attr, b_player)
    setattr(m_b, src_b_attr, a_player)
    db.flush()

    pa = db.get(PlayerProfile, a_player)
    pb = db.get(PlayerProfile, b_player)
    audit.log(
        db, admin_id=admin.id, action="pairing.swap",
        guild_id=db.get(Event, event_id).guild_id,
        target_kind="event", target_id=event_id,
        payload={
            "round": m_a.round_number,
            "match_a_id": m_a.id, "match_b_id": m_b.id,
            "player_swapped_in_match_a": b_player,
            "player_swapped_in_match_b": a_player,
        },
    )
    rt.emit_pairing_swapped(event_id, m_a.round_number)
    db.commit()
    return {
        "ok": True, "round": m_a.round_number,
        "match_a_now_has": pb.alias if pb else b_player,
        "match_b_now_has": pa.alias if pa else a_player,
    }


# ═══════════════════════════════════════════════════════════════════════
#  FORCE BYE — admin convierte un match en bye para player_a
# ═══════════════════════════════════════════════════════════════════════


class ForceByeIn(BaseModel):
    reason: str = Field(min_length=3, max_length=300)


@router.post("/matches/{match_id}/force-bye")
def force_bye(match_id: int, payload: ForceByeIn, admin: AdminDep, db: DbDep) -> dict:
    """Convierte un match no reportado en bye para player_a. player_b queda
    libre (sin pairing en esa ronda). Útil cuando un jugador no llegó a la mesa.

    El jugador "expulsado" mantiene su match_points actual y NO recibe loss.
    Para penalizarlo, usá `/api/tour-pro/penalties` por separado.
    """
    m = db.get(MatchResult, match_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Match no encontrado")
    if m.reported_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Match ya reportado")
    if m.is_bye:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ya es bye")
    if not m.player_b_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Match ya no tiene player_b (estado inválido)")

    excluded_id = m.player_b_id
    m.player_b_id = None
    m.is_bye = True
    m.winner_id = m.player_a_id
    m.games_a = 2
    m.games_b = 0
    m.reported_at = datetime.now(timezone.utc)
    m.reported_by_id = admin.id

    # Actualizar counters del jugador A (win) — el B no gana ni pierde nada
    reg_a = db.scalar(select(EventRegistration).where(
        EventRegistration.event_id == m.event_id,
        EventRegistration.player_id == m.player_a_id,
    ))
    if reg_a:
        reg_a.rounds_won += 1
        reg_a.games_won += 2
        reg_a.match_points += 3
    db.flush()

    audit.log(
        db, admin_id=admin.id, action="match.force_bye",
        guild_id=db.get(Event, m.event_id).guild_id,
        target_kind="match", target_id=match_id,
        payload={"event_id": m.event_id, "round": m.round_number, "excluded_player_id": excluded_id, "reason": payload.reason},
    )
    tour_svc.invalidate_event_cache(m.event_id)
    rt.emit_match_reported(m.event_id, m.id, m.round_number, winner_id=m.winner_id, is_draw=False, games_a=2, games_b=0)
    rt.emit_standings_updated(m.event_id)
    db.commit()

    excluded = db.get(PlayerProfile, excluded_id)
    return {
        "ok": True, "match_id": match_id, "round": m.round_number,
        "excluded_player_alias": excluded.alias if excluded else None,
    }


# ═══════════════════════════════════════════════════════════════════════
#  AUTO-CHAIN ROUND — cerrar ronda + abrir próxima + arrancar timer
# ═══════════════════════════════════════════════════════════════════════


class AutoNextIn(BaseModel):
    timer_minutes: int | None = Field(default=None, ge=1, le=120)


@router.post("/events/{event_id}/auto-next-round")
def auto_next_round(event_id: int, payload: AutoNextIn, admin: AdminDep, db: DbDep) -> dict:
    """Atomic: valida que la ronda actual esté cerrada + genera la próxima +
    arranca el timer en una sola transacción.
    """
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    if ev.status not in (EventStatus.OPEN, EventStatus.CLOSED):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Estado {ev.status.value} no permite generar ronda")

    last_round = db.scalar(
        select(func.coalesce(func.max(MatchResult.round_number), 0)).where(
            MatchResult.event_id == event_id
        )
    ) or 0

    # Primera ronda: lockear todos los decks
    if last_round == 0:
        event_svc.lock_decks_for_event(db, event_id=event_id)
        if ev.status == EventStatus.OPEN:
            ev.status = EventStatus.CLOSED

    # Generar pairings — esto valida que la ronda actual no tenga pendientes
    proposals = tour_svc.generate_pairings(db, event_id=event_id)
    if not proposals:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No hay jugadores activos para emparejar")
    matches = tour_svc.persist_pairings(db, event_id=event_id, pairings=proposals)
    new_round = matches[0].round_number if matches else last_round + 1

    # Iniciar timer
    minutes = payload.timer_minutes or 50
    from datetime import timedelta
    now = datetime.now(timezone.utc)
    timer = RoundTimer(
        event_id=event_id,
        round_number=new_round,
        duration_minutes=minutes,
        started_at=now,
        ends_at=now + timedelta(minutes=minutes),
        status="RUNNING",
    )
    db.add(timer)
    db.flush()

    audit.log(
        db, admin_id=admin.id, action="round.auto_chain",
        guild_id=ev.guild_id, target_kind="event", target_id=event_id,
        payload={"from_round": last_round, "to_round": new_round, "minutes": minutes},
    )
    db.commit()

    rt.emit_round_started(event_id, new_round, len(matches))
    rt.emit_timer_event(event_id, new_round, "started", remaining_seconds=minutes * 60)

    return {
        "ok": True, "round_number": new_round,
        "pairings_count": len(matches),
        "timer_started_minutes": minutes,
    }
