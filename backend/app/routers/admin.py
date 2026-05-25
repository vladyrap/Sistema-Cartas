from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select

from app.core.deps import AdminDep, DbDep, GuildContext, ScopedAdminDep, assert_resource_in_user_guild
from app.models import AdminActionLog, PlayerProfile, Season, SeasonProgress, SeasonStatus
from app.schemas.common import (
    ActivateSeasonResponse,
    CloseSeasonResponse,
    ExpAdjustRequest,
    ExpAdjustResponse,
    PlayerSummary,
    ResetPreviewResponse,
    ResetPreviewRow,
    SeasonCreateRequest,
    SeasonOut,
)
from app.models import AttendanceStatus, Event, EventRegistration, PaymentStatus
from app.schemas.common import (
    AttendancePayload,
    AwardExpResponse,
    EventRegistrationOut,
    EventRegistrationWithPlayer,
    PaymentPayload,
    RecordResultsRequest,
)
from app.services import audit
from app.services import event as event_svc
from app.services import exp as exp_svc
from app.services import season as season_svc

router = APIRouter()


def _log(db, admin_id: int, action: str, guild, target_kind: str | None = None, target_id: int | None = None, payload=None):
    audit.log(
        db, admin_id=admin_id, action=action,
        guild_id=(guild.id if guild else None),
        target_kind=target_kind, target_id=target_id, payload=payload,
    )


# ============================== Seasons ==============================


