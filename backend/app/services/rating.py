"""Servicio de ratings Glicko-2 + bracket single-elim.

apply_match_rating(): se llama desde tournament.report_match() cuando el
evento es ranked (event_type COMPETITIVE/ELITE_CHALLENGE/FINAL_ELITE/etc).

build_bracket(): toma top N de standings y arma el árbol de eliminación.
"""
from __future__ import annotations

import math
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    BracketNode,
    Event,
    EventBracket,
    EventRegistration,
    EventType,
    PlayerRating,
)
from app.services import glicko2
from app.services import tournament as tour_svc


# Eventos que afectan rating Glicko-2.
RANKED_TYPES = {
    EventType.COMPETITIVE,
    EventType.ELITE_CHALLENGE,
    EventType.FINAL_ELITE,
    EventType.MONTHLY_LEAGUE,
}


def _get_or_create(db: Session, *, player_id: int, game_id: int) -> PlayerRating:
    pr = db.scalar(
        select(PlayerRating).where(
            PlayerRating.player_id == player_id,
            PlayerRating.game_id == game_id,
        )
    )
    if pr:
        return pr
    pr = PlayerRating(player_id=player_id, game_id=game_id)
    db.add(pr)
    db.flush()
    return pr


def apply_match_rating(
    db: Session, *, event_id: int, player_a_id: int, player_b_id: int | None,
    winner_id: int | None, is_draw: bool,
) -> tuple[PlayerRating, PlayerRating | None] | None:
    """Actualiza el rating Glicko-2 de ambos jugadores tras un match.
    Devuelve los ratings nuevos o None si el evento no es ranked / falta data.

    Para byes (player_b_id=None), no aplica rating — el bye es ventaja
    artificial sin oponente real.
    """
    ev = db.get(Event, event_id)
    if not ev or ev.event_type not in RANKED_TYPES:
        return None
    if player_b_id is None:
        return None  # bye

    pr_a = _get_or_create(db, player_id=player_a_id, game_id=ev.game_id)
    pr_b = _get_or_create(db, player_id=player_b_id, game_id=ev.game_id)

    state_a = glicko2.RatingState(rating=pr_a.rating, rd=pr_a.rd, volatility=pr_a.volatility)
    state_b = glicko2.RatingState(rating=pr_b.rating, rd=pr_b.rd, volatility=pr_b.volatility)

    # Score: 1=win, 0.5=draw, 0=loss.
    if is_draw:
        score_a, score_b = 0.5, 0.5
    elif winner_id == player_a_id:
        score_a, score_b = 1.0, 0.0
    elif winner_id == player_b_id:
        score_a, score_b = 0.0, 1.0
    else:
        return None  # winner_id no es ni uno ni otro y no es draw

    new_a = glicko2.update_rating(state_a, [(state_b.rating, state_b.rd, score_a)])
    new_b = glicko2.update_rating(state_b, [(state_a.rating, state_a.rd, score_b)])

    now = datetime.now(timezone.utc)
    pr_a.rating, pr_a.rd, pr_a.volatility = new_a.rating, new_a.rd, new_a.volatility
    pr_a.matches_played += 1
    pr_a.last_match_at = now
    pr_a.peak_rating = max(pr_a.peak_rating, new_a.rating)

    pr_b.rating, pr_b.rd, pr_b.volatility = new_b.rating, new_b.rd, new_b.volatility
    pr_b.matches_played += 1
    pr_b.last_match_at = now
    pr_b.peak_rating = max(pr_b.peak_rating, new_b.rating)

    db.flush()
    return pr_a, pr_b


def leaderboard(db: Session, *, game_id: int, limit: int = 100) -> list[PlayerRating]:
    """Top-N por rating en un juego. Excluye jugadores con menos de 5 matches
    (Glicko-2 todavía no convergió)."""
    return list(
        db.scalars(
            select(PlayerRating)
            .where(PlayerRating.game_id == game_id, PlayerRating.matches_played >= 5)
            .order_by(PlayerRating.rating.desc())
            .limit(limit)
        )
    )


# ============================== Bracket single-elim ==============================


def _next_power_of_two(n: int) -> int:
    return 1 if n < 1 else 2 ** int(math.ceil(math.log2(n)))


def _seed_pairings(size: int) -> list[tuple[int, int]]:
    """Genera el seeding clásico de bracket single-elim para `size` jugadores.

    Devuelve pares (seed_a, seed_b) tal que seed 1 vs seed N, 2 vs N-1, etc.
    pero también respetando el reparto en el árbol para que seeds altos no
    se crucen hasta la final si todos ganan según seed.

    Para size=8: [(1,8),(4,5),(3,6),(2,7)]
    Para size=4: [(1,4),(2,3)]
    """
    # Algoritmo estándar de NCAA-style seeding.
    seeds = list(range(1, size + 1))
    rounds = int(math.log2(size))
    bracket = [1]
    for _ in range(rounds):
        new = []
        n = len(bracket) * 2
        for s in bracket:
            new.append(s)
            new.append(n + 1 - s)
        bracket = new
    # `bracket` tiene el orden de izquierda a derecha del top de los nodos hoja.
    pairings = []
    for i in range(0, len(bracket), 2):
        pairings.append((bracket[i], bracket[i + 1]))
    return pairings


