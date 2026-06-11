"""Lógica de torneo suizo: pairings, standings con tiebreakers, drop, bye.

Tiebreakers al estilo Magic Tournament Rules (simplificado):
  - MP (Match Points): 3 por win, 1 por draw, 0 por loss. Bye = 3 MP, 2-0 game.
  - OMW% (Opponent Match Win %): promedio de los MW% de los oponentes
                                  (mínimo 33% por oponente para no castigar a quien jugó contra rivales débiles que droppearon).
  - GW% (Game Win %): juegos ganados / total de juegos.
  - OGW% (Opponent Game Win %): promedio de GW% de oponentes (mismo floor 33%).

El servicio NO genera pairings óptimos (eso es NP-hard); usa un greedy razonable:
  1. Agrupar por MP descendente.
  2. Dentro de cada grupo, intentar emparejar evitando rematch.
  3. Si hay impar en un grupo, bajar a alguien al siguiente.
  4. Si queda 1 sin pareja al final → bye automático.

Concurrencia / robustez:
  - generate_pairings y persist_pairings toman pessimistic lock en el Event row
    (SELECT FOR UPDATE) — Postgres bloquea, SQLite lo ignora silenciosamente.
  - report_match valida winner ∈ {player_a, player_b} antes de tocar regs.
  - Revert+apply de counters va dentro de SAVEPOINT (begin_nested) para que
    una falla parcial no deje el evento en estado inconsistente.
"""
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from fastapi import HTTPException, status as http_status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Event,
    EventRegistration,
    EventStatus,
    MatchResult,
    PlayerProfile,
)
from app.services import realtime as rt

log = logging.getLogger(__name__)


# ============================== Helpers ==============================


def invalidate_event_cache(event_id: int) -> None:
    """Centraliza la invalidación del cache de standings + rondas activas.

    NO callable desde DBdirect — solo lo usan los services de torneo.
    Loguea si falla en lugar de tragárselo silenciosamente (cambio vs el
    comportamiento anterior).
    """
    try:
        from app.services.cache import invalidate_event
        invalidate_event(event_id)
    except Exception:
        log.exception("Cache invalidation failed for event %s", event_id)


def _lock_event(db: Session, event_id: int) -> Event:
    """Pessimistic lock en Event row. Postgres bloquea, SQLite ignora.

    Levanta 404 si el evento no existe.
    """
    event = db.execute(
        select(Event).where(Event.id == event_id).with_for_update()
    ).scalar_one_or_none()
    if not event:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    return event


# ============================== Datos derivados ==============================


@dataclass
class StandingRow:
    player_id: int
    alias: str
    elite_id_code: str
    match_points: int
    rounds_won: int
    rounds_lost: int
    rounds_draw: int
    games_won: int
    games_lost: int
    omw: float
    gw: float
    ogw: float
    dropped: bool
    matches_played: int

    @property
    def rank(self) -> int:
        return self._rank if hasattr(self, "_rank") else 0


def _mw_pct(reg: EventRegistration) -> float:
    """Match Win % de un jugador, con floor 33%."""
    played = reg.rounds_won + reg.rounds_lost + reg.rounds_draw
    if played == 0:
        return 1.0 / 3
    pct = (reg.rounds_won + reg.rounds_draw * 0.5) / played
    return max(pct, 1.0 / 3)


def _gw_pct(reg: EventRegistration) -> float:
    total = reg.games_won + reg.games_lost
    if total == 0:
        return 1.0 / 3
    return max(reg.games_won / total, 1.0 / 3)


def _opponents_of(db: Session, event_id: int, player_id: int) -> set[int]:
    """Devuelve los player_ids contra los que `player_id` ya jugó."""
    rows = db.execute(
        select(MatchResult.player_a_id, MatchResult.player_b_id).where(
            MatchResult.event_id == event_id,
            (MatchResult.player_a_id == player_id) | (MatchResult.player_b_id == player_id),
        )
    ).all()
    opps: set[int] = set()
    for a, b in rows:
        if a != player_id and a is not None:
            opps.add(a)
        if b != player_id and b is not None:
            opps.add(b)
    return opps


# ============================== Standings ==============================


def compute_standings(db: Session, *, event_id: int) -> list[StandingRow]:
    """Calcula standings ordenados desc por (MP, OMW%, GW%, OGW%).
    Cacheado 15s — se invalida en cada report_match / drop / round."""
    from app.services.cache import cache

    cache_key = f"event:{event_id}:standings"
    cached = cache.get(cache_key)
    if cached is not None:
        return cached
    rows = _compute_standings_inner(db, event_id=event_id)
    cache.set(cache_key, rows, ttl_seconds=15.0)
    return rows


