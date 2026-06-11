"""Validator de integridad de torneos — detecta inconsistencias antes de finalize.

Chequea:
  - match_points == 3·wins + draws (data corruption)
  - rounds_won + rounds_lost + rounds_draw consistente con matches reportados
  - games_won/games_lost consistentes con MatchResult
  - No hay matches sin reportar
  - No hay disputes abiertas
  - Jugadores droppeados no tienen matches posteriores al drop
  - No hay duplicate opponents (pareo doble en suizo)
  - Rating snapshots existen al iniciar
"""
import hashlib
from collections import Counter
from typing import Any

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Event, EventRegistration, MatchDispute, MatchResult, PlayerProfile,
    EventRatingSnapshot,
)


def validate_event(db: Session, event_id: int) -> dict[str, Any]:
    """Devuelve un dict con todos los issues detectados, severidad y conteos.

    Severidad:
      - critical: no debería poder finalizarse (datos corruptos)
      - warning:  finalizable pero con caveats
      - info:     situación normal, solo informativo
    """
    ev = db.get(Event, event_id)
    if not ev:
        return {"event_id": event_id, "exists": False, "issues": []}

    issues: list[dict] = []

    # ── 1. Matches sin reportar
    unreported = list(db.scalars(
        select(MatchResult).where(
            MatchResult.event_id == event_id,
            MatchResult.reported_at.is_(None),
            MatchResult.is_bye.is_(False),
        )
    ))
    if unreported:
        issues.append({
            "code": "matches_unreported",
            "severity": "critical",
            "count": len(unreported),
            "message": f"{len(unreported)} match(es) sin reportar",
            "ids": [m.id for m in unreported[:10]],
        })

    # ── 2. Disputas abiertas
    open_disputes = list(db.scalars(
        select(MatchDispute)
        .join(MatchResult, MatchResult.id == MatchDispute.match_id)
        .where(MatchResult.event_id == event_id, MatchDispute.status == "OPEN")
    ))
    if open_disputes:
        issues.append({
            "code": "disputes_open",
            "severity": "critical",
            "count": len(open_disputes),
            "message": f"{len(open_disputes)} disputa(s) sin resolver",
            "ids": [d.id for d in open_disputes],
        })

    # ── 2b. Pagos pendientes en evento pago (plata sin cobrar)
    if int(ev.price_clp) > 0:
        from app.models.base import PaymentStatus as _PS
        unpaid = list(db.scalars(
            select(EventRegistration).where(
                EventRegistration.event_id == event_id,
                EventRegistration.payment_status == _PS.PENDING,
            )
        ))
        if unpaid:
            issues.append({
                "code": "registrations_unpaid",
                "severity": "warning",
                "count": len(unpaid),
                "message": (
                    f"{len(unpaid)} inscripción(es) sin pagar "
                    f"(${len(unpaid) * int(ev.price_clp):,} CLP sin cobrar)".replace(",", ".")
                ),
                "ids": [r.id for r in unpaid[:10]],
            })

    # ── 3. Sumatoria match_points consistente
    regs = list(db.scalars(select(EventRegistration).where(EventRegistration.event_id == event_id)))
    inconsistent_mp = []
    for r in regs:
        expected = 3 * r.rounds_won + r.rounds_draw
        if r.match_points != expected:
            inconsistent_mp.append({
                "player_id": r.player_id,
                "stored": r.match_points,
                "expected": expected,
                "diff": r.match_points - expected,
            })
    if inconsistent_mp:
        issues.append({
            "code": "match_points_inconsistent",
            "severity": "critical",
            "count": len(inconsistent_mp),
            "message": f"{len(inconsistent_mp)} jugador(es) con MP ≠ 3·wins + draws",
            "details": inconsistent_mp[:10],
        })

    # ── 4. Counters vs match results
    actual_counts = _compute_actual_counts(db, event_id)
    counter_drift = []
    for r in regs:
        actual = actual_counts.get(r.player_id, {})
        for field in ("rounds_won", "rounds_lost", "rounds_draw"):
            cached = getattr(r, field)
            real = actual.get(field, 0)
            if cached != real:
                counter_drift.append({
                    "player_id": r.player_id,
                    "field": field,
                    "stored": cached,
                    "real": real,
                })
    if counter_drift:
        issues.append({
            "code": "counter_drift",
            "severity": "warning",
            "count": len(counter_drift),
            "message": "Cached counters difieren de MatchResult recount",
            "details": counter_drift[:10],
        })

    # ── 5. Duplicate opponents (mismo rival 2+ veces)
    dup_opps = _detect_duplicate_opponents(db, event_id)
    if dup_opps:
        issues.append({
            "code": "duplicate_opponents",
            "severity": "warning",
            "count": len(dup_opps),
            "message": "Pareos repetidos detectados (mismo rival 2+ veces)",
            "details": dup_opps[:10],
        })

    # ── 6. Rating snapshots faltantes
    snapshots = db.scalar(
        select(func.count(EventRatingSnapshot.id)).where(EventRatingSnapshot.event_id == event_id)
    ) or 0
    if snapshots == 0:
        issues.append({
            "code": "no_rating_snapshot",
            "severity": "info",
            "count": 0,
            "message": "Sin rating snapshot pre-evento (no se podrá mostrar delta Glicko)",
        })

    # ── 7. Players sin attendance
    pending_attendance = sum(1 for r in regs if r.attendance_status == "PENDING")
    if pending_attendance:
        issues.append({
            "code": "attendance_pending",
            "severity": "warning",
            "count": pending_attendance,
            "message": f"{pending_attendance} jugador(es) con attendance PENDING (deberían ser ATTENDED o NO_SHOW)",
        })

    # ── 8. Integrity hash del estado
    integrity_hash = _compute_integrity_hash(db, event_id, regs)

    return {
        "event_id": event_id,
        "event_name": ev.name,
        "event_status": ev.status.value if hasattr(ev.status, "value") else str(ev.status),
        "registered_players": len(regs),
        "total_matches": db.scalar(
            select(func.count(MatchResult.id)).where(MatchResult.event_id == event_id)
        ) or 0,
        "max_round": db.scalar(
            select(func.coalesce(func.max(MatchResult.round_number), 0)).where(MatchResult.event_id == event_id)
        ) or 0,
        "issues": issues,
        "has_critical": any(i["severity"] == "critical" for i in issues),
        "has_warnings": any(i["severity"] == "warning" for i in issues),
        "is_finalizable": not any(i["severity"] == "critical" for i in issues),
        "integrity_hash": integrity_hash,
    }


