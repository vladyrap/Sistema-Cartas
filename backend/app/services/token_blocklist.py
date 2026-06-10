"""Service para revocar JWT tokens (logout server-side)."""
from datetime import datetime, timezone

from sqlalchemy import delete, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import RevokedToken


def revoke(
    db: Session,
    *,
    jti: str,
    user_id: int | None = None,
    token_exp: datetime | None = None,
    reason: str = "logout",
) -> None:
    """Marca un token como revocado. Idempotente — no falla si ya estaba."""
    if not jti:
        return
    try:
        db.add(RevokedToken(jti=jti, user_id=user_id, token_exp=token_exp, reason=reason))
        db.flush()
    except IntegrityError:
        db.rollback()


def is_revoked(db: Session, jti: str) -> bool:
    if not jti:
        return False
    return db.scalar(select(RevokedToken.id).where(RevokedToken.jti == jti)) is not None


def purge_expired(db: Session) -> int:
    """Borra entries de tokens que ya expiraron de todos modos. Cleanup periódico."""
    now = datetime.now(timezone.utc)
    result = db.execute(delete(RevokedToken).where(RevokedToken.token_exp < now))
    return result.rowcount or 0
