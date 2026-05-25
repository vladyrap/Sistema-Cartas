"""Asignación de EXP. Transaccional, auditable, vinculado a temporada activa.

Reglas de EXP iniciales (centralizadas para que el admin las pueda ajustar):
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import ExpTransaction, RankName, SeasonProgress, SeasonStatus
from app.models.season import Season
from app.services.progression import apply_exp_delta, rank_from_level


EXP_RULES: dict[str, int] = {
    "register": 50,
    "complete_profile": 50,
    "event_participation": 100,
    "round_won": 50,
    "top_8": 200,
    "top_4": 300,
    "finalist": 400,
    "champion": 600,
    "challenge_participation": 150,
    "referral": 200,
    "trade_day": 100,
    "themed_deck": 100,
    "no_show": -100,
    "unsportsmanlike": -200,
    # Bonus dinámico — el amount lo calcula el caller, no hay default.
    "streak_bonus": 0,
}


def get_active_season(db: Session) -> Season | None:
    return db.scalar(select(Season).where(Season.status == SeasonStatus.ACTIVE))


def get_or_create_progress(
    db: Session, season_id: int, player_id: int
) -> SeasonProgress:
    """Devuelve el SeasonProgress de un jugador en una temporada.

    Si no existe (jugador recién registrado dentro de una temporada activa),
    crea uno con nivel 1.
    """
    sp = db.scalar(
        select(SeasonProgress).where(
            SeasonProgress.season_id == season_id,
            SeasonProgress.player_id == player_id,
        )
    )
    if sp:
        return sp
    sp = SeasonProgress(
        season_id=season_id,
        player_id=player_id,
        starting_level=1,
        was_promoted_start=False,
        level=1,
        exp_in_level=0,
        exp_total=0,
        max_rank=RankName.INICIADO,
        current_rank=RankName.INICIADO,
    )
    db.add(sp)
    db.flush()
    return sp


def award_exp(
    db: Session,
    player_id: int,
    reason_code: str,
    *,
    amount: int | None = None,
    reason: str | None = None,
    related_event_id: int | None = None,
    admin_id: int | None = None,
) -> ExpTransaction:
    """Aplica EXP al jugador en la temporada activa y registra la transacción.

    `reason_code` debe estar en EXP_RULES o ser "admin_adjust" (con amount manual).
    """
    if amount is None:
        if reason_code not in EXP_RULES:
            raise ValueError(
                f"reason_code '{reason_code}' no tiene monto por defecto — pasa amount explícito."
            )
        amount = EXP_RULES[reason_code]

    if reason is None:
        reason = reason_code.replace("_", " ").capitalize()

    season = get_active_season(db)
    if season is None:
        raise RuntimeError("No hay temporada activa para asignar EXP.")

    sp = get_or_create_progress(db, season.id, player_id)

    new_level, new_exp_in, gained = apply_exp_delta(sp.level, sp.exp_in_level, amount)
    sp.level = new_level
    sp.exp_in_level = new_exp_in
    sp.exp_total = max(0, sp.exp_total + amount)

    current_rank = rank_from_level(new_level)
    sp.current_rank = current_rank
    # max_rank en la temporada solo sube, nunca baja
    if _rank_index(current_rank) > _rank_index(sp.max_rank):
        sp.max_rank = current_rank

    tx = ExpTransaction(
        season_id=season.id,
        player_id=player_id,
        amount=amount,
        reason=reason,
        reason_code=reason_code,
        related_event_id=related_event_id,
        admin_id=admin_id,
    )
    db.add(tx)
    db.flush()

    # Achievements acumulativas por exp_total (solo si es positivo)
    if amount > 0 and season.guild_id is not None:
        try:
            from app.services import achievements_auto
            achievements_auto.increment_for_trigger(
                db, player_id=player_id, guild_id=season.guild_id,
                kind="exp_total", delta=amount,
            )
        except Exception:
            pass

    return tx


def adjust_exp(
    db: Session, player_id: int, amount: int, reason: str, *, admin_id: int
) -> ExpTransaction:
    """Ajuste manual de EXP por admin. Puede ser positivo o negativo."""
    return award_exp(
        db,
        player_id,
        reason_code="admin_adjust",
        amount=amount,
        reason=reason,
        admin_id=admin_id,
    )


# Ranking interno para comparar rangos
_RANK_ORDER = [
    RankName.INICIADO,
    RankName.APRENDIZ,
    RankName.DUELISTA,
    RankName.RETADOR,
    RankName.ELITE,
    RankName.MAESTRO,
    RankName.CAMPEON,
]


def _rank_index(rank: RankName) -> int:
    return _RANK_ORDER.index(rank)
