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


def job_refresh_tcg_news() -> None:
    """Trae noticias TCG nuevas desde Reddit + RSS oficiales."""
    from app.services import tcg_news as news_svc
    try:
        news_svc.refresh_all()
    except Exception:
        logger.exception("job_refresh_tcg_news failed")


def job_apply_rating_decay() -> None:
    """Aplica ranked decay 1x/día a jugadores inactivos sin freeze."""
    from app.core.db import SessionLocal
    from app.services import competitive as cs
    db = SessionLocal()
    try:
        cs.apply_decay_to_all(db)
    except Exception:
        logger.exception("job_apply_rating_decay failed")
    finally:
        db.close()


def job_sparring_matchmaker() -> None:
    """Empareja cola de sparring cada 30s."""
    from app.core.db import SessionLocal
    from app.services import competitive as cs
    db = SessionLocal()
    try:
        cs.run_sparring_matchmaker(db)
    except Exception:
        logger.exception("job_sparring_matchmaker failed")
    finally:
        db.close()


def job_cleanup_duels() -> None:
    """Cleanup duels: PENDING expirados + ACCEPTED sin reportar 24h+."""
    from app.core.db import SessionLocal
    from app.services import competitive as cs
    db = SessionLocal()
    try:
        cs.cleanup_pending_duels(db)
    except Exception:
        logger.exception("job_cleanup_duels failed")
    finally:
        db.close()


def job_cleanup_sparring_queue() -> None:
    """Purge sparring queue: unmatched>30min, matched>2h."""
    from app.core.db import SessionLocal
    from app.services import competitive as cs
    db = SessionLocal()
    try:
        cs.cleanup_sparring_queue(db)
    except Exception:
        logger.exception("job_cleanup_sparring_queue failed")
    finally:
        db.close()


def job_expire_unpaid_registrations() -> None:
    """Libera cupos de inscripciones impagas vencidas (payment_expires_at < now).

    Solo toca regs PENDING de eventos OPEN cuyo plazo de pago venció.
    Notifica al jugador antes de borrar la inscripción.
    """
    from datetime import datetime, timezone
    from sqlalchemy import select
    from app.core.db import SessionLocal
    from app.models import Event, EventRegistration, EventStatus
    from app.models.base import PaymentStatus
    from app.services import notifications as notif_svc

    db = SessionLocal()
    try:
        now = datetime.now(timezone.utc)
        expired = list(db.scalars(select(EventRegistration).where(
            EventRegistration.payment_status == PaymentStatus.PENDING,
            EventRegistration.payment_expires_at.is_not(None),
            EventRegistration.payment_expires_at < now,
        )))
        released = 0
        affected_events: set[int] = set()
        for reg in expired:
            ev = db.get(Event, reg.event_id)
            # Solo liberar si el evento sigue en inscripciones (no tocar torneos en curso)
            if not ev or ev.status not in (EventStatus.DRAFT, EventStatus.OPEN):
                reg.payment_expires_at = None  # dejar de evaluarla
                continue
            try:
                notif_svc.notify(
                    db, player_id=reg.player_id,
                    type="event_reg_expired",
                    title="Cupo liberado por falta de pago",
                    body=f"Tu inscripción a {ev.name} expiró sin pago. Podés volver a inscribirte si quedan cupos.",
                    link=f"/events/{ev.id}",
                )
            except Exception:
                logger.exception("notify expired reg failed")
            db.delete(reg)
            affected_events.add(ev.id)
            released += 1
        db.flush()
        # Cupos liberados → promover desde la waitlist (uno por cupo libre)
        from app.services import event as event_svc
        for eid in affected_events:
            try:
                while event_svc.promote_from_waitlist(db, event_id=eid):
                    pass
            except Exception:
                logger.exception("waitlist promote failed for event %s", eid)
        db.commit()
        if released:
            logger.info("expired unpaid registrations released=%d", released)

        # Recordatorio único: PENDING que expira en <2h y no fue avisado
        from datetime import timedelta
        soon = now + timedelta(hours=2)
        reminders = list(db.scalars(select(EventRegistration).where(
            EventRegistration.payment_status == PaymentStatus.PENDING,
            EventRegistration.payment_expires_at.is_not(None),
            EventRegistration.payment_expires_at > now,
            EventRegistration.payment_expires_at < soon,
            EventRegistration.payment_reminder_sent.is_(False),
        )))
        for reg in reminders:
            ev = db.get(Event, reg.event_id)
            if not ev:
                continue
            try:
                notif_svc.notify(
                    db, player_id=reg.player_id,
                    type="payment_reminder",
                    title="⏰ Tu cupo expira pronto",
                    body=f"Te quedan menos de 2 horas para pagar tu inscripción a {ev.name}.",
                    link=f"/events/{ev.id}",
                )
                reg.payment_reminder_sent = True
            except Exception:
                logger.exception("payment reminder failed")
        db.commit()
        if reminders:
            logger.info("payment reminders sent=%d", len(reminders))
    except Exception:
        logger.exception("job_expire_unpaid_registrations failed")
    finally:
        db.close()