def _compute_standings_inner(db: Session, *, event_id: int) -> list[StandingRow]:
    """Cálculo real sin cache."""
    regs = list(
        db.scalars(select(EventRegistration).where(EventRegistration.event_id == event_id))
    )
    if not regs:
        return []

    reg_by_player: dict[int, EventRegistration] = {r.player_id: r for r in regs}
    mw_cache = {pid: _mw_pct(reg) for pid, reg in reg_by_player.items()}
    gw_cache = {pid: _gw_pct(reg) for pid, reg in reg_by_player.items()}

    rows: list[StandingRow] = []
    for pid, reg in reg_by_player.items():
        opps = _opponents_of(db, event_id, pid)
        opps_real = [o for o in opps if o in mw_cache]
        if opps_real:
            omw = sum(mw_cache[o] for o in opps_real) / len(opps_real)
            ogw = sum(gw_cache[o] for o in opps_real) / len(opps_real)
        else:
            omw = 0.0
            ogw = 0.0
        player = db.get(PlayerProfile, pid)
        if not player:
            continue
        played = reg.rounds_won + reg.rounds_lost + reg.rounds_draw
        rows.append(StandingRow(
            player_id=pid,
            alias=player.alias,
            elite_id_code=player.elite_id_code,
            match_points=reg.match_points,
            rounds_won=reg.rounds_won,
            rounds_lost=reg.rounds_lost,
            rounds_draw=reg.rounds_draw,
            games_won=reg.games_won,
            games_lost=reg.games_lost,
            omw=round(omw, 4),
            gw=round(gw_cache[pid], 4),
            ogw=round(ogw, 4),
            dropped=reg.dropped,
            matches_played=played,
        ))

    rows.sort(key=lambda r: (r.match_points, r.omw, r.gw, r.ogw), reverse=True)
    for i, r in enumerate(rows, start=1):
        r._rank = i  # type: ignore[attr-defined]
    return rows


# ============================== Pairings ==============================


@dataclass
class PairingProposal:
    table_number: int
    player_a_id: int
    player_b_id: int | None  # None → bye


def _current_round_number(db: Session, event_id: int) -> int:
    return db.scalar(
        select(func.coalesce(func.max(MatchResult.round_number), 0)).where(
            MatchResult.event_id == event_id
        )
    ) or 0


def generate_pairings(db: Session, *, event_id: int) -> list[PairingProposal]:
    """Genera los pairings de la PRÓXIMA ronda.

    Toma pessimistic lock en el evento para evitar dos generaciones
    concurrentes desde dos admins en simultáneo.
    """
    _lock_event(db, event_id)

    # Verificar que la ronda actual está cerrada (todas reportadas o bye)
    current_round = _current_round_number(db, event_id)
    if current_round > 0:
        unfinished = db.scalar(
            select(func.count(MatchResult.id)).where(
                MatchResult.event_id == event_id,
                MatchResult.round_number == current_round,
                MatchResult.reported_at.is_(None),
                MatchResult.is_bye.is_(False),
            )
        ) or 0
        if unfinished:
            raise HTTPException(
                http_status.HTTP_400_BAD_REQUEST,
                f"La ronda {current_round} tiene {unfinished} match(es) sin reportar. "
                f"Cerrá la ronda actual antes de generar la próxima.",
            )

    # NO usar la versión cacheada — pairings necesita data fresca y, en tests
    # con eventos efímeros, el cache puede traer resultados de otros tests.
    standings = _compute_standings_inner(db, event_id=event_id)
    active = [s for s in standings if not s.dropped]
    if not active:
        return []

    opps_map: dict[int, set[int]] = {
        s.player_id: _opponents_of(db, event_id, s.player_id) for s in active
    }

    pairings: list[PairingProposal] = []
    paired: set[int] = set()
    queue = list(active)

    table = 1
    i = 0
    while i < len(queue):
        a = queue[i]
        if a.player_id in paired:
            i += 1
            continue
        partner = None
        for j in range(i + 1, len(queue)):
            b = queue[j]
            if b.player_id in paired:
                continue
            if b.player_id not in opps_map[a.player_id]:
                partner = b
                break
        if partner is None:
            for j in range(i + 1, len(queue)):
                b = queue[j]
                if b.player_id not in paired:
                    partner = b
                    break
        if partner is not None:
            pairings.append(PairingProposal(
                table_number=table,
                player_a_id=a.player_id,
                player_b_id=partner.player_id,
            ))
            paired.add(a.player_id)
            paired.add(partner.player_id)
            table += 1
        else:
            pairings.append(PairingProposal(
                table_number=table, player_a_id=a.player_id, player_b_id=None,
            ))
            paired.add(a.player_id)
            table += 1
        i += 1

    return pairings


