"""Lógica de ciclo de vida de temporadas.

Tres operaciones críticas:
  - close_season:   cierra la temporada activa, calcula final_position,
                    crea SeasonHistory por jugador y aplica Prestigio.
  - create_season:  inserta una nueva temporada en estado DRAFT.
  - activate_season: marca DRAFT → ACTIVE y crea SeasonProgress para cada
                    jugador aplicando la regla de reinicio:
                       previo Maestro/Campeón → Duelista N10
                       otro caso             → Iniciado N1

La activación es la operación más sensible — está pensada como idempotente
y atómica: o todos los progresos se crean correctamente o se hace rollback.

Importante: la promoción de inicio (Duelista N10) NO trae beneficios
avanzados consigo. Los beneficios se evalúan siempre con el nivel
actual de la temporada vigente.
"""
from __future__ import annotations

from datetime import datetime, timezone
from typing import TypedDict

from sqlalchemy import func, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models import (
    PlayerProfile,
    PrestigeTransaction,
    RankName,
    Season,
    SeasonHistory,
    SeasonProgress,
    SeasonStatus,
)
from app.services.prestige import award_prestige, compute_prestige_for_progress
from app.services.progression import (
    PROMOTED_STARTING_LEVEL,
    rank_from_level,
    starting_level_for_new_season,
)


# ============================== Tipos de retorno ==============================


class ResetPreviewEntry(TypedDict):
    player_id: int
    alias: str
    previous_max_rank: str | None
    starting_level: int
    starting_rank: str
    was_promoted_start: bool


class CloseSeasonReport(TypedDict):
    season_id: int
    total_players: int
    champions: list[int]      # player_ids con final_position == 1
    top_8_players: list[int]
    prestige_awarded_total: int


# ============================== Helpers ==============================


def get_active_season(db: Session) -> Season | None:
    return db.scalar(select(Season).where(Season.status == SeasonStatus.ACTIVE))


def get_season(db: Session, season_id: int) -> Season:
    season = db.get(Season, season_id)
    if season is None:
        raise ValueError(f"Season {season_id} no existe")
    return season


def _next_season_number(db: Session) -> int:
    last = db.scalar(select(func.max(Season.number)))
    return (last or 0) + 1


# ============================== close_season ==============================


def close_season(
    db: Session,
    season_id: int,
    *,
    final_positions: dict[int, int] | None = None,
) -> CloseSeasonReport:
    """Cierra una temporada ACTIVE.

    Pasos:
      1. Valida que la temporada esté ACTIVE.
      2. Asigna final_position por jugador. Si `final_positions` no se entrega,
         se calcula por exp_total desc (mayor EXP = mejor posición).
      3. Crea SeasonHistory por cada SeasonProgress.
      4. Calcula y aplica Prestigio según rules.
      5. Marca la temporada como CLOSED con closed_at = now().

    Idempotencia: si la temporada ya está CLOSED levanta error — para reabrir,
    el admin debe usar un endpoint dedicado de "reopen" (no implementado en MVP).
    """
    season = get_season(db, season_id)
    if season.status != SeasonStatus.ACTIVE:
        raise ValueError(f"Solo se puede cerrar una temporada ACTIVE (estado actual: {season.status})")

    progresses: list[SeasonProgress] = list(
        db.scalars(select(SeasonProgress).where(SeasonProgress.season_id == season_id))
    )

    # Posiciones finales: si no las pasan, ordenar por exp_total desc
    if final_positions is None:
        ordered = sorted(progresses, key=lambda p: (-p.exp_total, p.level))
        final_positions = {p.player_id: i + 1 for i, p in enumerate(ordered)}

    champions: list[int] = []
    top_8: list[int] = []
    prestige_total = 0

    for sp in progresses:
        position = final_positions.get(sp.player_id)
        if position == 1:
            champions.append(sp.player_id)
        if position is not None and position <= 8:
            top_8.append(sp.player_id)

        prestige_entries = compute_prestige_for_progress(sp, position)
        prestige_for_player = sum(amount for _, amount in prestige_entries)

        for reason_code, amount in prestige_entries:
            award_prestige(
                db,
                player_id=sp.player_id,
                season_id=season.id,
                reason_code=reason_code,
                amount=amount,
            )

        history = SeasonHistory(
            season_id=season.id,
            player_id=sp.player_id,
            final_level=sp.level,
            final_exp_total=sp.exp_total,
            max_rank=sp.max_rank,
            final_position=position,
            prestige_earned=prestige_for_player,
        )
        db.add(history)
        prestige_total += prestige_for_player

    # Sumar prestigio al PlayerProfile (denormalizado para queries rápidas)
    if prestige_total > 0:
        for sp in progresses:
            entries = compute_prestige_for_progress(sp, final_positions.get(sp.player_id))
            sum_for_player = sum(a for _, a in entries)
            if sum_for_player > 0:
                player = db.get(PlayerProfile, sp.player_id)
                if player:
                    player.prestige += sum_for_player

    season.status = SeasonStatus.CLOSED
    season.closed_at = datetime.now(timezone.utc)
    db.flush()

    # Hooks de gamificación: Hall of Fame + medallas automáticas
    try:
        from app.services import gamification as gm
        gm.populate_hall_of_fame_for_season(db, season_id=season.id)
        gm.auto_award_for_season_close(db, season_id=season.id)
    except Exception:
        # No fallar el cierre si los hooks de gamificación tienen problemas
        pass

    return CloseSeasonReport(
        season_id=season.id,
        total_players=len(progresses),
        champions=champions,
        top_8_players=top_8,
        prestige_awarded_total=prestige_total,
    )