@router.get("/seasons/{season_id}/reset-preview", response_model=ResetPreviewResponse)
def reset_preview(season_id: int, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> ResetPreviewResponse:
    """Preview: qué jugadores comenzarán como Duelista N10 si se activa esta temporada."""
    target = db.get(Season, season_id)
    if not target or (guild is not None and target.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Temporada no encontrada")
    rows = season_svc.preview_reset(db, target_season_id=season_id)
    out_rows = [ResetPreviewRow(**r) for r in rows]
    promoted = sum(1 for r in out_rows if r.was_promoted_start)
    return ResetPreviewResponse(
        target_season_id=target.id,
        target_season_name=target.name,
        previous_season_id=target.previous_season_id,
        rows=out_rows,
        promoted_count=promoted,
        regular_count=len(out_rows) - promoted,
    )


@router.post("/seasons", response_model=SeasonOut, status_code=201)
def create_season(payload: SeasonCreateRequest, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> Season:
    prev_id = payload.previous_season_id
    if prev_id is None:
        # Auto-detectar la última temporada cerrada como predecesora (scoped al Gremio actual)
        prev_stmt = select(Season).where(Season.status == SeasonStatus.CLOSED).order_by(Season.number.desc())
        if guild is not None:
            prev_stmt = prev_stmt.where(Season.guild_id == guild.id)
        last_closed = db.scalar(prev_stmt)
        if last_closed:
            prev_id = last_closed.id

    season = season_svc.create_season(
        db,
        name=payload.name,
        starts_at=payload.starts_at,
        ends_at=payload.ends_at,
        description=payload.description,
        previous_season_id=prev_id,
        guild_id=guild.id if guild else None,
    )
    _log(db, admin.id, "season.create", guild, "season", season.id, {"name": season.name})
    db.commit()
    db.refresh(season)
    return season


@router.post("/seasons/{season_id}/activate", response_model=ActivateSeasonResponse)
def activate_season(season_id: int, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> ActivateSeasonResponse:
    target = db.get(Season, season_id)
    if not target or (guild is not None and target.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Temporada no encontrada")
    try:
        result = season_svc.activate_season(db, season_id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    _log(db, admin.id, "season.activate", guild, "season", season_id, {"name": target.name})
    db.commit()
    return ActivateSeasonResponse(**result)


@router.post("/seasons/{season_id}/close", response_model=CloseSeasonResponse)
def close_season(season_id: int, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> CloseSeasonResponse:
    target = db.get(Season, season_id)
    if not target or (guild is not None and target.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Temporada no encontrada")
    try:
        report = season_svc.close_season(db, season_id)
    except ValueError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    _log(db, admin.id, "season.close", guild, "season", season_id, {"name": target.name})
    db.commit()
    return CloseSeasonResponse(**report)


@router.get("/seasons/active/promoted-players", response_model=list[PlayerSummary])
def promoted_players_current(db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> list[PlayerProfile]:
    """Lista de jugadores que en la temporada ACTIVA comenzaron como Duelista N10 por mérito."""
    active_stmt = select(Season).where(Season.status == SeasonStatus.ACTIVE)
    if guild is not None:
        active_stmt = active_stmt.where(Season.guild_id == guild.id)
    active = db.scalar(active_stmt)
    if not active:
        return []
    player_ids = list(
        db.scalars(
            select(SeasonProgress.player_id).where(
                SeasonProgress.season_id == active.id,
                SeasonProgress.was_promoted_start.is_(True),
            )
        )
    )
    if not player_ids:
        return []
    return list(db.scalars(select(PlayerProfile).where(PlayerProfile.id.in_(player_ids))))


# ============================== EXP adjust ==============================


@router.post("/exp/adjust", response_model=ExpAdjustResponse)
def adjust_exp(payload: ExpAdjustRequest, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> ExpAdjustResponse:
    try:
        tx = exp_svc.adjust_exp(db, payload.player_id, payload.amount, payload.reason, admin_id=admin.id)
    except (ValueError, RuntimeError) as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

    # Recargar progreso para devolver estado final (active scoped al Gremio actual)
    active_stmt = select(Season).where(Season.status == SeasonStatus.ACTIVE)
    if guild is not None:
        active_stmt = active_stmt.where(Season.guild_id == guild.id)
    active = db.scalar(active_stmt)
    sp = db.scalar(
        select(SeasonProgress).where(
            SeasonProgress.season_id == active.id,
            SeasonProgress.player_id == payload.player_id,
        )
    )
    _log(db, admin.id, "exp.adjust", guild, "player", payload.player_id, {"amount": payload.amount, "reason": payload.reason})
    db.commit()
    return ExpAdjustResponse(
        transaction_id=tx.id,
        new_level=sp.level if sp else 1,
        new_exp_in_level=sp.exp_in_level if sp else 0,
        new_exp_total=sp.exp_total if sp else 0,
    )


# ============================== Players list ==============================


@router.get("/players", response_model=list[PlayerSummary])
def list_players(db: DbDep, admin: AdminDep) -> list[PlayerProfile]:
    return list(db.scalars(select(PlayerProfile).order_by(PlayerProfile.alias)))


# ============================== Events ==============================


@router.get("/events/{event_id}/registrations", response_model=list[EventRegistrationWithPlayer])
def list_event_registrations(event_id: int, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> list[EventRegistrationWithPlayer]:
    ev = db.get(Event, event_id)
    if not ev or (guild is not None and ev.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    # nivel actual de cada jugador
    from app.models import Season, SeasonProgress, SeasonStatus
    active_stmt = select(Season).where(Season.status == SeasonStatus.ACTIVE)
    if guild is not None:
        active_stmt = active_stmt.where(Season.guild_id == guild.id)
    active = db.scalar(active_stmt)
    levels: dict[int, int] = {}
    if active:
        for pid, lv in db.execute(
            select(SeasonProgress.player_id, SeasonProgress.level).where(
                SeasonProgress.season_id == active.id
            )
        ).all():
            levels[pid] = lv
    rows = db.execute(
        select(EventRegistration, PlayerProfile)
        .join(PlayerProfile, EventRegistration.player_id == PlayerProfile.id)
        .where(EventRegistration.event_id == event_id)
        .order_by(EventRegistration.final_position.nulls_last(), EventRegistration.id)
    ).all()
    return [
        EventRegistrationWithPlayer(
            registration=EventRegistrationOut.model_validate(reg),
            player_alias=player.alias,
            player_elite_id=player.elite_id_code,
            player_level=levels.get(player.id),
        )
        for reg, player in rows
    ]


def _assert_reg_in_guild(db, reg_id: int, admin, guild) -> EventRegistration:
    """Carga reg y valida que su evento pertenezca al Gremio actual (no global)."""
    reg = db.get(EventRegistration, reg_id)
    if not reg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Inscripción no encontrada")
    ev = db.get(Event, reg.event_id)
    assert_resource_in_user_guild(
        user=admin,
        resource_guild_id=ev.guild_id if ev else None,
        x_guild_id=guild.id if guild else None,
    )
    return reg


@router.post("/events/registrations/{reg_id}/attendance", response_model=EventRegistrationOut)
def admin_set_attendance(reg_id: int, payload: AttendancePayload, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> EventRegistration:
    _assert_reg_in_guild(db, reg_id, admin, guild)
    try:
        s = AttendanceStatus(payload.attendance_status)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Estado de asistencia inválido")
    reg = event_svc.mark_attendance(db, registration_id=reg_id, status_value=s)
    db.commit()
    db.refresh(reg)
    return reg


@router.post("/events/registrations/{reg_id}/payment", response_model=EventRegistrationOut)
def admin_set_payment(reg_id: int, payload: PaymentPayload, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> EventRegistration:
    _assert_reg_in_guild(db, reg_id, admin, guild)
    try:
        s = PaymentStatus(payload.payment_status)
    except ValueError:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Estado de pago inválido")
    reg = event_svc.mark_payment(db, registration_id=reg_id, status_value=s)
    db.commit()
    db.refresh(reg)
    return reg


@router.post("/events/{event_id}/results", response_model=dict)
def admin_record_results(event_id: int, payload: RecordResultsRequest, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> dict:
    ev = db.get(Event, event_id)
    if not ev or (guild is not None and ev.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    updated = event_svc.record_results(
        db, event_id=event_id, results=[r.model_dump(exclude_unset=True) for r in payload.results]
    )
    _log(db, admin.id, "event.results", guild, "event", event_id, {"updated": updated, "name": ev.name})
    db.commit()
    return {"event_id": event_id, "registrations_updated": updated}


@router.post("/events/{event_id}/award-exp", response_model=AwardExpResponse)
def admin_award_event_exp(event_id: int, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> AwardExpResponse:
    ev = db.get(Event, event_id)
    if not ev or (guild is not None and ev.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    result = event_svc.award_event_exp(db, event_id=event_id, admin_id=admin.id)
    _log(db, admin.id, "event.award_exp", guild, "event", event_id, {**result, "name": ev.name})
    db.commit()
    return AwardExpResponse(**result)
