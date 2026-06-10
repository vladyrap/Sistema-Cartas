"""APScheduler de tareas periódicas.

Tareas registradas:
  - cada 5 min: expirar reservas vencidas + tokens auth viejos.
  - cada 1 hora: limpiar cache TTL (forzar refresco de standings/leaderboards).
  - cada 6 horas: snapshot de eventos finalizados (audit).
  - diario 03:00: cerrar eventos cuya fecha de fin pasó pero quedaron OPEN.

El scheduler arranca con FastAPI lifespan en main.py.
Si SCHEDULER_DISABLED=1, no inicia (útil para tests).
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone

from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger

logger = logging.getLogger(__name__)

_scheduler: BackgroundScheduler | None = None


# ============================== Jobs ==============================


def job_expire_reservations() -> None:
    from app.core.db import SessionLocal
    from app.services import reservation as res_svc

    db = SessionLocal()
    try:
        count = res_svc.expire_overdue(db)
        if count:
            db.commit()
            logger.info("expired %d reservations", count)
    except Exception:
        db.rollback()
        logger.exception("job_expire_reservations failed")
    finally:
        db.close()


def job_purge_old_auth_tokens() -> None:
    """Borra tokens de email_verify / password_reset con expires_at < now - 30d."""
    from datetime import timedelta
    from sqlalchemy import delete
    from app.core.db import SessionLocal
    from app.models import AuthToken

    db = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(days=30)
        result = db.execute(delete(AuthToken).where(AuthToken.expires_at < cutoff))
        if result.rowcount:
            db.commit()
            logger.info("purged %d old auth tokens", result.rowcount)
    except Exception:
        db.rollback()
        logger.exception("job_purge_old_auth_tokens failed")
    finally:
        db.close()


def job_cache_sweep() -> None:
    """Forzar limpieza de cache stale: aunque cache es TTL, queremos botar
    keys que nadie tocó hace mucho para evitar bloat."""
    from app.services.cache import cache
    stats = cache.stats()
    logger.info("cache_stats %s", stats)
    # Si el cache supera 5000 entradas o hit_rate < 10%, lo limpiamos completo.
    if stats["size"] > 5000 or (stats["size"] > 100 and stats["hit_rate"] < 0.1):
        cache.clear()
        logger.warning("cache cleared (size=%d hit_rate=%.2f)", stats["size"], stats["hit_rate"])


def job_auto_close_overdue_events() -> None:
    """Cierra eventos que terminaron hace más de 24h pero siguen OPEN/CLOSED.
    Útil para que el admin no tenga que cerrarlos manualmente."""
    from datetime import timedelta
    from sqlalchemy import select
    from app.core.db import SessionLocal
    from app.models import Event, EventStatus

    db = SessionLocal()
    try:
        cutoff = datetime.now(timezone.utc) - timedelta(hours=24)
        evs = list(
            db.scalars(
                select(Event).where(
                    Event.status.in_([EventStatus.OPEN, EventStatus.CLOSED]),
                    Event.ends_at.is_not(None),
                    Event.ends_at < cutoff,
                )
            )
        )
        for ev in evs:
            ev.status = EventStatus.CLOSED
            logger.info("auto_closed event %s (%s)", ev.id, ev.name)
        if evs:
            db.commit()
    except Exception:
        db.rollback()
        logger.exception("job_auto_close_overdue_events failed")
    finally:
        db.close()


def job_rebuild_search_index() -> None:
    """Sync incremental del índice FTS5 desde las tablas reales.
    En esta versión, FTS se mantiene vía triggers SQLite — este job es un
    backup que rebuildea el índice completo cada noche."""
    from app.services.search import rebuild_index
    try:
        rebuild_index()
        logger.info("FTS index rebuilt")
    except Exception:
        logger.exception("job_rebuild_search_index failed")


def job_refresh_fx() -> None:
    """Actualiza el tipo de cambio USD→CLP desde frankfurter.app."""
    from app.services import fx
    fx.refresh()


# ============================== Lifecycle ==============================


def start() -> None:
    """Arranca el scheduler. Idempotente — si ya está corriendo, no hace nada."""
    global _scheduler
    if os.environ.get("SCHEDULER_DISABLED") == "1":
        logger.info("scheduler disabled via SCHEDULER_DISABLED=1")
        return
    if _scheduler is not None:
        return

    _scheduler = BackgroundScheduler(timezone="UTC")
    _scheduler.add_job(
        job_expire_reservations, IntervalTrigger(minutes=5),
        id="expire_reservations", replace_existing=True,
    )
    _scheduler.add_job(
        job_cache_sweep, IntervalTrigger(hours=1),
        id="cache_sweep", replace_existing=True,
    )
    _scheduler.add_job(
        job_purge_old_auth_tokens, IntervalTrigger(hours=6),
        id="purge_auth_tokens", replace_existing=True,
    )
    _scheduler.add_job(
        job_auto_close_overdue_events, CronTrigger(hour=3, minute=0),
        id="auto_close_events", replace_existing=True,
    )
    _scheduler.add_job(
        job_rebuild_search_index, CronTrigger(hour=4, minute=0),
        id="rebuild_search", replace_existing=True,
    )
    # FX rate diario 04:30 UTC (el refresh inicial corre en lifespan, no acá)
    _scheduler.add_job(
        job_refresh_fx, CronTrigger(hour=4, minute=30),
        id="refresh_fx", replace_existing=True,
    )
    _scheduler.start()
    logger.info("scheduler started with %d jobs", len(_scheduler.get_jobs()))


def stop() -> None:
    global _scheduler
    if _scheduler:
        _scheduler.shutdown(wait=False)
        _scheduler = None
        logger.info("scheduler stopped")


def jobs_info() -> list[dict]:
    """Para el endpoint admin /scheduler/status."""
    if not _scheduler:
        return []
    return [
        {
            "id": j.id,
            "next_run": j.next_run_time.isoformat() if j.next_run_time else None,
            "trigger": str(j.trigger),
        }
        for j in _scheduler.get_jobs()
    ]
