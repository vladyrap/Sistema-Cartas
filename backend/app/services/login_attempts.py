"""Account lockout anti brute-force.

Política:
  - Si en los últimos LOCKOUT_WINDOW_MIN minutos hubo >= LOCKOUT_THRESHOLD
    fallos para un email, la cuenta queda bloqueada por LOCKOUT_DURATION_MIN.
  - Cada login exitoso resetea el contador para ese email.

Notas:
  - Bloqueo por email (no por IP) protege de brute force distribuido.
  - Para el login normal, slowapi limita por IP también (10/min).
"""
from datetime import datetime, timedelta, timezone

from sqlalchemy import delete, func, select
from sqlalchemy.orm import Session

from app.models import LoginAttempt

LOCKOUT_THRESHOLD = 5      # nº de fallos
LOCKOUT_WINDOW_MIN = 15    # ventana donde se cuentan
LOCKOUT_DURATION_MIN = 30  # cuánto dura el bloqueo


def is_locked(db: Session, email: str) -> tuple[bool, int]:
    """Devuelve (bloqueado?, minutos_restantes). minutos=0 si no bloqueado."""
    if not email:
        return False, 0
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=LOCKOUT_WINDOW_MIN)
    fails = list(db.scalars(
        select(LoginAttempt)
        .where(
            LoginAttempt.email == email.lower(),
            LoginAttempt.success.is_(False),
            LoginAttempt.attempted_at >= cutoff,
        )
        .order_by(LoginAttempt.attempted_at.desc())
    ))
    if len(fails) < LOCKOUT_THRESHOLD:
        return False, 0
    # El bloqueo dura desde el último fallo
    last_fail = fails[0].attempted_at
    if not last_fail:
        return False, 0
    if last_fail.tzinfo is None:
        last_fail = last_fail.replace(tzinfo=timezone.utc)
    unlock_at = last_fail + timedelta(minutes=LOCKOUT_DURATION_MIN)
    now = datetime.now(timezone.utc)
    if unlock_at <= now:
        return False, 0
    remaining = int((unlock_at - now).total_seconds() // 60) + 1
    return True, remaining


def record_attempt(
    db: Session,
    *,
    email: str,
    success: bool,
    user_id: int | None = None,
    ip: str | None = None,
) -> None:
    """Registra el intento. Si fue success, limpia los fallos previos del email."""
    now = datetime.now(timezone.utc)
    if success:
        # Limpiar fallos para no bloquear más adelante
        db.execute(
            delete(LoginAttempt).where(
                LoginAttempt.email == email.lower(),
                LoginAttempt.success.is_(False),
            )
        )
    db.add(LoginAttempt(
        email=email.lower(),
        user_id=user_id,
        ip=(ip or "")[:64] or None,
        success=success,
        attempted_at=now,
    ))


def purge_old(db: Session, days: int = 30) -> int:
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    result = db.execute(delete(LoginAttempt).where(LoginAttempt.attempted_at < cutoff))
    return result.rowcount or 0
