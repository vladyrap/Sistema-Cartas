"""Helper para crear notificaciones in-app."""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Notification


def notify(
    db: Session,
    *,
    player_id: int,
    type: str,
    title: str,
    body: str | None = None,
    link: str | None = None,
    guild_id: int | None = None,
) -> Notification:
    n = Notification(
        player_id=player_id, guild_id=guild_id, type=type, title=title,
        body=body, link=link, is_read=False,
    )
    db.add(n)
    db.flush()
    return n


def unread_count(db: Session, *, player_id: int) -> int:
    return db.query(Notification).filter_by(player_id=player_id, is_read=False).count()


def mark_read(db: Session, *, notification_id: int, player_id: int) -> Notification | None:
    n = db.get(Notification, notification_id)
    if not n or n.player_id != player_id:
        return None
    if not n.is_read:
        n.is_read = True
        n.read_at = datetime.now(timezone.utc)
    return n


def mark_all_read(db: Session, *, player_id: int) -> int:
    now = datetime.now(timezone.utc)
    count = 0
    for n in db.scalars(
        select(Notification).where(
            Notification.player_id == player_id, Notification.is_read.is_(False)
        )
    ):
        n.is_read = True
        n.read_at = now
        count += 1
    return count