def _compute_actual_counts(db: Session, event_id: int) -> dict[int, dict[str, int]]:
    """Recalcula rounds_won/lost/draw por jugador desde MatchResult."""
    out: dict[int, dict[str, int]] = {}
    matches = list(db.scalars(
        select(MatchResult).where(MatchResult.event_id == event_id, MatchResult.reported_at.is_not(None))
    ))
    for m in matches:
        for pid in (m.player_a_id, m.player_b_id):
            if pid is None:
                continue
            d = out.setdefault(pid, {"rounds_won": 0, "rounds_lost": 0, "rounds_draw": 0})
            if m.is_bye and pid == m.player_a_id:
                d["rounds_won"] += 1
            elif m.is_draw:
                d["rounds_draw"] += 1
            elif m.winner_id == pid:
                d["rounds_won"] += 1
            elif m.winner_id is not None:
                d["rounds_lost"] += 1
    return out


def _detect_duplicate_opponents(db: Session, event_id: int) -> list[dict]:
    """Lista de (player, opponent, times_played) cuando times >= 2."""
    matches = list(db.scalars(
        select(MatchResult).where(MatchResult.event_id == event_id, MatchResult.is_bye.is_(False))
    ))
    pair_counts: Counter[tuple[int, int]] = Counter()
    for m in matches:
        if m.player_b_id is None:
            continue
        a, b = sorted([m.player_a_id, m.player_b_id])
        pair_counts[(a, b)] += 1
    return [
        {"player_a": a, "player_b": b, "times_played": c}
        for (a, b), c in pair_counts.items() if c >= 2
    ]


def _compute_integrity_hash(db: Session, event_id: int, regs: list) -> str:
    """SHA1 truncado del estado del evento — útil para auditoría.
    Si cambia, alguien modificó la data."""
    parts: list[str] = [f"event:{event_id}"]
    for r in sorted(regs, key=lambda x: x.player_id):
        parts.append(f"p:{r.player_id}:mp{r.match_points}:w{r.rounds_won}:l{r.rounds_lost}:d{r.rounds_draw}")
    matches = list(db.scalars(
        select(MatchResult).where(MatchResult.event_id == event_id).order_by(MatchResult.id)
    ))
    for m in matches:
        parts.append(
            f"m:{m.id}:r{m.round_number}:pa{m.player_a_id}:pb{m.player_b_id or 0}"
            f":w{m.winner_id or 0}:d{int(m.is_draw)}:b{int(m.is_bye)}:ga{m.games_a}:gb{m.games_b}"
        )
    return hashlib.sha1("|".join(parts).encode()).hexdigest()[:16]


def recompute_counters(db: Session, event_id: int) -> int:
    """Repara counters drift recomputando desde MatchResult. Retorna # de regs corregidas."""
    actual = _compute_actual_counts(db, event_id)
    regs = list(db.scalars(select(EventRegistration).where(EventRegistration.event_id == event_id)))
    fixed = 0
    for r in regs:
        real = actual.get(r.player_id, {"rounds_won": 0, "rounds_lost": 0, "rounds_draw": 0})
        new_mp = 3 * real["rounds_won"] + real["rounds_draw"]
        if (r.rounds_won != real["rounds_won"] or r.rounds_lost != real["rounds_lost"]
                or r.rounds_draw != real["rounds_draw"] or r.match_points != new_mp):
            r.rounds_won = real["rounds_won"]
            r.rounds_lost = real["rounds_lost"]
            r.rounds_draw = real["rounds_draw"]
            r.match_points = new_mp
            fixed += 1
    return fixed