# ============================== create_season ==============================


def create_season(
    db: Session,
    *,
    name: str,
    starts_at: datetime,
    ends_at: datetime,
    description: str | None = None,
    previous_season_id: int | None = None,
    guild_id: int | None = None,
) -> Season:
    """Crea una nueva temporada en estado DRAFT. No la activa todavía.

    Si `guild_id` se pasa, scopea el check de temporada ACTIVE por Gremio."""
    active_stmt = select(Season).where(Season.status == SeasonStatus.ACTIVE)
    if guild_id is not None:
        active_stmt = active_stmt.where(Season.guild_id == guild_id)
    if (db.scalar(active_stmt) is not None
            and previous_season_id is None):
        # Hay una temporada activa todavía — el admin debe cerrarla primero.
        raise ValueError(
            "Hay una temporada ACTIVE. Ciérrala antes de crear la siguiente "
            "(o pasa previous_season_id explícitamente si estás creando una en draft anticipada)."
        )

    season = Season(
        number=_next_season_number(db),
        guild_id=guild_id,
        name=name,
        starts_at=starts_at,
        ends_at=ends_at,
        status=SeasonStatus.DRAFT,
        previous_season_id=previous_season_id,
        description=description,
    )
    db.add(season)
    db.flush()
    return season


# ============================== preview reset ==============================


def preview_reset(db: Session, *, target_season_id: int) -> list[ResetPreviewEntry]:
    """Calcula, SIN persistir, qué nivel tendría cada jugador al activar la
    temporada `target_season_id`.

    Útil para el panel admin: "Estos N jugadores comenzarán como Duelista".
    """
    target = get_season(db, target_season_id)
    prev_id = target.previous_season_id

    players: list[PlayerProfile] = list(db.scalars(select(PlayerProfile)))
    preview: list[ResetPreviewEntry] = []

    # Mapa player_id -> max_rank en temporada anterior (si existe)
    prev_max_ranks: dict[int, RankName] = {}
    if prev_id is not None:
        rows = db.execute(
            select(SeasonHistory.player_id, SeasonHistory.max_rank).where(
                SeasonHistory.season_id == prev_id
            )
        ).all()
        prev_max_ranks = {pid: r for pid, r in rows}

    for player in players:
        previous_rank = prev_max_ranks.get(player.id)
        starting_level = starting_level_for_new_season(previous_rank)
        preview.append(
            ResetPreviewEntry(
                player_id=player.id,
                alias=player.alias,
                previous_max_rank=previous_rank.value if previous_rank else None,
                starting_level=starting_level,
                starting_rank=rank_from_level(starting_level).value,
                was_promoted_start=(starting_level == PROMOTED_STARTING_LEVEL),
            )
        )
    return preview


# ============================== activate_season ==============================


def activate_season(db: Session, season_id: int) -> dict:
    """Activa una temporada DRAFT y crea SeasonProgress para todos los jugadores.

    Aplica la regla de reinicio:
      - Quien tenía max_rank in (MAESTRO, CAMPEON) en T-1 → comienza Duelista N10
      - Cualquier otro → comienza Iniciado N1

    No se reinician medallas, títulos, prestigio, Elite ID ni Hall of Fame.
    Solo se crea un nuevo SeasonProgress por jugador.
    """
    season = get_season(db, season_id)
    if season.status != SeasonStatus.DRAFT:
        raise ValueError(
            f"Solo se puede activar una temporada DRAFT (estado actual: {season.status})"
        )

    # Validación: no debería haber otra ACTIVE
    other_active = db.scalar(
        select(Season).where(Season.status == SeasonStatus.ACTIVE, Season.id != season_id)
    )
    if other_active is not None:
        raise ValueError(
            f"No se puede activar — la temporada {other_active.number} sigue ACTIVE. "
            "Ciérrala primero."
        )

    prev_id = season.previous_season_id
    prev_max_ranks: dict[int, RankName] = {}
    if prev_id is not None:
        rows = db.execute(
            select(SeasonHistory.player_id, SeasonHistory.max_rank).where(
                SeasonHistory.season_id == prev_id
            )
        ).all()
        prev_max_ranks = {pid: r for pid, r in rows}

    players: list[PlayerProfile] = list(db.scalars(select(PlayerProfile)))

    created = 0
    promoted = 0
    for player in players:
        previous_rank = prev_max_ranks.get(player.id)
        starting_level = starting_level_for_new_season(previous_rank)
        was_promoted = starting_level == PROMOTED_STARTING_LEVEL
        starting_rank = rank_from_level(starting_level)

        sp = SeasonProgress(
            season_id=season.id,
            player_id=player.id,
            starting_level=starting_level,
            was_promoted_start=was_promoted,
            level=starting_level,
            exp_in_level=0,
            exp_total=0,
            max_rank=starting_rank,
            current_rank=starting_rank,
        )
        db.add(sp)
        created += 1
        if was_promoted:
            promoted += 1

    try:
        db.flush()
    except IntegrityError as exc:
        # Probable colisión por intento de activar dos veces
        db.rollback()
        raise ValueError(
            "Ya existían SeasonProgress para esta temporada — activación duplicada."
        ) from exc

    season.status = SeasonStatus.ACTIVE
    db.flush()

    return {
        "season_id": season.id,
        "season_number": season.number,
        "players_initialized": created,
        "promoted_to_duelista": promoted,
    }