def job_weekly_summaries() -> None:
    """Lunes: 'Tu Semana Elite' para jugadores activos."""
    from app.core.db import SessionLocal
    from app.services import growth as growth_svc
    db = SessionLocal()
    try:
        growth_svc.send_weekly_summaries(db)
        db.commit()
    except Exception:
        logger.exception("job_weekly_summaries failed")
    finally:
        db.close()


def job_rivalry_reminders() -> None:
    """Diario: 'mañana juega tu rival/némesis' a inscritos."""
    from app.core.db import SessionLocal
    from app.services import growth as growth_svc
    db = SessionLocal()
    try:
        growth_svc.send_rivalry_event_reminders(db)
        db.commit()
    except Exception:
        logger.exception("job_rivalry_reminders failed")
    finally:
        db.close()


def job_resolve_guild_wars() -> None:
    """Auto-resolve guild wars vencidas + paga EXP a winners."""
    from app.core.db import SessionLocal
    from app.services import competitive as cs
    db = SessionLocal()
    try:
        cs.resolve_expired_wars(db)
    except Exception:
        logger.exception("job_resolve_guild_wars failed")
    finally:
        db.close()


def job_fire_tornado() -> None:
    """Dispara el Tornado of Fate diario para cada Gremio activo."""
    from sqlalchemy import select
    from app.core.db import SessionLocal
    from app.models import Guild, GuildStatus
    from app.routers.tornado import fire_tornado

    db = SessionLocal()
    try:
        guilds = list(db.scalars(select(Guild).where(Guild.status == GuildStatus.ACTIVE)))
        for g in guilds:
            try:
                fire_tornado(db, guild_id=g.id)
            except Exception:
                logger.exception("tornado fire failed for guild %s", g.id)
    except Exception:
        logger.exception("job_fire_tornado failed")
    finally:
        db.close()


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
    # Tornado of Fate diario 12:00 UTC (≈ 9 AM hora Chile)
    _scheduler.add_job(
        job_fire_tornado, CronTrigger(hour=12, minute=0),
        id="fire_tornado", replace_existing=True,
    )
    # Noticias TCG cada hora
    _scheduler.add_job(
        job_refresh_tcg_news, IntervalTrigger(hours=1),
        id="refresh_tcg_news", replace_existing=True,
    )
    # Rating decay diario 05:00 UTC
    _scheduler.add_job(
        job_apply_rating_decay, CronTrigger(hour=5, minute=0),
        id="rating_decay", replace_existing=True,
    )
    # Sparring matchmaker cada 30s
    _scheduler.add_job(
        job_sparring_matchmaker, IntervalTrigger(seconds=30),
        id="sparring_matcher", replace_existing=True,
    )
    # Duel cleanup cada hora
    _scheduler.add_job(
        job_cleanup_duels, IntervalTrigger(hours=1),
        id="cleanup_duels", replace_existing=True,
    )
    # Sparring queue cleanup cada 5min
    _scheduler.add_job(
        job_cleanup_sparring_queue, IntervalTrigger(minutes=5),
        id="cleanup_sparring", replace_existing=True,
    )
    # Guild wars auto-resolve cada hora
    _scheduler.add_job(
        job_resolve_guild_wars, IntervalTrigger(hours=1),
        id="resolve_guild_wars", replace_existing=True,
    )
    # Liberar cupos impagos vencidos cada 10 min
    _scheduler.add_job(
        job_expire_unpaid_registrations, IntervalTrigger(minutes=10),
        id="expire_unpaid_regs", replace_existing=True,
    )
    # Tu Semana Elite — lunes 12:00 UTC (≈ 9 AM Chile)
    _scheduler.add_job(
        job_weekly_summaries, CronTrigger(day_of_week="mon", hour=12, minute=0),
        id="weekly_summaries", replace_existing=True,
    )
    # Recordatorio rival/némesis — diario 22:00 UTC (tarde Chile, evento es mañana)
    _scheduler.add_job(
        job_rivalry_reminders, CronTrigger(hour=22, minute=0),
        id="rivalry_reminders", replace_existing=True,
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
