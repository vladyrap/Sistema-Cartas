"""Endpoints de Gremios — públicos (browse, join) y SUPER_ADMIN (crear/editar)."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.core.deps import DbDep, UserDep
from app.models import (
    AdminActionLog,
    Guild,
    GuildJoinRequest,
    GuildMembership,
    GuildRole,
    GuildStatus,
    JoinRequestStatus,
    PlayerProfile,
    User,
    UserRole,
)
from app.services import audit
from app.services import notifications as notif_svc
from app.schemas.common import (
    ActivityEntry,
    GuildCreate,
    GuildMemberOut,
    GuildMembershipOut,
    GuildOut,
    GuildSettingsUpdate,
    GuildUpdate,
    JoinRequestCreate,
    JoinRequestDecision,
    JoinRequestOut,
    JoinRequestWithUser,
    MemberRoleUpdate,
    MyGuildEntry,
)

router = APIRouter()
super_router = APIRouter()


def _serialize_guild(g: Guild, member_count: int = 0) -> GuildOut:
    return GuildOut(
        id=g.id, code=g.code, name=g.name, tagline=g.tagline, description=g.description,
        logo_url=g.logo_url, banner_url=g.banner_url, accent_color=g.accent_color,
        owner_user_id=g.owner_user_id, status=g.status, is_public=g.is_public,
        member_count=member_count,
    )


def _notify_guild_admins(db, guild: Guild, *, title: str, body: str, link: str):
    """Manda notificación a todos los GUILD_ADMIN activos del Gremio."""
    rows = db.execute(
        select(PlayerProfile)
        .join(GuildMembership, GuildMembership.user_id == PlayerProfile.user_id)
        .where(
            GuildMembership.guild_id == guild.id,
            GuildMembership.role == GuildRole.GUILD_ADMIN,
            GuildMembership.is_active.is_(True),
        )
    ).scalars().all()
    for p in rows:
        notif_svc.notify(
            db, player_id=p.id, guild_id=guild.id, type="guild_join_request",
            title=title, body=body, link=link,
        )


def _notify_user_by_id(
    db, user_id: int, *, type_: str, title: str, body: str, link: str,
    guild_id: int | None = None,
):
    """Notifica al usuario vía su PlayerProfile si tiene uno."""
    p = db.scalar(select(PlayerProfile).where(PlayerProfile.user_id == user_id))
    if p:
        notif_svc.notify(
            db, player_id=p.id, guild_id=guild_id, type=type_,
            title=title, body=body, link=link,
        )


def _member_counts(db, guild_ids: list[int]) -> dict[int, int]:
    if not guild_ids:
        return {}
    rows = db.execute(
        select(GuildMembership.guild_id, func.count(GuildMembership.id))
        .where(GuildMembership.guild_id.in_(guild_ids), GuildMembership.is_active.is_(True))
        .group_by(GuildMembership.guild_id)
    ).all()
    return {gid: count for gid, count in rows}


# ============================== Browse público ==============================


@router.get("", response_model=list[GuildOut])
def list_public_guilds(db: DbDep) -> list[GuildOut]:
    """Lista Gremios públicos activos."""
    rows = list(db.scalars(
        select(Guild)
        .where(Guild.is_public.is_(True), Guild.status == GuildStatus.ACTIVE)
        .order_by(Guild.name)
    ))
    counts = _member_counts(db, [g.id for g in rows])
    return [_serialize_guild(g, counts.get(g.id, 0)) for g in rows]


@router.get("/me", response_model=list[MyGuildEntry])
def my_guilds(db: DbDep, current: UserDep) -> list[MyGuildEntry]:
    """Gremios a los que pertenece el usuario autenticado."""
    rows = db.execute(
        select(GuildMembership, Guild)
        .join(Guild, GuildMembership.guild_id == Guild.id)
        .where(
            GuildMembership.user_id == current.id,
            GuildMembership.is_active.is_(True),
        )
        .order_by(Guild.name)
    ).all()
    counts = _member_counts(db, [g.id for _, g in rows])
    return [
        MyGuildEntry(
            guild=_serialize_guild(g, counts.get(g.id, 0)),
            role=m.role,
            joined_at=m.joined_at,
        )
        for m, g in rows
    ]


@router.get("/{guild_code}", response_model=GuildOut)
def get_guild_by_code(guild_code: str, db: DbDep) -> GuildOut:
    g = db.scalar(select(Guild).where(Guild.code == guild_code))
    if not g:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gremio no encontrado")
    if not g.is_public and g.status != GuildStatus.ACTIVE:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gremio no disponible")
    count = _member_counts(db, [g.id]).get(g.id, 0)
    return _serialize_guild(g, count)


@router.post("/{guild_id}/join", response_model=JoinRequestOut, status_code=201)
def request_to_join(
    guild_id: int, payload: JoinRequestCreate | None = None, *,
    db: DbDep, current: UserDep,
) -> GuildJoinRequest:
    """Crea una solicitud PENDING para unirse al Gremio.

    El GUILD_ADMIN debe aprobar/rechazar. No otorga membership inmediata.
    Si ya hay membership activa o request pendiente, devuelve 409.
    """
    g = db.get(Guild, guild_id)
    if not g or g.status != GuildStatus.ACTIVE or not g.is_public:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Gremio no disponible para unirse")

    # ¿Ya es miembro activo?
    membership = db.scalar(
        select(GuildMembership).where(
            GuildMembership.user_id == current.id,
            GuildMembership.guild_id == guild_id,
            GuildMembership.is_active.is_(True),
        )
    )
    if membership:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya eres miembro de este Gremio")

    # ¿Ya hay una solicitud pendiente?
    pending = db.scalar(
        select(GuildJoinRequest).where(
            GuildJoinRequest.user_id == current.id,
            GuildJoinRequest.guild_id == guild_id,
            GuildJoinRequest.status == JoinRequestStatus.PENDING,
        )
    )
    if pending:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya tienes una solicitud pendiente")

    req = GuildJoinRequest(
        user_id=current.id,
        guild_id=guild_id,
        status=JoinRequestStatus.PENDING,
        message=(payload.message if payload else None),
    )
    db.add(req)
    db.flush()

    # Notificar a los Maestros del Gremio
    requester_label = (current.profile.alias if current.profile else current.email)
    _notify_guild_admins(
        db, g,
        title="Nueva solicitud de ingreso",
        body=f"{requester_label} quiere unirse a {g.name}",
        link="/admin/join-requests",
    )
    db.commit()
    db.refresh(req)
    return req


@router.get("/me/requests", response_model=list[JoinRequestOut])
def my_join_requests(db: DbDep, current: UserDep) -> list[GuildJoinRequest]:
    """Mis solicitudes (cualquier estado, ordenadas más recientes primero)."""
    return list(db.scalars(
        select(GuildJoinRequest)
        .where(GuildJoinRequest.user_id == current.id)
        .order_by(GuildJoinRequest.id.desc())
    ))


@router.delete("/join-requests/{request_id}", status_code=204)
def cancel_my_request(request_id: int, db: DbDep, current: UserDep):
    """Cancelo mi propia solicitud (solo si está PENDING)."""
    req = db.get(GuildJoinRequest, request_id)
    if not req or req.user_id != current.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Solicitud no encontrada")
    if req.status != JoinRequestStatus.PENDING:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La solicitud ya fue resuelta")
    req.status = JoinRequestStatus.CANCELLED
    req.decided_at = datetime.now(timezone.utc)
    db.commit()
    return None


def _require_guild_admin(db, current: User, guild_id: int) -> Guild:
    g = db.get(Guild, guild_id)
    if not g:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gremio no encontrado")
    if current.role == UserRole.SUPER_ADMIN:
        return g
    m = db.scalar(
        select(GuildMembership).where(
            GuildMembership.user_id == current.id,
            GuildMembership.guild_id == guild_id,
            GuildMembership.is_active.is_(True),
        )
    )
    if not m or m.role != GuildRole.GUILD_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Solo el Maestro del Gremio puede hacer esto")
    return g


@router.get("/{guild_id}/join-requests/count", response_model=dict)
def count_pending_requests(guild_id: int, db: DbDep, current: UserDep) -> dict:
    """Cuenta de solicitudes PENDING — para badges del admin."""
    _require_guild_admin(db, current, guild_id)
    n = db.scalar(
        select(func.count(GuildJoinRequest.id)).where(
            GuildJoinRequest.guild_id == guild_id,
            GuildJoinRequest.status == JoinRequestStatus.PENDING,
        )
    ) or 0
    return {"pending": n}


@router.get("/{guild_id}/join-requests", response_model=list[JoinRequestWithUser])
def list_pending_requests(guild_id: int, db: DbDep, current: UserDep) -> list[JoinRequestWithUser]:
    """Cola del GUILD_ADMIN: solicitudes pendientes del Gremio."""
    _require_guild_admin(db, current, guild_id)
    rows = db.execute(
        select(GuildJoinRequest, User, PlayerProfile)
        .join(User, GuildJoinRequest.user_id == User.id)
        .outerjoin(PlayerProfile, PlayerProfile.user_id == User.id)
        .where(
            GuildJoinRequest.guild_id == guild_id,
            GuildJoinRequest.status == JoinRequestStatus.PENDING,
        )
        .order_by(GuildJoinRequest.id.desc())
    ).all()
    return [
        JoinRequestWithUser(
            request=JoinRequestOut.model_validate(req),
            user_alias=(p.alias if p else None),
            user_email=u.email,
            user_elite_id=(p.elite_id_code if p else None),
        )
        for req, u, p in rows
    ]


@router.post("/join-requests/{request_id}/approve", response_model=GuildMembershipOut)
def approve_request(
    request_id: int, payload: JoinRequestDecision | None = None, *,
    db: DbDep, current: UserDep,
) -> GuildMembership:
    req = db.get(GuildJoinRequest, request_id)
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Solicitud no encontrada")
    _require_guild_admin(db, current, req.guild_id)
    if req.status != JoinRequestStatus.PENDING:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La solicitud ya fue resuelta")

    # ¿Membership previa inactiva? Reactivar. Si no, crear nueva.
    existing = db.scalar(
        select(GuildMembership).where(
            GuildMembership.user_id == req.user_id,
            GuildMembership.guild_id == req.guild_id,
        )
    )
    now = datetime.now(timezone.utc)
    if existing:
        existing.is_active = True
        existing.role = GuildRole.MEMBER if existing.role != GuildRole.GUILD_ADMIN else existing.role
        existing.joined_at = now
        m = existing
    else:
        m = GuildMembership(
            user_id=req.user_id, guild_id=req.guild_id,
            role=GuildRole.MEMBER, is_active=True, joined_at=now,
        )
        db.add(m)

    req.status = JoinRequestStatus.APPROVED
    req.decided_by_user_id = current.id
    req.decided_at = now
    req.decision_note = payload.note if payload else None

    guild = db.get(Guild, req.guild_id)
    audit.log(db, admin_id=current.id, action="join_request.approved", guild_id=req.guild_id,
              target_kind="user", target_id=req.user_id, payload={"request_id": req.id})
    _notify_user_by_id(
        db, req.user_id, guild_id=req.guild_id,
        type_="guild_join_approved",
        title="✓ Bienvenid@ al Gremio",
        body=f"Tu solicitud para unirte a {guild.name if guild else 'el Gremio'} fue aprobada",
        link=f"/guilds/{guild.code}" if guild else "/guilds",
    )
    db.commit()
    db.refresh(m)
    return m


@router.post("/join-requests/{request_id}/reject", response_model=JoinRequestOut)
def reject_request(
    request_id: int, payload: JoinRequestDecision | None = None, *,
    db: DbDep, current: UserDep,
) -> GuildJoinRequest:
    req = db.get(GuildJoinRequest, request_id)
    if not req:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Solicitud no encontrada")
    _require_guild_admin(db, current, req.guild_id)
    if req.status != JoinRequestStatus.PENDING:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "La solicitud ya fue resuelta")
    req.status = JoinRequestStatus.REJECTED
    req.decided_by_user_id = current.id
    req.decided_at = datetime.now(timezone.utc)
    req.decision_note = payload.note if payload else None

    guild = db.get(Guild, req.guild_id)
    audit.log(db, admin_id=current.id, action="join_request.rejected", guild_id=req.guild_id,
              target_kind="user", target_id=req.user_id,
              payload={"request_id": req.id, "note": req.decision_note})
    _notify_user_by_id(
        db, req.user_id, guild_id=req.guild_id,
        type_="guild_join_rejected",
        title="Solicitud no aprobada",
        body=(
            f"Tu solicitud para {guild.name if guild else 'el Gremio'} no fue aprobada"
            + (f": {req.decision_note}" if req.decision_note else "")
        ),
        link="/guilds",
    )
    db.commit()
    db.refresh(req)
    return req


@router.post("/{guild_id}/leave", status_code=204)
def leave_guild(guild_id: int, db: DbDep, current: UserDep):
    m = db.scalar(
        select(GuildMembership).where(
            GuildMembership.user_id == current.id, GuildMembership.guild_id == guild_id
        )
    )
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No eres miembro de este Gremio")
    if m.role == GuildRole.GUILD_ADMIN:
        # El último Maestro no puede salir — debe transferir primero.
        remaining = _count_active_admins(db, guild_id, exclude_user_id=current.id)
        if remaining == 0:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Eres el único Maestro — promueve a otro miembro a GUILD_ADMIN primero",
            )
    m.is_active = False
    db.commit()
    return None


# ============================== GUILD_ADMIN: members ==============================


@router.get("/{guild_id}/members", response_model=list[GuildMemberOut])
def list_guild_members(guild_id: int, db: DbDep, current: UserDep) -> list[GuildMemberOut]:
    """Lista de miembros activos. Visible para el GUILD_ADMIN."""
    _require_guild_admin(db, current, guild_id)
    rows = db.execute(
        select(GuildMembership, User, PlayerProfile)
        .join(User, GuildMembership.user_id == User.id)
        .outerjoin(PlayerProfile, PlayerProfile.user_id == User.id)
        .where(
            GuildMembership.guild_id == guild_id,
            GuildMembership.is_active.is_(True),
        )
        .order_by(GuildMembership.role.desc(), GuildMembership.joined_at.asc())
    ).all()
    return [
        GuildMemberOut(
            user_id=u.id, role=m.role, is_active=m.is_active, joined_at=m.joined_at,
            alias=(p.alias if p else None),
            full_name=(p.full_name if p else None),
            elite_id_code=(p.elite_id_code if p else None),
            email=u.email,
        )
        for m, u, p in rows
    ]


def _count_active_admins(db, guild_id: int, *, exclude_user_id: int | None = None) -> int:
    stmt = select(func.count(GuildMembership.id)).where(
        GuildMembership.guild_id == guild_id,
        GuildMembership.role == GuildRole.GUILD_ADMIN,
        GuildMembership.is_active.is_(True),
    )
    if exclude_user_id is not None:
        stmt = stmt.where(GuildMembership.user_id != exclude_user_id)
    return db.scalar(stmt) or 0


@router.patch("/{guild_id}/members/{user_id}/role", response_model=GuildMembershipOut)
def update_member_role(
    guild_id: int, user_id: int, payload: MemberRoleUpdate, *,
    db: DbDep, current: UserDep,
) -> GuildMembership:
    """Cambia el rol de un miembro. El último GUILD_ADMIN no puede ser degradado."""
    _require_guild_admin(db, current, guild_id)
    m = db.scalar(
        select(GuildMembership).where(
            GuildMembership.user_id == user_id,
            GuildMembership.guild_id == guild_id,
            GuildMembership.is_active.is_(True),
        )
    )
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Miembro no encontrado")

    # Si está bajando de GUILD_ADMIN a otro rol, validar que quede al menos uno.
    if m.role == GuildRole.GUILD_ADMIN and payload.role != GuildRole.GUILD_ADMIN:
        remaining = _count_active_admins(db, guild_id, exclude_user_id=user_id)
        if remaining == 0:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "No puedes dejar al Gremio sin Maestro — promueve a otro miembro primero",
            )

    old_role = m.role
    m.role = payload.role
    audit.log(db, admin_id=current.id, action="member.role_changed", guild_id=guild_id,
              target_kind="user", target_id=user_id,
              payload={"from": old_role.value, "to": payload.role.value})
    db.commit()
    db.refresh(m)
    return m


@router.delete("/{guild_id}/members/{user_id}", status_code=204)
def remove_member(guild_id: int, user_id: int, db: DbDep, current: UserDep):
    """Quita un miembro del Gremio (soft-delete)."""
    _require_guild_admin(db, current, guild_id)
    if user_id == current.id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "No puedes quitarte a ti mismo — usa salir del Gremio",
        )
    m = db.scalar(
        select(GuildMembership).where(
            GuildMembership.user_id == user_id,
            GuildMembership.guild_id == guild_id,
            GuildMembership.is_active.is_(True),
        )
    )
    if not m:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Miembro no encontrado")
    if m.role == GuildRole.GUILD_ADMIN:
        remaining = _count_active_admins(db, guild_id, exclude_user_id=user_id)
        if remaining == 0:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "No puedes quitar al último Maestro del Gremio",
            )
    m.is_active = False
    audit.log(db, admin_id=current.id, action="member.removed", guild_id=guild_id,
              target_kind="user", target_id=user_id, payload={"role_was": m.role.value})
    # Notificar al ex-miembro
    _notify_user_by_id(
        db, user_id, guild_id=guild_id,
        type_="guild_member_removed",
        title="Tu membresía fue retirada",
        body="El Maestro del Gremio te ha quitado de la comunidad.",
        link="/guilds",
    )
    db.commit()
    return None


# ============================== GUILD_ADMIN: activity feed ==============================


@router.get("/{guild_id}/activity", response_model=list[ActivityEntry])
def list_guild_activity(
    guild_id: int, db: DbDep, current: UserDep,
    limit: int = 50,
    offset: int = 0,
) -> list[ActivityEntry]:
    """Feed de auditoría del Gremio. Solo GUILD_ADMIN o SUPER_ADMIN.

    Paginación simple via `limit` (1..200) y `offset` (0..). Cliente que quiera
    infinite-scroll incrementa `offset` por `limit` en cada fetch.
    """
    _require_guild_admin(db, current, guild_id)
    limit = max(1, min(limit, 200))
    offset = max(0, offset)
    rows = db.execute(
        select(AdminActionLog, User, PlayerProfile)
        .join(User, AdminActionLog.admin_id == User.id)
        .outerjoin(PlayerProfile, PlayerProfile.user_id == User.id)
        .where(AdminActionLog.guild_id == guild_id)
        .order_by(AdminActionLog.id.desc())
        .limit(limit).offset(offset)
    ).all()
    return [
        ActivityEntry(
            id=log.id, action=log.action,
            admin_id=u.id, admin_alias=(p.alias if p else None),
            admin_email=u.email,
            target_kind=log.target_kind, target_id=log.target_id,
            payload=log.payload, created_at=log.created_at,
        )
        for log, u, p in rows
    ]


# ============================== GUILD_ADMIN: brand settings ==============================


@router.patch("/{guild_id}/settings", response_model=GuildOut)
def update_guild_settings(
    guild_id: int, payload: GuildSettingsUpdate, *,
    db: DbDep, current: UserDep,
) -> GuildOut:
    """El Maestro del Gremio edita su branding (logo, accent, descripción, etc.).

    No puede cambiar el `code` ni el `status` — eso queda para SUPER_ADMIN.
    """
    g = _require_guild_admin(db, current, guild_id)
    changes = payload.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(g, k, v)
    audit.log(db, admin_id=current.id, action="guild.settings_updated", guild_id=guild_id,
              target_kind="guild", target_id=guild_id,
              payload={"fields": list(changes.keys())})
    db.commit()
    db.refresh(g)
    count = _member_counts(db, [g.id]).get(g.id, 0)
    return _serialize_guild(g, count)


# ============================== SUPER_ADMIN ==============================


def _require_super_admin(current: User):
    if current.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acceso solo para SUPER_ADMIN")


@super_router.get("/guilds", response_model=list[GuildOut])
def super_list_all(db: DbDep, current: UserDep) -> list[GuildOut]:
    _require_super_admin(current)
    rows = list(db.scalars(select(Guild).order_by(Guild.name)))
    counts = _member_counts(db, [g.id for g in rows])
    return [_serialize_guild(g, counts.get(g.id, 0)) for g in rows]


@super_router.post("/guilds", response_model=GuildOut, status_code=201)
def super_create_guild(payload: GuildCreate, db: DbDep, current: UserDep) -> GuildOut:
    _require_super_admin(current)
    if db.scalar(select(Guild).where(Guild.code == payload.code)):
        raise HTTPException(status.HTTP_409_CONFLICT, "El código de Gremio ya está en uso")
    data = payload.model_dump()
    seed = data.pop("seed_initial", False)
    g = Guild(**data, status=GuildStatus.ACTIVE)
    db.add(g)
    db.commit()
    db.refresh(g)
    # Si tiene owner, lo agregamos como GUILD_ADMIN
    if g.owner_user_id:
        db.add(GuildMembership(
            user_id=g.owner_user_id, guild_id=g.id, role=GuildRole.GUILD_ADMIN,
            is_active=True, joined_at=datetime.now(timezone.utc),
        ))
        db.commit()
    # Seed inicial opcional
    if seed:
        from app.services import guild_bootstrap
        guild_bootstrap.seed_initial(db, guild_id=g.id)
        audit.log(db, admin_id=current.id, action="guild.bootstrap_seeded",
                  guild_id=g.id, target_kind="guild", target_id=g.id)
        db.commit()
    return _serialize_guild(g, 1 if g.owner_user_id else 0)


@super_router.patch("/guilds/{guild_id}", response_model=GuildOut)
def super_update_guild(guild_id: int, payload: GuildUpdate, db: DbDep, current: UserDep) -> GuildOut:
    _require_super_admin(current)
    g = db.get(Guild, guild_id)
    if not g:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gremio no encontrado")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(g, k, v)
    db.commit()
    db.refresh(g)
    count = _member_counts(db, [g.id]).get(g.id, 0)
    return _serialize_guild(g, count)


@super_router.delete("/guilds/{guild_id}", status_code=204)
def super_archive_guild(guild_id: int, db: DbDep, current: UserDep):
    """Archiva (soft-delete) un Gremio. No borra datos."""
    _require_super_admin(current)
    g = db.get(Guild, guild_id)
    if not g:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gremio no encontrado")
    g.status = GuildStatus.ARCHIVED
    db.commit()
    return None


@super_router.get("/guilds/{guild_id}/members", response_model=list[GuildMembershipOut])
def super_list_members(guild_id: int, db: DbDep, current: UserDep) -> list[GuildMembership]:
    _require_super_admin(current)
    return list(db.scalars(
        select(GuildMembership).where(GuildMembership.guild_id == guild_id)
    ))
