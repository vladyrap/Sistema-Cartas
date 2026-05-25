"""Notificaciones in-app del jugador autenticado."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query, status
from sqlalchemy import select

from app.core.deps import DbDep, UserDep
from app.models import Notification
from app.schemas.common import NotificationListOut, NotificationOut
from app.services import notifications as notif_svc

router = APIRouter()


@router.get("", response_model=NotificationListOut)
def list_my_notifications(
    db: DbDep,
    current: UserDep,
    only_unread: bool = Query(default=False),
    limit: int = Query(default=20, ge=1, le=100),
    guild_id: int | None = Query(default=None, description="Filtra por Gremio. None=todas, 0=solo globales"),
) -> NotificationListOut:
    if not current.profile:
        return NotificationListOut(notifications=[], unread_count=0)

    stmt = (
        select(Notification)
        .where(Notification.player_id == current.profile.id)
        .order_by(Notification.created_at.desc())
        .limit(limit)
    )
    if only_unread:
        stmt = stmt.where(Notification.is_read.is_(False))
    if guild_id is not None:
        if guild_id == 0:
            stmt = stmt.where(Notification.guild_id.is_(None))
        else:
            stmt = stmt.where(Notification.guild_id == guild_id)

    rows = list(db.scalars(stmt))
    unread = notif_svc.unread_count(db, player_id=current.profile.id)
    return NotificationListOut(
        notifications=[NotificationOut.model_validate(n) for n in rows],
        unread_count=unread,
    )


@router.get("/unread-count", response_model=dict)
def my_unread_count(db: DbDep, current: UserDep) -> dict:
    if not current.profile:
        return {"unread_count": 0}
    return {"unread_count": notif_svc.unread_count(db, player_id=current.profile.id)}


@router.post("/{notification_id}/read", response_model=NotificationOut)
def mark_one_read(notification_id: int, db: DbDep, current: UserDep) -> Notification:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    n = notif_svc.mark_read(db, notification_id=notification_id, player_id=current.profile.id)
    if not n:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notificación no encontrada")
    db.commit()
    db.refresh(n)
    return n


@router.post("/read-all", response_model=dict)
def mark_all_my_read(db: DbDep, current: UserDep) -> dict:
    if not current.profile:
        return {"marked": 0}
    count = notif_svc.mark_all_read(db, player_id=current.profile.id)
    db.commit()
    return {"marked": count}
