"""Tokens de un solo uso para verificación de email y reset de password.

Diseño:
- `token` es un secreto opaco (token_urlsafe(32)). Solo el dueño del email lo
  recibe en el link enviado por correo.
- Hash del token en BD (no plaintext) — defensa en profundidad.
- `expires_at` corto (24h verify, 1h reset).
- Single-use: marcamos `used_at` al consumirlo.
"""
from __future__ import annotations

import enum
from datetime import datetime, timedelta, timezone

from sqlalchemy import DateTime, Enum, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class AuthTokenKind(str, enum.Enum):
    EMAIL_VERIFY = "EMAIL_VERIFY"
    PASSWORD_RESET = "PASSWORD_RESET"


def default_expiry(kind: AuthTokenKind) -> datetime:
    now = datetime.now(timezone.utc)
    if kind == AuthTokenKind.PASSWORD_RESET:
        return now + timedelta(hours=1)
    return now + timedelta(hours=24)


class AuthToken(Base, TimestampMixin):
    __tablename__ = "auth_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    kind: Mapped[AuthTokenKind] = mapped_column(
        Enum(AuthTokenKind, name="auth_token_kind"), nullable=False, index=True
    )
    # SHA-256 hex del token claro. Nunca guardamos el token plano.
    token_hash: Mapped[str] = mapped_column(String(64), nullable=False, unique=True, index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
