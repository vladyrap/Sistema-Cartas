"""Lógica de rachas (streaks) de asistencia.

Reglas:
- Ventana: si el jugador asistió hace ≤ STREAK_WINDOW_DAYS días, la racha continúa.
- Si pasó más, la racha se resetea a 1.
- Si asiste dos veces el MISMO día, no cuenta como dos (idempotente por fecha).
- Multiplicador EXP: la fórmula da +5% por cada racha extra, capada a +50%
  (streak 11+ ya está en x1.50).
"""
from __future__ import annotations

from datetime import date, datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import PlayerStreak

# Ventana de gracia: si pasaron menos de N días desde la última asistencia,
# la racha sigue viva.
STREAK_WINDOW_DAYS = 14

# Multiplicador EXP por racha activa.
EXP_BONUS_PER_LEVEL = 0.05
EXP_BONUS_CAP = 0.50  # +50% máximo


def get(db: Session, *, player_id: int, guild_id: int) -> PlayerStreak | None:
    return db.scalar(
        select(PlayerStreak).where(
            PlayerStreak.player_id == player_id,
            PlayerStreak.guild_id == guild_id,
        )
    )


def get_or_create(db: Session, *, player_id: int, guild_id: int) -> PlayerStreak:
    s = get(db, player_id=player_id, guild_id=guild_id)
    if s is None:
        s = PlayerStreak(player_id=player_id, guild_id=guild_id)
        db.add(s)
        db.flush()
    return s


def register_attendance(
    db: Session, *, player_id: int, guild_id: int, at: datetime | None = None,
) -> tuple[PlayerStreak, bool]:
    """Registra asistencia para calcular la racha. Devuelve (streak, increased).

    `increased=True` si la racha incrementó (no era el mismo día).
    """
    at = at or datetime.now(timezone.utc)
    today = at.date()
    s = get_or_create(db, player_id=player_id, guild_id=guild_id)

    if s.last_attended_date == today:
        # Mismo día, idempotente.
        return s, False

    if s.last_attended_date is None:
        # Primera asistencia.
        s.current_streak = 1
    else:
        days = (today - s.last_attended_date).days
        if days <= STREAK_WINDOW_DAYS:
            s.current_streak += 1
        else:
            s.current_streak = 1  # se rompió la racha

    s.last_attended_at = at
    s.last_attended_date = today
    if s.current_streak > s.longest_streak:
        s.longest_streak = s.current_streak
    db.flush()
    return s, True


def exp_multiplier(streak: int) -> float:
    """Multiplicador EXP basado en la racha actual.

    streak=1 → 1.00x
    streak=2 → 1.05x
    streak=5 → 1.20x
    streak=11+ → 1.50x (cap)
    """
    if streak <= 1:
        return 1.0
    bonus = min((streak - 1) * EXP_BONUS_PER_LEVEL, EXP_BONUS_CAP)
    return round(1.0 + bonus, 4)
