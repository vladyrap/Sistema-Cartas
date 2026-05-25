"""Auto-grant de medallas acumulativas.

Cada vez que el jugador hace algo "contable" (asistir a evento, ganar EXP, etc.),
se llama `increment_for_trigger(...)`. El service:
1. Busca todas las medallas con `trigger_kind == kind` en el Gremio.
2. Suma `delta` al PlayerAchievementProgress correspondiente (crea si no existe).
3. Si current_value >= progress_target Y el jugador no la tiene aún, llama a
   gm.grant_achievement() y notifica.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Achievement, PlayerAchievement, PlayerAchievementProgress,
)

# Tipos de trigger soportados:
#   events_attended  · +1 por cada ATTENDED nuevo
#   exp_total        · +amount por cada award_exp positivo
#   streak_max       · set al máximo histórico de racha
TRIGGER_KINDS = {"events_attended", "exp_total", "streak_max"}


def increment_for_trigger(
    db: Session, *, player_id: int, guild_id: int, kind: str, delta: int = 1,
) -> list[Achievement]:
    """Suma `delta` al progreso de las medallas con ese trigger_kind.

    Devuelve la lista de medallas recién otorgadas (puede ser vacía).
    """
    if kind not in TRIGGER_KINDS:
        return []

    achievements = list(db.scalars(
        select(Achievement).where(
            Achievement.guild_id == guild_id,
            Achievement.trigger_kind == kind,
            Achievement.progress_target.is_not(None),
        )
    ))
    if not achievements:
        return []

    newly_granted: list[Achievement] = []
    for ach in achievements:
        progress = db.scalar(
            select(PlayerAchievementProgress).where(
                PlayerAchievementProgress.player_id == player_id,
                PlayerAchievementProgress.achievement_id == ach.id,
            )
        )
        if progress is None:
            progress = PlayerAchievementProgress(
                player_id=player_id, achievement_id=ach.id, current_value=0,
            )
            db.add(progress)
            db.flush()

        if kind == "streak_max":
            # Set, no incrementar acumulativo
            if delta > progress.current_value:
                progress.current_value = delta
        else:
            progress.current_value += delta

        if progress.current_value >= ach.progress_target:
            # ¿Ya la tiene? Idempotencia.
            already = db.scalar(
                select(PlayerAchievement).where(
                    PlayerAchievement.player_id == player_id,
                    PlayerAchievement.achievement_id == ach.id,
                )
            )
            if not already:
                pa = PlayerAchievement(
                    player_id=player_id,
                    achievement_id=ach.id,
                    earned_at=datetime.now(timezone.utc),
                )
                db.add(pa)
                newly_granted.append(ach)

                # Notif
                try:
                    from app.services import notifications as notif_svc
                    notif_svc.notify(
                        db, player_id=player_id, guild_id=guild_id,
                        type="achievement_granted",
                        title="🏅 Medalla desbloqueada",
                        body=f"Conseguiste '{ach.name}'.",
                        link="/profile",
                    )
                except Exception:
                    pass

    db.flush()
    return newly_granted
