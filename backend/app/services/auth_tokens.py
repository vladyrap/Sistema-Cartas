"""Crear, validar y consumir tokens de un solo uso (verify email + reset password)."""
from __future__ import annotations

import hashlib
import secrets
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import AuthToken, AuthTokenKind, User
from app.models.auth_token import default_expiry


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue(db: Session, *, user_id: int, kind: AuthTokenKind) -> str:
    """Crea un token nuevo, persiste el hash y devuelve el token plano.

    Invalida todos los tokens previos del mismo `kind` para ese usuario.
    """
    # Marca como usados los activos del mismo tipo (one-active-at-a-time)
    now = datetime.now(timezone.utc)
    for old in db.scalars(
        select(AuthToken).where(
            AuthToken.user_id == user_id,
            AuthToken.kind == kind,
            AuthToken.used_at.is_(None),
        )
    ):
        old.used_at = now

    plain = secrets.token_urlsafe(48)
    db.add(AuthToken(
        user_id=user_id,
        kind=kind,
        token_hash=_hash(plain),
        expires_at=default_expiry(kind),
    ))
    db.flush()
    return plain


def consume(db: Session, *, token: str, kind: AuthTokenKind) -> User | None:
    """Valida y consume un token. Devuelve el User si OK, None si inválido/expirado/usado."""
    row = db.scalar(
        select(AuthToken).where(
            AuthToken.token_hash == _hash(token),
            AuthToken.kind == kind,
        )
    )
    if not row:
        return None
    now = datetime.now(timezone.utc)
    if row.used_at is not None:
        return None
    # SQLite trae datetimes naive — normalizo a UTC aware
    expires = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=timezone.utc)
    if expires < now:
        return None
    row.used_at = now
    return db.get(User, row.user_id)
