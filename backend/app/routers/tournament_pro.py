"""Endpoints avanzados de gestión de torneos.

Cubre:
  - Self-report + dual confirmation (jugador → opp confirms / disputes)
  - Dispute resolution (admin)
  - Round timer (start / pause / extend / end)
  - Rating snapshot (al iniciar / finalizar evento)
  - Penalty management
  - Health dashboard
  - Standings recompute (repair counter drift)
"""
import logging
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError

from app.core.deps import AdminDep, DbDep, UserDep
from app.core.rate_limit import limiter
from app.models import (
    Event, EventPenalty, EventRatingSnapshot, EventRegistration,
    MatchDispute, MatchReport, MatchResult, PlayerProfile, PlayerRating,
    RoundTimer,
)
from app.services import tournament as tour_svc
from app.services import tournament_integrity as integrity_svc
from app.services import audit

log = logging.getLogger("tournament_pro")
router = APIRouter()


# ═══════════════════════════════════════════════════════════════════════
#  HEALTH DASHBOARD
# ═══════════════════════════════════════════════════════════════════════


@router.get("/events/{event_id}/health")
def health(event_id: int, admin: AdminDep, db: DbDep) -> dict:
    """Reporte completo de salud del evento. Solo admin."""
    return integrity_svc.validate_event(db, event_id)


@router.post("/events/{event_id}/recompute-counters")
def recompute(event_id: int, admin: AdminDep, db: DbDep) -> dict:
    """Repara counter drift recomputando desde MatchResult. Útil tras correcciones manuales."""
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    fixed = integrity_svc.recompute_counters(db, event_id)
    tour_svc.invalidate_event_cache(event_id)
    audit.log(
        db, admin_id=admin.id, action="event.recompute_counters",
        guild_id=ev.guild_id, target_kind="event", target_id=event_id,
        payload={"fixed_count": fixed},
    )
    db.commit()
    return {"event_id": event_id, "registrations_fixed": fixed}


# ═══════════════════════════════════════════════════════════════════════
#  MATCH SELF-REPORT + CONFIRMATION
# ═══════════════════════════════════════════════════════════════════════


class SelfReportIn(BaseModel):
    winner_id: int | None = None
    is_draw: bool = False
    games_a: int = Field(ge=0, le=10)
    games_b: int = Field(ge=0, le=10)
    notes: str | None = Field(default=None, max_length=500)


class MatchReportOut(BaseModel):
    id: int
    match_id: int
    reporter_alias: str
    claimed_winner_id: int | None
    claimed_is_draw: bool
    claimed_games_a: int
    claimed_games_b: int
    status: str
    confirmed_at: datetime | None


def _serialize_report(db, r: MatchReport) -> MatchReportOut:
    rep = db.get(PlayerProfile, r.reporter_player_id)
    return MatchReportOut(
        id=r.id, match_id=r.match_id,
        reporter_alias=rep.alias if rep else "?",
        claimed_winner_id=r.claimed_winner_id,
        claimed_is_draw=r.claimed_is_draw,
        claimed_games_a=r.claimed_games_a,
        claimed_games_b=r.claimed_games_b,
        status=r.status,
        confirmed_at=r.confirmed_at,
    )