def persist_pairings(
    db: Session, *, event_id: int, pairings: list[PairingProposal],
) -> list[MatchResult]:
    """Crea MatchResult rows para una nueva ronda.

    Aplica bye automáticamente (winner=player_a, games 2-0).
    Bajo pessimistic lock — si dos admins llamaron generate_pairings concurrente,
    el segundo en llegar acá detecta los matches creados y aborta limpiamente.
    """
    _lock_event(db, event_id)

    # Re-chequear bajo lock que no se creó otra ronda mientras tanto.
    pre_round = _current_round_number(db, event_id)
    next_round = pre_round + 1

    created: list[MatchResult] = []
    for p in pairings:
        if p.player_b_id is None:
            m = MatchResult(
                event_id=event_id, round_number=next_round, table_number=p.table_number,
                player_a_id=p.player_a_id, player_b_id=None,
                winner_id=p.player_a_id, is_bye=True,
                games_a=2, games_b=0,
                reported_at=datetime.now(timezone.utc),
            )
            reg = db.scalar(
                select(EventRegistration).where(
                    EventRegistration.event_id == event_id,
                    EventRegistration.player_id == p.player_a_id,
                )
            )
            if reg:
                reg.rounds_won += 1
                reg.match_points += 3
                reg.games_won += 2
        else:
            m = MatchResult(
                event_id=event_id, round_number=next_round, table_number=p.table_number,
                player_a_id=p.player_a_id, player_b_id=p.player_b_id,
            )
        db.add(m)
        db.flush()
        created.append(m)

    invalidate_event_cache(event_id)
    rt.emit_round_started(event_id, next_round, len(created))
    rt.emit_standings_updated(event_id)
    return created


# ============================== Reportar resultados ==============================


def _validate_report(
    match: MatchResult, *, winner_id: int | None, is_draw: bool,
    games_a: int, games_b: int,
) -> None:
    """Validaciones tempranas — falla antes de tocar nada en DB."""
    if match.is_bye:
        raise HTTPException(http_status.HTTP_400_BAD_REQUEST, "Los byes no se reportan manualmente")
    if games_a < 0 or games_b < 0:
        raise HTTPException(http_status.HTTP_400_BAD_REQUEST, "games no pueden ser negativos")
    if is_draw and winner_id is not None:
        raise HTTPException(http_status.HTTP_400_BAD_REQUEST, "Un draw no tiene ganador")
    if not is_draw and winner_id is None:
        raise HTTPException(
            http_status.HTTP_400_BAD_REQUEST,
            "Resultado inválido: marcá draw o indicá un ganador",
        )
    if winner_id is not None and winner_id not in (match.player_a_id, match.player_b_id):
        raise HTTPException(
            http_status.HTTP_400_BAD_REQUEST,
            "El ganador debe ser uno de los jugadores del match",
        )
    if not match.player_b_id and not is_draw:
        # Match con player_b None solo puede ser bye (que ya rechazamos arriba) o setup roto
        raise HTTPException(http_status.HTTP_400_BAD_REQUEST, "Match sin oponente — no se puede reportar")


def _revert_counters(reg_a: EventRegistration, reg_b: EventRegistration, m: MatchResult) -> None:
    if m.reported_at is None:
        return
    if m.is_draw:
        reg_a.rounds_draw -= 1
        reg_b.rounds_draw -= 1
        reg_a.match_points -= 1
        reg_b.match_points -= 1
    elif m.winner_id == m.player_a_id:
        reg_a.rounds_won -= 1
        reg_b.rounds_lost -= 1
        reg_a.match_points -= 3
    elif m.winner_id == m.player_b_id:
        reg_b.rounds_won -= 1
        reg_a.rounds_lost -= 1
        reg_b.match_points -= 3
    reg_a.games_won -= m.games_a
    reg_a.games_lost -= m.games_b
    reg_b.games_won -= m.games_b
    reg_b.games_lost -= m.games_a


