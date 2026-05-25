"""FastAPI dependencies — auth + DB session + guild context."""
from typing import Annotated

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_token
from app.models import Guild, GuildMembership, GuildRole, GuildStatus, User, UserRole

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

DbDep = Annotated[Session, Depends(get_db)]
TokenDep = Annotated[str | None, Depends(oauth2_scheme)]


def get_current_user(token: TokenDep, db: DbDep) -> User:
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "No autenticado")
    try:
        payload = decode_token(token)
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token inválido o expirado")
    if payload.get("type") != "access":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Tipo de token inválido")
    user_id = int(payload["sub"])
    user = db.get(User, user_id)
    if user is None or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario no encontrado o inactivo")
    return user


UserDep = Annotated[User, Depends(get_current_user)]


def require_admin(current: UserDep) -> User:
    if current.role not in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acceso solo para administradores")
    return current


AdminDep = Annotated[User, Depends(require_admin)]


def require_super_admin(current: UserDep) -> User:
    if current.role != UserRole.SUPER_ADMIN:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acceso solo para SUPER_ADMIN")
    return current


SuperAdminDep = Annotated[User, Depends(require_super_admin)]


# ============================== Guild context ==============================


def get_current_guild_optional(
    db: DbDep,
    x_guild_id: int | None = Header(default=None, alias="X-Guild-Id"),
) -> Guild | None:
    """Lee el header X-Guild-Id y devuelve el Guild si existe y está activo.

    No falla si no se manda el header — devuelve None.
    """
    if x_guild_id is None:
        return None
    g = db.get(Guild, x_guild_id)
    if not g or g.status != GuildStatus.ACTIVE:
        return None
    return g


GuildContext = Annotated[Guild | None, Depends(get_current_guild_optional)]


def get_current_guild(
    db: DbDep,
    x_guild_id: int | None = Header(default=None, alias="X-Guild-Id"),
) -> Guild:
    """Versión obligatoria: levanta 400 si no se manda X-Guild-Id."""
    if x_guild_id is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Falta header X-Guild-Id — selecciona un Gremio primero",
        )
    g = db.get(Guild, x_guild_id)
    if not g or g.status != GuildStatus.ACTIVE:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gremio no encontrado o inactivo")
    return g


GuildRequired = Annotated[Guild, Depends(get_current_guild)]


def get_my_role_in_current_guild(
    db: DbDep, current: UserDep, guild: GuildRequired
) -> GuildRole:
    m = db.scalar(
        select(GuildMembership).where(
            GuildMembership.user_id == current.id,
            GuildMembership.guild_id == guild.id,
            GuildMembership.is_active.is_(True),
        )
    )
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No perteneces a este Gremio")
    return m.role


def require_guild_admin(
    db: DbDep, current: UserDep, guild: GuildRequired
) -> Guild:
    """SUPER_ADMIN o GUILD_ADMIN del Gremio actual."""
    if current.role == UserRole.SUPER_ADMIN:
        return guild
    m = db.scalar(
        select(GuildMembership).where(
            GuildMembership.user_id == current.id,
            GuildMembership.guild_id == guild.id,
            GuildMembership.is_active.is_(True),
        )
    )
    if not m or m.role != GuildRole.GUILD_ADMIN:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN,
            "Solo el Maestro del Gremio puede realizar esta acción",
        )
    return guild


GuildAdminDep = Annotated[Guild, Depends(require_guild_admin)]


def require_scoped_admin(
    db: DbDep,
    current: UserDep,
    x_guild_id: int | None = Header(default=None, alias="X-Guild-Id"),
) -> User:
    """Pasa si el user es ADMIN/SUPER_ADMIN global, o GUILD_ADMIN del Gremio del header.

    Para endpoints scopeados al Gremio actual. No exige header si el usuario es
    global admin (cross-guild).
    """
    if current.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        return current
    if x_guild_id is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Falta header X-Guild-Id — selecciona un Gremio",
        )
    g = db.get(Guild, x_guild_id)
    if not g or g.status != GuildStatus.ACTIVE:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Gremio no disponible")
    m = db.scalar(
        select(GuildMembership).where(
            GuildMembership.user_id == current.id,
            GuildMembership.guild_id == g.id,
            GuildMembership.is_active.is_(True),
            GuildMembership.role == GuildRole.GUILD_ADMIN,
        )
    )
    if not m:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Acceso solo para administradores")
    return current


ScopedAdminDep = Annotated[User, Depends(require_scoped_admin)]


def assert_resource_in_user_guild(
    *,
    user: User,
    resource_guild_id: int | None,
    x_guild_id: int | None,
) -> None:
    """Endpoints que cargan un recurso por ID y necesitan validar que pertenece
    al Gremio del usuario (cuando no es global admin)."""
    if user.role in (UserRole.ADMIN, UserRole.SUPER_ADMIN):
        return
    if resource_guild_id is None or x_guild_id is None or resource_guild_id != x_guild_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Recurso fuera del Gremio actual")
