"""Lógica de eventos: inscripción, asistencia, resultados y EXP automática."""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    AttendanceStatus,
    Event,
    EventRegistration,
    EventStatus,
    EventType,
    PaymentStatus,
)
from app.services import exp as exp_svc


# ============================== Mapping posición → reason_code ==============================

def _exp_reason_for_position(position: int | None) -> str | None:
    """Devuelve el reason_code de EXP correspondiente a la posición final.

    Solo aplica para top 8. Para posiciones más allá, la EXP viene de
    'event_participation' (si asistió).
    """
    if position is None:
        return None
    if position == 1:
        return "champion"
    if position == 2:
        return "finalist"
    if 3 <= position <= 4:
        return "top_4"
    if 5 <= position <= 8:
        return "top_8"
    return None


# ============================== Validaciones ==============================


def _ensure_event_open(ev: Event) -> None:
    if ev.status not in (EventStatus.OPEN, EventStatus.DRAFT):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"El evento no acepta inscripciones (estado actual: {ev.status.value})",
        )


def _slots_taken(db: Session, event_id: int) -> int:
    return db.scalar(
        select(func.count(EventRegistration.id)).where(EventRegistration.event_id == event_id)
    ) or 0


# ============================== Player actions ==============================


def register_player(
    db: Session, *, event_id: int, player_id: int
) -> EventRegistration:
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    _ensure_event_open(ev)

    # Duplicate check
    existing = db.scalar(
        select(EventRegistration).where(
            EventRegistration.event_id == event_id,
            EventRegistration.player_id == player_id,
        )
    )
    if existing:
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya estás inscrito en este evento")

    # Slot check
    if _slots_taken(db, event_id) >= ev.slots:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Evento sin cupos disponibles")

    reg = EventRegistration(
        event_id=event_id,
        player_id=player_id,
        payment_status=PaymentStatus.PENDING if ev.price_clp > 0 else PaymentStatus.PAID,
        attendance_status=AttendanceStatus.PENDING,
        registered_at=datetime.now(timezone.utc),
    )
    db.add(reg)
    db.flush()

    # Trigger automático: incrementar misión "register_events" / "register_3_events"
    try:
        from app.services import gamification as gm
        gm.increment_mission_progress(db, player_id=player_id, mission_code="register_events", delta=1)
        gm.increment_mission_progress(db, player_id=player_id, mission_code="register_3_events", delta=1)
        # Trigger por tipo de evento
        if ev.event_type == EventType.TRADE_DAY:
            gm.increment_mission_progress(db, player_id=player_id, mission_code="trade_day_attend", delta=1)
    except Exception:
        pass

    return reg


def cancel_registration(
    db: Session, *, registration_id: int, by_player_id: int | None = None
) -> EventRegistration:
    reg = db.get(EventRegistration, registration_id)
    if not reg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Inscripción no encontrada")
    if by_player_id is not None and reg.player_id != by_player_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Esta inscripción no es tuya")
    ev = db.get(Event, reg.event_id)
    if ev and ev.status in (EventStatus.FINISHED, EventStatus.CLOSED):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "No se puede cancelar una inscripción de un evento finalizado",
        )
    db.delete(reg)
    db.flush()
    return reg


# ============================== Admin actions ==============================


REFERRAL_REFERRER_BONUS = 300
REFERRAL_REFERRED_BONUS = 150