def _apply_counters(
    reg_a: EventRegistration, reg_b: EventRegistration,
    *, is_draw: bool, winner_id: int | None, games_a: int, games_b: int,
) -> None:
    if is_draw:
        reg_a.rounds_draw += 1
        reg_b.rounds_draw += 1
        reg_a.match_points += 1
        reg_b.match_points += 1
    elif winner_id == reg_a.player_id:
        reg_a.rounds_won += 1
        reg_b.rounds_lost += 1
        reg_a.match_points += 3
    elif winner_id == reg_b.player_id:
        reg_b.rounds_won += 1
        reg_a.rounds_lost += 1
        reg_b.match_points += 3
    reg_a.games_won += games_a
    reg_a.games_lost += games_b
    reg_b.games_won += games_b
    reg_b.games_lost += games_a


def report_match(
    db: Session, *, match_id: int, winner_id: int | None, is_draw: bool,
    games_a: int, games_b: int, reported_by_user_id: int | None = None,
) -> MatchResult:
    """Reporta el resultado de un match y actualiza los counters de ambos jugadores.

    Idempotente + atómico:
      - Validación temprana antes de tocar DB.
      - Revert + apply de counters va dentro de SAVEPOINT (begin_nested).
        Si algo falla en medio, ambos counters quedan como estaban.
      - Side effects (rating, cache, websocket) son fuera del SAVEPOINT —
        fallar acá no rompe el reporte ya commiteado a counters.
    """
    m = db.get(MatchResult, match_id)
    if not m:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Match no encontrado")

    _validate_report(m, winner_id=winner_id, is_draw=is_draw, games_a=games_a, games_b=games_b)

    reg_a = db.scalar(
        select(EventRegistration).where(
            EventRegistration.event_id == m.event_id,
            EventRegistration.player_id == m.player_a_id,
        )
    )
    reg_b = db.scalar(
        select(EventRegistration).where(
            EventRegistration.event_id == m.event_id,
            EventRegistration.player_id == m.player_b_id,
        )
    ) if m.player_b_id else None

    if not reg_a or not reg_b:
        raise HTTPException(
            http_status.HTTP_500_INTERNAL_SERVER_ERROR,
            "Inscripción inconsistente: jugadores sin registro en el evento",
        )

    # Revert + apply atómico
    with db.begin_nested():
        _revert_counters(reg_a, reg_b, m)
        m.is_draw = is_draw
        m.winner_id = None if is_draw else winner_id
        m.games_a = int(games_a)
        m.games_b = int(games_b)
        m.reported_by_id = reported_by_user_id
        m.reported_at = datetime.now(timezone.utc)
        _apply_counters(
            reg_a, reg_b,
            is_draw=is_draw, winner_id=winner_id,
            games_a=m.games_a, games_b=m.games_b,
        )
        db.flush()

    # Side effects — fuera de la transacción interna. Si fallan, no rompen el counter update.
    try:
        from app.services import rating as rating_svc
        rating_svc.apply_match_rating(
            db, event_id=m.event_id,
            player_a_id=m.player_a_id, player_b_id=m.player_b_id,
            winner_id=m.winner_id, is_draw=m.is_draw,
        )
    except Exception:
        log.exception("apply_match_rating failed for match %s", match_id)

    invalidate_event_cache(m.event_id)

    # Tournament Universe hooks — resilientes, NO rompen el match si fallan
    try:
        from app.services import tournament_universe as univ_svc
        univ_svc.update_rivalry_on_match(db, match=m)
        univ_svc.detect_achievements_on_match(db, match=m)
        univ_svc.settle_match_predictions(db, match=m)
        db.flush()
    except Exception:
        log.exception("tournament_universe hooks failed for match %s", match_id)

    # Competitive robust hooks — bounty transfer on kill
    try:
        from app.services import competitive as cs
        cs.transfer_bounty_on_kill(db, match=m)
        db.flush()
    except Exception:
        log.exception("bounty transfer hook failed for match %s", match_id)

    # Némesis: H2H + EXP doble si era tu archienemigo
    try:
        from app.services import growth as growth_svc
        growth_svc.record_nemesis_match(db, match=m)
    except Exception:
        log.exception("nemesis hook failed for match %s", match_id)

    # Battle Pass XP: 50 winner, 20 loser, 30 each on draw
    try:
        from app.services import battle_pass as bp_svc
        if m.is_draw:
            bp_svc.grant_bp_xp(db, player_id=m.player_a_id, amount=30, reason="match_draw")
            if m.player_b_id:
                bp_svc.grant_bp_xp(db, player_id=m.player_b_id, amount=30, reason="match_draw")
        elif m.winner_id:
            loser_id = m.player_a_id if m.winner_id == m.player_b_id else m.player_b_id
            bp_svc.grant_bp_xp(db, player_id=m.winner_id, amount=50, reason="match_win")
            if loser_id:
                bp_svc.grant_bp_xp(db, player_id=loser_id, amount=20, reason="match_loss")
        db.flush()
    except Exception:
        log.exception("battle_pass XP hook failed for match %s", match_id)

    rt.emit_match_reported(
        m.event_id, m.id, m.round_number,
        winner_id=m.winner_id, is_draw=m.is_draw,
        games_a=m.games_a, games_b=m.games_b,
    )
    rt.emit_standings_updated(m.event_id)
    return m


