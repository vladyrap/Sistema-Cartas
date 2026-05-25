"""Check-in rápido por QR para eventos del Gremio.

Flujo:
1. Cada jugador tiene un `checkin_token` opaco asociado a su Elite ID.
2. El admin abre /admin/checkin, selecciona un evento del Gremio, y la cámara
   escanea el QR. El frontend manda el token al backend.
3. El backend valida que el jugador existe, está scopeado al Gremio del evento,
   y marca su `EventRegistration` como ATTENDED. Si no estaba inscrito y hay
   slot, lo inscribe + marca attended.
"""
import secrets

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import DbDep, GuildContext, ScopedAdminDep, UserDep, assert_resource_in_user_guild
from app.models import (
    AttendanceStatus, Event, EventRegistration, EventStatus, PlayerProfile,
)
from app.schemas.common import CheckinResolveOut, CheckinResult
from app.services import audit
from app.services import event as event_svc

router = APIRouter()


def _ensure_token(db, player: PlayerProfile) -> str:
    """Garantiza que el jugador tenga un checkin_token. Lo crea si falta."""
    if not player.checkin_token:
        player.checkin_token = secrets.token_urlsafe(32)
        db.flush()
    return player.checkin_token


# ============================== Endpoints del jugador ==============================


@router.get("/me/token")
def get_my_token(db: DbDep, current: UserDep) -> dict:
    """Devuelve mi token de QR. Lo crea si no existe."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil de jugador")
    token = _ensure_token(db, current.profile)
    db.commit()
    return {"token": token, "elite_id": current.profile.elite_id_code}


@router.post("/me/token/regenerate")
def regenerate_my_token(db: DbDep, current: UserDep) -> dict:
    """Regenera el token (caso de filtración)."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil de jugador")
    current.profile.checkin_token = secrets.token_urlsafe(32)
    db.commit()
    return {"token": current.profile.checkin_token, "elite_id": current.profile.elite_id_code}


# ============================== Endpoints del admin ==============================


@router.post("/resolve", response_model=CheckinResolveOut)
def resolve_token(
    payload: dict, db: DbDep, admin: ScopedAdminDep, guild: GuildContext,
) -> CheckinResolveOut:
    """Resuelve un QR token → datos básicos del jugador.

    Se usa para validar antes de hacer el check-in (mostrar foto, alias, etc.).
    """
    token = (payload or {}).get("token", "").strip()
    if not token:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Token requerido")
    player = db.scalar(select(PlayerProfile).where(PlayerProfile.checkin_token == token))
    if not player:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "QR no reconocido")
    return CheckinResolveOut(
        player_id=player.id,
        alias=player.alias,
        elite_id=player.elite_id_code,
        avatar_url=player.avatar_url,
    )


@router.post("/event/{event_id}", response_model=CheckinResult)
def checkin_to_event(
    event_id: int, payload: dict, *,
    db: DbDep, admin: ScopedAdminDep, guild: GuildContext,
) -> CheckinResult:
    """Marca attended para un jugador en un evento.

    Si no estaba inscrito y hay cupos, lo inscribe + marca attended en un solo paso.

    Retorna `action`: 'already_attended' | 'marked' | 'registered_and_marked'.
    """
    token = (payload or {}).get("token", "").strip()
    if not token:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Token requerido")

    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    assert_resource_in_user_guild(
        user=admin,
        resource_guild_id=ev.guild_id,
        x_guild_id=guild.id if guild else None,
    )
    if ev.status not in (EventStatus.OPEN, EventStatus.CLOSED):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"El evento no acepta check-in (estado {ev.status.value})",
        )

    player = db.scalar(select(PlayerProfile).where(PlayerProfile.checkin_token == token))
    if not player:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "QR no reconocido")

    reg = db.scalar(
        select(EventRegistration).where(
            EventRegistration.event_id == event_id,
            EventRegistration.player_id == player.id,
        )
    )

    action = "marked"
    if reg:
        if reg.attendance_status == AttendanceStatus.ATTENDED:
            return CheckinResult(
                action="already_attended",
                player_id=player.id, alias=player.alias,
                registration_id=reg.id,
            )
        # Usamos mark_attendance del service (gatilla streak)
        reg = event_svc.mark_attendance(
            db, registration_id=reg.id, status_value=AttendanceStatus.ATTENDED,
        )
    else:
        # Auto-register si hay cupos
        regs_count = db.scalar(
            select(EventRegistration).where(EventRegistration.event_id == event_id)
        )
        from sqlalchemy import func
        n_registered = db.scalar(
            select(func.count(EventRegistration.id)).where(EventRegistration.event_id == event_id)
        ) or 0
        if n_registered >= ev.slots:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Evento lleno y el jugador no estaba inscrito",
            )
        reg = event_svc.register_player(db, event_id=event_id, player_id=player.id)
        # Trigger streak via mark_attendance (no inline para mantener una sola fuente de verdad)
        reg = event_svc.mark_attendance(
            db, registration_id=reg.id, status_value=AttendanceStatus.ATTENDED,
        )
        action = "registered_and_marked"

    audit.log(
        db, admin_id=admin.id, action="checkin.qr", guild_id=ev.guild_id,
        target_kind="event_registration", target_id=reg.id,
        payload={"event_id": event_id, "player_id": player.id, "method": "qr"},
    )
    db.commit()
    db.refresh(reg)
    return CheckinResult(
        action=action,
        player_id=player.id, alias=player.alias,
        registration_id=reg.id,
    )