@router.post("/matches/{match_id}/self-report", response_model=MatchReportOut)
@limiter.limit("30/hour")
def self_report(request: Request, match_id: int, payload: SelfReportIn, current: UserDep, db: DbDep) -> MatchReportOut:
    """Jugador reporta el resultado de su match. Se crea MatchReport en PENDING_CONFIRMATION
    hasta que el oponente confirme/dispute o un admin override."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    m = db.get(MatchResult, match_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Match no encontrado")
    if m.is_bye:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Los byes no se reportan")
    if current.profile.id not in (m.player_a_id, m.player_b_id):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No sos parte de este match")

    # Validar consistencia
    if not payload.is_draw and payload.winner_id is None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Indicá ganador o marcá draw")
    if payload.is_draw and payload.winner_id is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Un draw no tiene ganador")
    if payload.winner_id is not None and payload.winner_id not in (m.player_a_id, m.player_b_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Winner debe ser uno de los jugadores")

    # ¿Ya existe report del mismo jugador? Actualizarlo
    existing = db.scalar(select(MatchReport).where(
        MatchReport.match_id == match_id,
        MatchReport.reporter_player_id == current.profile.id,
    ))
    if existing and existing.status == "CANCELLED":
        existing.status = "PENDING_CONFIRMATION"
    if existing and existing.status not in ("PENDING_CONFIRMATION", "CANCELLED"):
        raise HTTPException(status.HTTP_409_CONFLICT, f"Ya reportaste este match (status={existing.status})")

    if not existing:
        existing = MatchReport(
            match_id=match_id,
            reporter_player_id=current.profile.id,
        )
        db.add(existing)

    existing.claimed_winner_id = payload.winner_id
    existing.claimed_is_draw = payload.is_draw
    existing.claimed_games_a = payload.games_a
    existing.claimed_games_b = payload.games_b
    existing.notes = payload.notes
    existing.status = "PENDING_CONFIRMATION"
    db.flush()

    # ¿Hay un report previo del rival con datos coincidentes? Auto-confirm
    opp_id = m.player_b_id if current.profile.id == m.player_a_id else m.player_a_id
    if opp_id:
        opp_report = db.scalar(select(MatchReport).where(
            MatchReport.match_id == match_id,
            MatchReport.reporter_player_id == opp_id,
            MatchReport.status == "PENDING_CONFIRMATION",
        ))
        if opp_report:
            same = (
                opp_report.claimed_winner_id == payload.winner_id
                and opp_report.claimed_is_draw == payload.is_draw
                and opp_report.claimed_games_a == payload.games_a
                and opp_report.claimed_games_b == payload.games_b
            )
            if same:
                # Auto-confirm + aplicar al MatchResult
                existing.status = "CONFIRMED"
                existing.confirmed_at = datetime.now(timezone.utc)
                existing.confirmed_by_player_id = opp_id
                opp_report.status = "CONFIRMED"
                opp_report.confirmed_at = existing.confirmed_at
                opp_report.confirmed_by_player_id = current.profile.id
                tour_svc.report_match(
                    db, match_id=match_id,
                    winner_id=payload.winner_id, is_draw=payload.is_draw,
                    games_a=payload.games_a, games_b=payload.games_b,
                    reported_by_user_id=current.id,
                )
            else:
                # Discrepancia → crear dispute automático
                existing.status = "DISPUTED"
                opp_report.status = "DISPUTED"
                db.add(MatchDispute(
                    match_id=match_id,
                    opened_by_player_id=current.profile.id,
                    reason="Auto: reports difieren entre jugadores",
                    status="OPEN",
                ))

    db.commit()
    db.refresh(existing)
    return _serialize_report(db, existing)


@router.get("/matches/{match_id}/reports", response_model=list[MatchReportOut])
def list_reports(match_id: int, current: UserDep, db: DbDep) -> list[MatchReportOut]:
    """Lista los reports del match (sólo si participás o sos admin)."""
    m = db.get(MatchResult, match_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Match no encontrado")
    is_admin = current.role.value in ("ADMIN", "SUPER_ADMIN")
    is_player = current.profile and current.profile.id in (m.player_a_id, m.player_b_id)
    if not is_admin and not is_player:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No tenés acceso")
    reports = list(db.scalars(select(MatchReport).where(MatchReport.match_id == match_id)))
    return [_serialize_report(db, r) for r in reports]


# ═══════════════════════════════════════════════════════════════════════
#  DISPUTES
# ═══════════════════════════════════════════════════════════════════════


class DisputeOpenIn(BaseModel):
    reason: str = Field(min_length=4, max_length=280)


class DisputeOut(BaseModel):
    id: int
    match_id: int
    opened_by_alias: str
    reason: str
    status: str
    opened_at: datetime
    resolved_at: datetime | None = None
    resolution_notes: str | None = None
    final_winner_id: int | None = None
    final_is_draw: bool = False


def _serialize_dispute(db, d: MatchDispute) -> DisputeOut:
    opener = db.get(PlayerProfile, d.opened_by_player_id)
    return DisputeOut(
        id=d.id, match_id=d.match_id,
        opened_by_alias=opener.alias if opener else "?",
        reason=d.reason, status=d.status, opened_at=d.created_at,
        resolved_at=d.resolved_at, resolution_notes=d.resolution_notes,
        final_winner_id=d.final_winner_id, final_is_draw=d.final_is_draw,
    )


@router.post("/matches/{match_id}/dispute", response_model=DisputeOut)
@limiter.limit("10/hour")
def open_dispute(request: Request, match_id: int, payload: DisputeOpenIn, current: UserDep, db: DbDep) -> DisputeOut:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    m = db.get(MatchResult, match_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Match no encontrado")
    if current.profile.id not in (m.player_a_id, m.player_b_id or 0):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No sos parte del match")

    existing = db.scalar(select(MatchDispute).where(
        MatchDispute.match_id == match_id, MatchDispute.status == "OPEN",
    ))
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya hay una disputa abierta para este match")

    d = MatchDispute(
        match_id=match_id,
        opened_by_player_id=current.profile.id,
        reason=payload.reason,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return _serialize_dispute(db, d)


class DisputeResolveIn(BaseModel):
    winner_id: int | None = None
    is_draw: bool = False
    games_a: int = Field(ge=0, le=10)
    games_b: int = Field(ge=0, le=10)
    resolution_notes: str = Field(min_length=4, max_length=2000)


@router.post("/disputes/{dispute_id}/resolve", response_model=DisputeOut)
def resolve_dispute(dispute_id: int, payload: DisputeResolveIn, admin: AdminDep, db: DbDep) -> DisputeOut:
    d = db.get(MatchDispute, dispute_id)
    if not d:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Disputa no encontrada")
    if d.status != "OPEN":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Disputa no está OPEN ({d.status})")

    m = db.get(MatchResult, d.match_id)
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Match base no encontrado")

    # Aplicar al match_result (usa el service para revert/apply atómico)
    tour_svc.report_match(
        db, match_id=d.match_id,
        winner_id=payload.winner_id, is_draw=payload.is_draw,
        games_a=payload.games_a, games_b=payload.games_b,
        reported_by_user_id=admin.id,
    )

    d.status = "RESOLVED"
    d.resolved_by_user_id = admin.id
    d.resolved_at = datetime.now(timezone.utc)
    d.resolution_notes = payload.resolution_notes
    d.final_winner_id = payload.winner_id
    d.final_is_draw = payload.is_draw
    d.final_games_a = payload.games_a
    d.final_games_b = payload.games_b

    audit.log(
        db, admin_id=admin.id, action="dispute.resolve",
        guild_id=getattr(db.get(Event, m.event_id), "guild_id", None),
        target_kind="match", target_id=m.id,
        payload={"dispute_id": dispute_id, "winner": payload.winner_id, "is_draw": payload.is_draw},
    )
    db.commit()
    db.refresh(d)
    return _serialize_dispute(db, d)


@router.get("/events/{event_id}/disputes", response_model=list[DisputeOut])
def list_event_disputes(event_id: int, admin: AdminDep, db: DbDep) -> list[DisputeOut]:
    rows = list(db.scalars(
        select(MatchDispute)
        .join(MatchResult, MatchResult.id == MatchDispute.match_id)
        .where(MatchResult.event_id == event_id)
        .order_by(desc(MatchDispute.created_at))
    ))
    return [_serialize_dispute(db, d) for d in rows]


# ═══════════════════════════════════════════════════════════════════════
#  ROUND TIMER
# ═══════════════════════════════════════════════════════════════════════


class TimerStartIn(BaseModel):
    duration_minutes: int = Field(default=50, ge=5, le=180)


class TimerOut(BaseModel):
    id: int
    event_id: int
    round_number: int
    duration_minutes: int
    extended_minutes: int
    status: str
    started_at: datetime | None
    ends_at: datetime | None
    paused_at: datetime | None
    seconds_remaining: int | None


def _serialize_timer(t: RoundTimer) -> TimerOut:
    secs_rem = None
    if t.status == "PAUSED":
        secs_rem = t.paused_remaining_seconds
    elif t.status == "RUNNING" and t.ends_at:
        secs_rem = max(0, int((t.ends_at - datetime.now(timezone.utc)).total_seconds()))
    return TimerOut(
        id=t.id, event_id=t.event_id, round_number=t.round_number,
        duration_minutes=t.duration_minutes,
        extended_minutes=t.extended_minutes,
        status=t.status,
        started_at=t.started_at, ends_at=t.ends_at, paused_at=t.paused_at,
        seconds_remaining=secs_rem,
    )


@router.post("/events/{event_id}/rounds/{round_number}/timer/start", response_model=TimerOut)
def start_timer(event_id: int, round_number: int, payload: TimerStartIn, admin: AdminDep, db: DbDep) -> TimerOut:
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")

    t = db.scalar(select(RoundTimer).where(
        RoundTimer.event_id == event_id, RoundTimer.round_number == round_number,
    ))
    now = datetime.now(timezone.utc)
    if not t:
        t = RoundTimer(
            event_id=event_id, round_number=round_number,
            duration_minutes=payload.duration_minutes,
        )
        db.add(t)
        db.flush()
    if t.status in ("RUNNING", "EXTENDED"):
        raise HTTPException(status.HTTP_409_CONFLICT, "Timer ya está corriendo")

    t.duration_minutes = payload.duration_minutes
    t.started_at = now
    t.ends_at = now + timedelta(minutes=payload.duration_minutes)
    t.paused_at = None
    t.paused_remaining_seconds = None
    t.status = "RUNNING"
    audit.log(
        db, admin_id=admin.id, action="round_timer.start",
        guild_id=ev.guild_id, target_kind="event", target_id=event_id,
        payload={"round": round_number, "duration": payload.duration_minutes},
    )
    db.commit()
    db.refresh(t)
    return _serialize_timer(t)


@router.post("/timers/{timer_id}/pause", response_model=TimerOut)
def pause_timer(timer_id: int, admin: AdminDep, db: DbDep) -> TimerOut:
    t = db.get(RoundTimer, timer_id)
    if not t or t.status != "RUNNING":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Timer no está RUNNING")
    now = datetime.now(timezone.utc)
    t.paused_at = now
    t.paused_remaining_seconds = max(0, int((t.ends_at - now).total_seconds())) if t.ends_at else 0
    t.status = "PAUSED"
    db.commit()
    db.refresh(t)
    return _serialize_timer(t)


@router.post("/timers/{timer_id}/resume", response_model=TimerOut)
def resume_timer(timer_id: int, admin: AdminDep, db: DbDep) -> TimerOut:
    t = db.get(RoundTimer, timer_id)
    if not t or t.status != "PAUSED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Timer no está PAUSED")
    now = datetime.now(timezone.utc)
    t.ends_at = now + timedelta(seconds=t.paused_remaining_seconds or 0)
    t.paused_at = None
    t.paused_remaining_seconds = None
    t.status = "RUNNING"
    db.commit()
    db.refresh(t)
    return _serialize_timer(t)


class ExtendIn(BaseModel):
    extra_minutes: int = Field(ge=1, le=60)


@router.post("/timers/{timer_id}/extend", response_model=TimerOut)
def extend_timer(timer_id: int, payload: ExtendIn, admin: AdminDep, db: DbDep) -> TimerOut:
    t = db.get(RoundTimer, timer_id)
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Timer no encontrado")
    if t.status not in ("RUNNING", "PAUSED", "EXTENDED"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Timer no extendible")
    if t.status == "RUNNING" and t.ends_at:
        t.ends_at = t.ends_at + timedelta(minutes=payload.extra_minutes)
    elif t.status == "PAUSED":
        t.paused_remaining_seconds = (t.paused_remaining_seconds or 0) + payload.extra_minutes * 60
    t.extended_minutes += payload.extra_minutes
    t.status = "EXTENDED"
    db.commit()
    db.refresh(t)
    return _serialize_timer(t)


@router.post("/timers/{timer_id}/finish", response_model=TimerOut)
def finish_timer(timer_id: int, admin: AdminDep, db: DbDep) -> TimerOut:
    t = db.get(RoundTimer, timer_id)
    if not t:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Timer no encontrado")
    t.status = "FINISHED"
    db.commit()
    db.refresh(t)
    return _serialize_timer(t)


@router.get("/events/{event_id}/timers", response_model=list[TimerOut])
def list_timers(event_id: int, db: DbDep) -> list[TimerOut]:
    rows = list(db.scalars(
        select(RoundTimer).where(RoundTimer.event_id == event_id)
        .order_by(RoundTimer.round_number)
    ))
    return [_serialize_timer(t) for t in rows]


# ═══════════════════════════════════════════════════════════════════════
#  RATING SNAPSHOTS
# ═══════════════════════════════════════════════════════════════════════


@router.post("/events/{event_id}/snapshot-ratings")
def snapshot_ratings(event_id: int, admin: AdminDep, db: DbDep) -> dict:
    """Captura el rating Glicko pre-evento de cada jugador inscrito. Idempotente —
    si ya existe snapshot para un (event, player, game), se omite."""
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    if not ev.game_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Evento sin juego asociado")

    regs = list(db.scalars(select(EventRegistration).where(EventRegistration.event_id == event_id)))
    created = skipped = no_rating = 0
    now = datetime.now(timezone.utc)
    for r in regs:
        rating = db.scalar(select(PlayerRating).where(
            PlayerRating.player_id == r.player_id,
            PlayerRating.game_id == ev.game_id,
        ))
        if not rating:
            no_rating += 1
            continue
        try:
            db.add(EventRatingSnapshot(
                event_id=event_id, player_id=r.player_id, game_id=ev.game_id,
                pre_rating=rating.rating, pre_rd=rating.rd,
                pre_volatility=rating.volatility,
                pre_matches_played=rating.matches_played,
                snapshotted_at=now,
            ))
            db.flush()
            created += 1
        except IntegrityError:
            db.rollback()
            skipped += 1
    db.commit()
    return {"event_id": event_id, "snapshots_created": created, "already_existed": skipped, "without_rating": no_rating}


@router.post("/events/{event_id}/finalize-rating-snapshots")
def finalize_snapshots(event_id: int, admin: AdminDep, db: DbDep) -> dict:
    """Después de aplicar Glicko a todos los matches, guarda el rating post-evento.
    Computa el delta y lo expone en /events/{id}/health."""
    ev = db.get(Event, event_id)
    if not ev or not ev.game_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Evento inválido o sin juego")

    snaps = list(db.scalars(select(EventRatingSnapshot).where(
        EventRatingSnapshot.event_id == event_id,
        EventRatingSnapshot.post_rating.is_(None),
    )))
    now = datetime.now(timezone.utc)
    updated = 0
    for s in snaps:
        rating = db.scalar(select(PlayerRating).where(
            PlayerRating.player_id == s.player_id, PlayerRating.game_id == s.game_id,
        ))
        if not rating:
            continue
        s.post_rating = rating.rating
        s.post_rd = rating.rd
        s.post_volatility = rating.volatility
        s.post_matches_played = rating.matches_played
        s.finalized_at = now
        updated += 1
    db.commit()
    return {"event_id": event_id, "snapshots_finalized": updated}


class RatingDeltaOut(BaseModel):
    player_id: int
    player_alias: str
    pre_rating: float
    post_rating: float | None
    delta: float | None
    matches_in_event: int | None


@router.get("/events/{event_id}/rating-deltas", response_model=list[RatingDeltaOut])
def rating_deltas(event_id: int, db: DbDep) -> list[RatingDeltaOut]:
    """Lista de deltas de rating Glicko por jugador en este evento."""
    rows = list(db.execute(
        select(EventRatingSnapshot, PlayerProfile)
        .join(PlayerProfile, PlayerProfile.id == EventRatingSnapshot.player_id)
        .where(EventRatingSnapshot.event_id == event_id)
    ).all())
    out: list[RatingDeltaOut] = []
    for s, p in rows:
        delta = None
        matches_in = None
        if s.post_rating is not None:
            delta = round(s.post_rating - s.pre_rating, 1)
            if s.post_matches_played is not None:
                matches_in = s.post_matches_played - s.pre_matches_played
        out.append(RatingDeltaOut(
            player_id=p.id, player_alias=p.alias,
            pre_rating=round(s.pre_rating, 1),
            post_rating=round(s.post_rating, 1) if s.post_rating else None,
            delta=delta,
            matches_in_event=matches_in,
        ))
    out.sort(key=lambda x: -(x.delta or 0))
    return out


# ═══════════════════════════════════════════════════════════════════════
#  PENALTIES
# ═══════════════════════════════════════════════════════════════════════


class PenaltyIn(BaseModel):
    player_id: int
    match_id: int | None = None
    kind: str = Field(pattern="^(warning|game_loss|match_loss|disqualification)$")
    severity: str = Field(default="warning", pattern="^(warning|minor|major|dq)$")
    reason: str = Field(min_length=4, max_length=280)


class PenaltyOut(BaseModel):
    id: int
    player_id: int
    player_alias: str
    match_id: int | None
    kind: str
    severity: str
    reason: str
    applied_at: datetime
    rescinded_at: datetime | None = None
    rescinded_reason: str | None = None


def _serialize_penalty(db, p: EventPenalty) -> PenaltyOut:
    player = db.get(PlayerProfile, p.player_id)
    return PenaltyOut(
        id=p.id, player_id=p.player_id,
        player_alias=player.alias if player else "?",
        match_id=p.match_id, kind=p.kind, severity=p.severity,
        reason=p.reason, applied_at=p.created_at,
        rescinded_at=p.rescinded_at, rescinded_reason=p.rescinded_reason,
    )


@router.post("/events/{event_id}/penalties", response_model=PenaltyOut)
def apply_penalty(event_id: int, payload: PenaltyIn, admin: AdminDep, db: DbDep) -> PenaltyOut:
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    p = EventPenalty(
        event_id=event_id, player_id=payload.player_id,
        match_id=payload.match_id, kind=payload.kind,
        severity=payload.severity, reason=payload.reason,
        applied_by_user_id=admin.id,
    )
    db.add(p)
    db.flush()

    # Si kind=match_loss, aplicar al match correspondiente
    if payload.kind == "match_loss" and payload.match_id:
        m = db.get(MatchResult, payload.match_id)
        if m and m.event_id == event_id:
            other = m.player_a_id if m.player_a_id != payload.player_id else m.player_b_id
            if other:
                tour_svc.report_match(
                    db, match_id=payload.match_id,
                    winner_id=other, is_draw=False,
                    games_a=0 if payload.player_id == m.player_a_id else 2,
                    games_b=2 if payload.player_id == m.player_a_id else 0,
                    reported_by_user_id=admin.id,
                )

    audit.log(
        db, admin_id=admin.id, action="event.penalty",
        guild_id=ev.guild_id, target_kind="player", target_id=payload.player_id,
        payload={"kind": payload.kind, "severity": payload.severity, "reason": payload.reason[:80]},
    )
    db.commit()
    db.refresh(p)
    return _serialize_penalty(db, p)


@router.post("/penalties/{penalty_id}/rescind")
def rescind_penalty(penalty_id: int, reason: str, admin: AdminDep, db: DbDep) -> dict:
    p = db.get(EventPenalty, penalty_id)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Penalty no encontrada")
    if p.rescinded_at:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Penalty ya estaba rescindida")
    p.rescinded_at = datetime.now(timezone.utc)
    p.rescinded_reason = reason[:280]
    db.commit()
    return {"penalty_id": penalty_id, "rescinded": True}


@router.get("/events/{event_id}/penalties", response_model=list[PenaltyOut])
def list_penalties(event_id: int, db: DbDep) -> list[PenaltyOut]:
    rows = list(db.scalars(
        select(EventPenalty).where(EventPenalty.event_id == event_id)
        .order_by(desc(EventPenalty.created_at))
    ))
    return [_serialize_penalty(db, p) for p in rows]