def build_bracket(db: Session, *, event_id: int, size: int = 8) -> EventBracket:
    """Crea el bracket inicial tomando top-`size` de standings.

    Si ya existe un bracket para el evento, levanta error — primero hay que
    delete_bracket().
    """
    from fastapi import HTTPException, status

    existing = db.scalar(select(EventBracket).where(EventBracket.event_id == event_id))
    if existing:
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "Ya hay un bracket para este evento — elimínalo primero",
        )
    if size not in (4, 8, 16, 32):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "size debe ser 4, 8, 16 o 32")

    standings = tour_svc.compute_standings(db, event_id=event_id)
    active = [s for s in standings if not s.dropped]
    if len(active) < size:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"No hay suficientes jugadores activos ({len(active)}/{size})",
        )
    top = active[:size]

    bracket = EventBracket(event_id=event_id, size=size, is_complete=False)
    db.add(bracket)
    db.flush()

    # Nivel del bracket: log2(size) niveles. Las hojas están en el nivel más alto.
    rounds = int(math.log2(size))  # size=8 → 3 niveles (cuartos, semi, final)
    leaf_level = rounds - 1  # 0-indexed desde la final

    # Crear nodos hoja con los pairings de seed.
    seed_pairs = _seed_pairings(size)
    for slot, (seed_a, seed_b) in enumerate(seed_pairs):
        node = BracketNode(
            bracket_id=bracket.id,
            level=leaf_level,
            slot=slot,
            seed_a=seed_a,
            seed_b=seed_b,
            player_a_id=top[seed_a - 1].player_id,
            player_b_id=top[seed_b - 1].player_id,
        )
        db.add(node)

    # Crear nodos vacíos para los niveles superiores (semis, final).
    for level in range(leaf_level - 1, -1, -1):
        for slot in range(2 ** level):
            db.add(BracketNode(bracket_id=bracket.id, level=level, slot=slot))
    db.flush()
    return bracket


def report_bracket_match(
    db: Session, *, node_id: int, winner_id: int, games_a: int, games_b: int,
) -> BracketNode:
    """Reporta el resultado de un nodo del bracket. Avanza el ganador al nodo
    padre. Si es el nodo de la final (level 0), marca bracket como completo.

    También dispara apply_match_rating si el evento es ranked.
    """
    from fastapi import HTTPException, status

    node = db.get(BracketNode, node_id)
    if not node:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Nodo no encontrado")
    if winner_id not in (node.player_a_id, node.player_b_id):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "winner_id debe ser uno de los dos jugadores del nodo",
        )

    # Si ya tenía ganador anterior, revertir su avance.
    if node.winner_id is not None and node.level > 0:
        parent = db.scalar(
            select(BracketNode).where(
                BracketNode.bracket_id == node.bracket_id,
                BracketNode.level == node.level - 1,
                BracketNode.slot == node.slot // 2,
            )
        )
        if parent:
            if node.slot % 2 == 0 and parent.player_a_id == node.winner_id:
                parent.player_a_id = None
                parent.winner_id = None
            elif node.slot % 2 == 1 and parent.player_b_id == node.winner_id:
                parent.player_b_id = None
                parent.winner_id = None

    node.winner_id = winner_id
    node.games_a = max(0, games_a)
    node.games_b = max(0, games_b)

    # Avanzar al padre.
    if node.level > 0:
        parent = db.scalar(
            select(BracketNode).where(
                BracketNode.bracket_id == node.bracket_id,
                BracketNode.level == node.level - 1,
                BracketNode.slot == node.slot // 2,
            )
        )
        if parent:
            if node.slot % 2 == 0:
                parent.player_a_id = winner_id
            else:
                parent.player_b_id = winner_id

    # Si es la final, marcar bracket completo.
    if node.level == 0:
        bracket = db.get(EventBracket, node.bracket_id)
        if bracket:
            bracket.is_complete = True

    # Aplicar rating Glicko-2 si es evento ranked.
    is_draw = False  # bracket single-elim no admite draws
    apply_match_rating(
        db,
        event_id=db.get(EventBracket, node.bracket_id).event_id,
        player_a_id=node.player_a_id,
        player_b_id=node.player_b_id,
        winner_id=winner_id,
        is_draw=is_draw,
    )
    db.flush()
    return node


def get_bracket_tree(db: Session, *, event_id: int) -> dict:
    """Devuelve el bracket completo serializado: {bracket: {...}, nodes: [...]}."""
    bracket = db.scalar(select(EventBracket).where(EventBracket.event_id == event_id))
    if not bracket:
        return {"bracket": None, "nodes": []}
    nodes = list(
        db.scalars(
            select(BracketNode)
            .where(BracketNode.bracket_id == bracket.id)
            .order_by(BracketNode.level, BracketNode.slot)
        )
    )
    return {
        "bracket": {
            "id": bracket.id, "event_id": bracket.event_id,
            "size": bracket.size, "is_complete": bracket.is_complete,
        },
        "nodes": [
            {
                "id": n.id, "level": n.level, "slot": n.slot,
                "player_a_id": n.player_a_id, "player_b_id": n.player_b_id,
                "winner_id": n.winner_id,
                "seed_a": n.seed_a, "seed_b": n.seed_b,
                "games_a": n.games_a, "games_b": n.games_b,
            }
            for n in nodes
        ],
    }
