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
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable

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
    omw: float  # 0.0 - 1.0
    gw: float
    ogw: float
    dropped: bool
    matches_played: int

    @property
    def rank(self) -> int:
        # rank se setea afuera tras ordenar.
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
    """Cálculo real sin cache. Usado por compute_standings (cacheado) y por
    invalidaciones internas."""
    regs = list(
        db.scalars(select(EventRegistration).where(EventRegistration.event_id == event_id))
    )
    if not regs:
        return []

    reg_by_player: dict[int, EventRegistration] = {r.player_id: r for r in regs}

    # Pre-cómputo: MW% y GW% por jugador.
    mw_cache = {pid: _mw_pct(reg) for pid, reg in reg_by_player.items()}
    gw_cache = {pid: _gw_pct(reg) for pid, reg in reg_by_player.items()}

    # OMW% y OGW% por jugador.
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

    rows.sort(
        key=lambda r: (r.match_points, r.omw, r.gw, r.ogw),
        reverse=True,
    )
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

    - Ordena jugadores activos (no dropped) por MP DESC con tiebreakers.
    - Empareja greedy evitando rematches; si el evitar rematch deja a alguien
      colgado, se permite repetir.
    - Si queda número impar, el último (menor MP) recibe bye.
    """
    standings = compute_standings(db, event_id=event_id)
    active = [s for s in standings if not s.dropped]
    if not active:
        return []

    # Map de oponentes previos por jugador.
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
        # Buscar el primer oponente válido (no jugado) desde el más cercano en standings.
        partner = None
        for j in range(i + 1, len(queue)):
            b = queue[j]
            if b.player_id in paired:
                continue
            if b.player_id not in opps_map[a.player_id]:
                partner = b
                break
        # Si nadie quedó disponible sin rematch, permitir rematch con el primero libre.
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
            # No queda nadie → bye automático.
            pairings.append(PairingProposal(
                table_number=table,
                player_a_id=a.player_id,
                player_b_id=None,
            ))
            paired.add(a.player_id)
            table += 1
        i += 1

    return pairings


def persist_pairings(
    db: Session, *, event_id: int, pairings: list[PairingProposal]
) -> list[MatchResult]:
    """Crea MatchResult rows para una nueva ronda. Aplica bye automáticamente
    (winner_a=player_a, games 2-0). Devuelve los matches creados."""
    next_round = _current_round_number(db, event_id) + 1
    created: list[MatchResult] = []
    for p in pairings:  # noqa: PLR1702
        if p.player_b_id is None:
            # Bye: gana automático.
            m = MatchResult(
                event_id=event_id, round_number=next_round, table_number=p.table_number,
                player_a_id=p.player_a_id, player_b_id=None,
                winner_id=p.player_a_id, is_bye=True,
                games_a=2, games_b=0,
            )
            # Aplicar puntaje inmediato.
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
    try:
        from app.services.cache import invalidate_event
        invalidate_event(event_id)
    except Exception:
        pass
    rt.emit_round_started(event_id, next_round, len(created))
    rt.emit_standings_updated(event_id)
    return created


# ============================== Reportar resultados ==============================


def report_match(
    db: Session, *, match_id: int, winner_id: int | None, is_draw: bool,
    games_a: int, games_b: int, reported_by_user_id: int | None = None,
) -> MatchResult:
    """Reporta el resultado de un match y actualiza los counters de ambos jugadores.

    Idempotente: si el match ya tenía resultado, revertimos el viejo y aplicamos el nuevo.
    """
    from datetime import datetime, timezone
    m = db.get(MatchResult, match_id)
    if not m:
        from fastapi import HTTPException, status as st
        raise HTTPException(st.HTTP_404_NOT_FOUND, "Match no encontrado")
    if m.is_bye:
        from fastapi import HTTPException, status as st
        raise HTTPException(st.HTTP_400_BAD_REQUEST, "Los byes no se reportan manualmente")

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

    # Revertir resultado anterior si lo había.
    if m.reported_at is not None and reg_a and reg_b:
        if m.is_draw:
            reg_a.rounds_draw -= 1; reg_b.rounds_draw -= 1
            reg_a.match_points -= 1; reg_b.match_points -= 1
        elif m.winner_id == m.player_a_id:
            reg_a.rounds_won -= 1; reg_b.rounds_lost -= 1
            reg_a.match_points -= 3
        elif m.winner_id == m.player_b_id:
            reg_b.rounds_won -= 1; reg_a.rounds_lost -= 1
            reg_b.match_points -= 3
        reg_a.games_won -= m.games_a; reg_a.games_lost -= m.games_b
        reg_b.games_won -= m.games_b; reg_b.games_lost -= m.games_a

    # Aplicar resultado nuevo.
    m.is_draw = is_draw
    m.winner_id = None if is_draw else winner_id
    m.games_a = max(0, int(games_a))
    m.games_b = max(0, int(games_b))
    m.reported_by_id = reported_by_user_id
    m.reported_at = datetime.now(timezone.utc)

    if reg_a and reg_b:
        if is_draw:
            reg_a.rounds_draw += 1; reg_b.rounds_draw += 1
            reg_a.match_points += 1; reg_b.match_points += 1
        elif winner_id == m.player_a_id:
            reg_a.rounds_won += 1; reg_b.rounds_lost += 1
            reg_a.match_points += 3
        elif winner_id == m.player_b_id:
            reg_b.rounds_won += 1; reg_a.rounds_lost += 1
            reg_b.match_points += 3
        reg_a.games_won += m.games_a; reg_a.games_lost += m.games_b
        reg_b.games_won += m.games_b; reg_b.games_lost += m.games_a

    db.flush()
    # Aplicar rating Glicko-2 si el evento es ranked.
    try:
        from app.services import rating as rating_svc
        rating_svc.apply_match_rating(
            db, event_id=m.event_id,
            player_a_id=m.player_a_id, player_b_id=m.player_b_id,
            winner_id=m.winner_id, is_draw=m.is_draw,
        )
    except Exception:
        # No bloquear el reporte si rating falla — log y continuar.
        import logging
        logging.getLogger(__name__).exception("apply_match_rating failed for match %s", match_id)
    # Invalidar cache de standings del evento.
    try:
        from app.services.cache import invalidate_event
        invalidate_event(m.event_id)
    except Exception:
        pass
    rt.emit_match_reported(
        m.event_id, m.id, m.round_number,
        winner_id=m.winner_id, is_draw=m.is_draw,
        games_a=m.games_a, games_b=m.games_b,
    )
    rt.emit_standings_updated(m.event_id)
    return m


def drop_player(db: Session, *, event_id: int, player_id: int) -> EventRegistration:
    """Marca al jugador como dropped — no recibirá más pairings."""
    from datetime import datetime, timezone
    from fastapi import HTTPException, status as st
    reg = db.scalar(
        select(EventRegistration).where(
            EventRegistration.event_id == event_id,
            EventRegistration.player_id == player_id,
        )
    )
    if not reg:
        raise HTTPException(st.HTTP_404_NOT_FOUND, "Inscripción no encontrada")
    reg.dropped = True
    reg.dropped_at = datetime.now(timezone.utc)
    db.flush()
    try:
        from app.services.cache import invalidate_event
        invalidate_event(event_id)
    except Exception:
        pass
    player = db.get(PlayerProfile, player_id)
    rt.emit_player_dropped(event_id, player_id, alias=player.alias if player else None)
    rt.emit_standings_updated(event_id)
    return reg


def finalize_positions(db: Session, *, event_id: int) -> int:
    """A partir de standings, asigna final_position a cada inscripción.
    Llamarlo cuando el evento se acaba antes de award_event_exp.
    Devuelve cantidad de inscritos con posición asignada."""
    standings = compute_standings(db, event_id=event_id)
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
    rt.emit_event_finalized(event_id, top_player_id=top_id)
    return len(standings)
