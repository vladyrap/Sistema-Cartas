"""Anuncios pinneados por Gremio."""
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import DbDep, GuildContext, ScopedAdminDep, UserDep
from app.models import Announcement
from app.schemas.common import AnnouncementCreate, AnnouncementOut, AnnouncementUpdate
from app.services import audit

router = APIRouter()


@router.get("", response_model=list[AnnouncementOut])
def list_announcements(db: DbDep, guild: GuildContext) -> list[Announcement]:
    """Anuncios activos (no expirados) del Gremio actual, pinneados primero."""
    if not guild:
        return []
    now = datetime.now(timezone.utc)
    rows = list(db.scalars(
        select(Announcement)
        .where(Announcement.guild_id == guild.id)
        .where((Announcement.expires_at.is_(None)) | (Announcement.expires_at > now))
        .order_by(Announcement.is_pinned.desc(), Announcement.id.desc())
    ))
    return rows


@router.post("", response_model=AnnouncementOut, status_code=201)
def create_announcement(
    payload: AnnouncementCreate, *,
    db: DbDep, admin: ScopedAdminDep, guild: GuildContext,
) -> Announcement:
    if not guild:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Falta X-Guild-Id")
    a = Announcement(
        guild_id=guild.id,
        author_user_id=admin.id,
        title=payload.title,
        body=payload.body,
        is_pinned=payload.is_pinned,
        expires_at=payload.expires_at,
    )
    db.add(a)
    db.flush()
    audit.log(
        db, admin_id=admin.id, action="announcement.create", guild_id=guild.id,
        target_kind="announcement", target_id=a.id, payload={"title": a.title},
    )
    db.commit()
    db.refresh(a)
    return a


@router.patch("/{announcement_id}", response_model=AnnouncementOut)
def update_announcement(
    announcement_id: int, payload: AnnouncementUpdate, *,
    db: DbDep, admin: ScopedAdminDep, guild: GuildContext,
) -> Announcement:
    a = db.get(Announcement, announcement_id)
    if not a or (guild and a.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Anuncio no encontrado")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(a, k, v)
    audit.log(
        db, admin_id=admin.id, action="announcement.update", guild_id=a.guild_id,
        target_kind="announcement", target_id=a.id, payload={"title": a.title},
    )
    db.commit()
    db.refresh(a)
    return a


@router.delete("/{announcement_id}", status_code=204)
def delete_announcement(
    announcement_id: int, *,
    db: DbDep, admin: ScopedAdminDep, guild: GuildContext,
):
    a = db.get(Announcement, announcement_id)
    if not a or (guild and a.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Anuncio no encontrado")
    audit.log(
        db, admin_id=admin.id, action="announcement.delete", guild_id=a.guild_id,
        target_kind="announcement", target_id=a.id, payload={"title": a.title},
    )
    db.delete(a)
    db.commit()
    return None