def drop_player(db: Session, *, event_id: int, player_id: int) -> EventRegistration:
    """Marca al jugador como dropped — no recibirá más pairings."""
    reg = db.scalar(
        select(EventRegistration).where(
            EventRegistration.event_id == event_id,
            EventRegistration.player_id == player_id,
        )
    )
    if not reg:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Inscripción no encontrada")
    reg.dropped = True
    reg.dropped_at = datetime.now(timezone.utc)
    db.flush()

    invalidate_event_cache(event_id)
    player = db.get(PlayerProfile, player_id)
    rt.emit_player_dropped(event_id, player_id, alias=player.alias if player else None)
    rt.emit_standings_updated(event_id)
    return reg


def finalize_positions(db: Session, *, event_id: int) -> int:
    """A partir de standings, asigna final_position a cada inscripción.
    Usa data fresca (sin cache) para evitar inconsistencias en el cierre."""
    standings = _compute_standings_inner(db, event_id=event_id)
    top_id = standings[0].player_id if standings else None
    for s in standings:
        reg = db.scalar(
            select(EventRegistration).where(
                EventRegistration.event_id == event_id,
                EventRegistration.player_id == s.player_id,
            )
        )
        if reg:
            reg.final_position = s.rank
    db.flush()

    # Tournament Universe — al finalizar, settle predicciones + achievements finales
    try:
        from app.services import tournament_universe as univ_svc
        univ_svc.settle_champion_predictions(db, event_id=event_id)
        univ_svc.detect_achievements_on_finalize(db, event_id=event_id)
        db.flush()
    except Exception:
        log.exception("tournament_universe finalize hooks failed for event %s", event_id)

    # Sponsor automation — paga ambassadors basado en final_position
    try:
        from app.services import competitive as cs
        cs.pay_sponsor_bonuses(db, event_id=event_id)
        db.flush()
    except Exception:
        log.exception("sponsor automation failed for event %s", event_id)

    # Battle Pass XP: 200 champion, 100 top 8, 50 participation
    try:
        from app.services import battle_pass as bp_svc
        regs = list(db.scalars(select(EventRegistration).where(
            EventRegistration.event_id == event_id,
            EventRegistration.final_position.is_not(None),
        )))
        for r in regs:
            if r.final_position == 1:
                bp_svc.grant_bp_xp(db, player_id=r.player_id, amount=200, reason="event_champion")
            elif r.final_position <= 8:
                bp_svc.grant_bp_xp(db, player_id=r.player_id, amount=100, reason="event_top8")
            else:
                bp_svc.grant_bp_xp(db, player_id=r.player_id, amount=50, reason="event_participation")
        db.flush()
    except Exception:
        log.exception("battle_pass finalize hook failed for event %s", event_id)

    rt.emit_event_finalized(event_id, top_player_id=top_id)
    return len(standings)


def unfinalize_event(db: Session, *, event_id: int) -> dict:
    """Revierte finalize_positions: limpia final_position de todas las inscripciones.
    NO revierte EXP (eso lo hace el caller con el award_event_exp inverso si aplica).
    """
    event = _lock_event(db, event_id)
    affected = db.execute(
        select(func.count(EventRegistration.id)).where(
            EventRegistration.event_id == event_id,
            EventRegistration.final_position.is_not(None),
        )
    ).scalar() or 0
    for reg in db.scalars(
        select(EventRegistration).where(EventRegistration.event_id == event_id)
    ):
        reg.final_position = None
    db.flush()
    invalidate_event_cache(event_id)
    return {"event_id": event_id, "positions_cleared": affected, "event_name": event.name}