def _activate_referral_on_first_attendance(db: Session, *, player_profile_id: int) -> None:
    """Si el jugador fue invitado y aún está PENDING, activamos el referral.

    Bonus EXP a ambos: el invitado y el invitador (si tienen perfil).
    Idempotente: solo se activa una vez por referral.
    """
    from app.models import PlayerProfile, Referral, ReferralStatus
    from app.services import exp as exp_svc

    player = db.get(PlayerProfile, player_profile_id)
    if not player:
        return

    ref = db.scalar(
        select(Referral).where(
            Referral.referred_user_id == player.user_id,
            Referral.status == ReferralStatus.PENDING,
        )
    )
    if not ref:
        return

    # Otorga EXP al recién llegado y al invitador (si tiene perfil)
    referrer_profile = db.scalar(
        select(PlayerProfile).where(PlayerProfile.user_id == ref.referrer_user_id)
    )

    from datetime import datetime, timezone
    ref.status = ReferralStatus.ACTIVATED
    ref.activated_at = datetime.now(timezone.utc)

    # Bonus al invitado y al invitador (best-effort: si no hay temporada activa,
    # el award_exp lanza RuntimeError y lo ignoramos en el caller).
    try:
        exp_svc.award_exp(
            db, player.id, "referral",
            amount=REFERRAL_REFERRED_BONUS,
            reason=f"Bonus por venir referido",
        )
    except RuntimeError:
        pass
    if referrer_profile:
        try:
            exp_svc.award_exp(
                db, referrer_profile.id, "referral",
                amount=REFERRAL_REFERRER_BONUS,
                reason=f"Bonus por traer a {player.alias}",
            )
        except RuntimeError:
            pass
        # Notif al invitador
        try:
            from app.services import notifications as notif_svc
            notif_svc.notify(
                db, player_id=referrer_profile.id,
                type="referral_activated",
                title="🎉 Tu referido se activó",
                body=f"{player.alias} jugó su primer evento. ¡Bonus de EXP para vos!",
                link="/profile",
            )
        except Exception:
            pass


def mark_attendance(
    db: Session, *, registration_id: int, status_value: AttendanceStatus
) -> EventRegistration:
    from app.models import Event
    from app.services import streak as streak_svc
    reg = db.get(EventRegistration, registration_id)
    if not reg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Inscripción no encontrada")
    previous = reg.attendance_status
    reg.attendance_status = status_value
    # Trigger streak + achievements al cambiar a ATTENDED (no si ya estaba).
    if status_value == AttendanceStatus.ATTENDED and previous != AttendanceStatus.ATTENDED:
        ev = db.get(Event, reg.event_id)
        if ev and ev.guild_id is not None:
            s, _ = streak_svc.register_attendance(
                db, player_id=reg.player_id, guild_id=ev.guild_id,
            )
            try:
                from app.services import achievements_auto
                achievements_auto.increment_for_trigger(
                    db, player_id=reg.player_id, guild_id=ev.guild_id,
                    kind="events_attended", delta=1,
                )
                achievements_auto.increment_for_trigger(
                    db, player_id=reg.player_id, guild_id=ev.guild_id,
                    kind="streak_max", delta=s.current_streak,
                )
            except Exception:
                pass
            # Activar referral si el jugador fue invitado y aún está PENDING.
            try:
                _activate_referral_on_first_attendance(db, player_profile_id=reg.player_id)
            except Exception:
                pass
    db.flush()
    return reg


def mark_payment(
    db: Session, *, registration_id: int, status_value: PaymentStatus
) -> EventRegistration:
    reg = db.get(EventRegistration, registration_id)
    if not reg:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Inscripción no encontrada")
    reg.payment_status = status_value
    db.flush()
    return reg


def record_results(
    db: Session, *, event_id: int, results: list[dict]
) -> int:
    """Actualiza `final_position`, `rounds_won` y `rounds_lost` de inscripciones.

    `results` es lista de dicts: {player_id, final_position, rounds_won, rounds_lost}.
    Devuelve cantidad de inscripciones actualizadas.
    """
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")

    updated = 0
    for row in results:
        reg = db.scalar(
            select(EventRegistration).where(
                EventRegistration.event_id == event_id,
                EventRegistration.player_id == row["player_id"],
            )
        )
        if reg is None:
            continue
        if "final_position" in row:
            reg.final_position = row["final_position"]
        if "rounds_won" in row:
            reg.rounds_won = int(row["rounds_won"] or 0)
        if "rounds_lost" in row:
            reg.rounds_lost = int(row["rounds_lost"] or 0)
        updated += 1
    db.flush()
    return updated


def award_event_exp(
    db: Session, *, event_id: int, admin_id: int
) -> dict:
    """Asigna EXP automática a todos los inscritos según resultados/asistencia.

    Reglas aplicadas (cumulativas):
      - Si attendance == ATTENDED → event_participation (+100)
      - Si attendance == NO_SHOW → no_show (-100)
      - Si attendance == PENDING → no se asigna nada (admin marcó sin asistencia explícita)
      - Por cada ronda ganada → round_won (+50)
      - Por final_position si está en top 8 → champion/finalist/top_4/top_8

    Idempotencia: usa `reason_code` único por evento+jugador via related_event_id.
    Si ya se asignó EXP para este evento, se evita doble crédito chequeando
    ExpTransaction.related_event_id por reason_code base.
    """
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")

    regs = list(db.scalars(select(EventRegistration).where(EventRegistration.event_id == event_id)))
    if not regs:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El evento no tiene inscritos")

    # Chequeo de idempotencia: si ya hay transacciones relacionadas a este evento
    from app.models import ExpTransaction
    already = db.scalar(
        select(func.count(ExpTransaction.id)).where(ExpTransaction.related_event_id == event_id)
    ) or 0
    if already > 0:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Este evento ya tiene EXP asignada ({already} transacciones). "
            "Para reasignar, primero revierte las transacciones manualmente.",
        )

    awarded = 0
    total_exp = 0

    from app.services import streak as streak_svc

    for reg in regs:
        positive_for_streak = 0  # acumulado para aplicar bonus al final

        # Participación / no-show
        if reg.attendance_status == AttendanceStatus.ATTENDED:
            tx = exp_svc.award_exp(
                db, reg.player_id, "event_participation",
                related_event_id=event_id, admin_id=admin_id,
            )
            total_exp += tx.amount
            positive_for_streak += max(0, tx.amount)
            awarded += 1
        elif reg.attendance_status == AttendanceStatus.NO_SHOW:
            tx = exp_svc.award_exp(
                db, reg.player_id, "no_show",
                related_event_id=event_id, admin_id=admin_id,
            )
            total_exp += tx.amount

        # Rondas ganadas
        if reg.attendance_status == AttendanceStatus.ATTENDED and reg.rounds_won > 0:
            for _ in range(reg.rounds_won):
                tx = exp_svc.award_exp(
                    db, reg.player_id, "round_won",
                    related_event_id=event_id, admin_id=admin_id,
                )
                total_exp += tx.amount
                positive_for_streak += max(0, tx.amount)

        # Posición final
        if reg.attendance_status == AttendanceStatus.ATTENDED:
            code = _exp_reason_for_position(reg.final_position)
            if code is not None:
                tx = exp_svc.award_exp(
                    db, reg.player_id, code,
                    related_event_id=event_id, admin_id=admin_id,
                )
                total_exp += tx.amount
                positive_for_streak += max(0, tx.amount)

        # Bonus por racha activa (solo si asistió y tuvo EXP positiva)
        if reg.attendance_status == AttendanceStatus.ATTENDED and positive_for_streak > 0 and ev.guild_id is not None:
            s = streak_svc.get(db, player_id=reg.player_id, guild_id=ev.guild_id)
            if s and s.current_streak > 1:
                mult = streak_svc.exp_multiplier(s.current_streak)
                bonus = int(round(positive_for_streak * (mult - 1.0)))
                if bonus > 0:
                    tx = exp_svc.award_exp(
                        db, reg.player_id, "streak_bonus",
                        amount=bonus,
                        related_event_id=event_id, admin_id=admin_id,
                        reason=f"Racha x{mult:.2f} (streak {s.current_streak})",
                    )
                    total_exp += tx.amount

    # Misiones automáticas por resultados (post-award)
    try:
        from app.services import gamification as gm
        for reg in regs:
            if reg.attendance_status == AttendanceStatus.ATTENDED:
                gm.increment_mission_progress(db, player_id=reg.player_id, mission_code="attend_events", delta=1)
                if reg.rounds_won >= 3:
                    gm.increment_mission_progress(db, player_id=reg.player_id, mission_code="win_3_rounds", delta=1)
                if reg.final_position == 1:
                    gm.increment_mission_progress(db, player_id=reg.player_id, mission_code="champion_event", delta=1)
    except Exception:
        pass

    # Notificaciones a inscritos
    try:
        from app.services import notifications as notif_svc
        for reg in regs:
            place = f" · Posición #{reg.final_position}" if reg.final_position else ""
            notif_svc.notify(
                db, player_id=reg.player_id, guild_id=ev.guild_id,
                type="event_finished_results",
                title="🏆 Resultados publicados",
                body=f"'{ev.name}' terminó.{place} EXP asignada.",
                link=f"/events/{ev.id}",
            )
    except Exception:
        pass

    # Marcar evento como FINISHED
    ev.status = EventStatus.FINISHED
    db.flush()

    return {
        "event_id": event_id,
        "registrations_processed": len(regs),
        "players_awarded": awarded,
        "total_exp_distributed": total_exp,
    }
