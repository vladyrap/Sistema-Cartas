"""Skill Ceiling Estimator — proyección del techo Glicko del jugador.

Heurística simple (sin ML):
  - Tu rating Glicko actual + RD (rating deviation) son la base
  - Tomamos los últimos 20 matches y calculamos:
    * win_rate
    * promedio de rating de oponentes (proxy de la "altura" de tus rivales)
  - Ceiling proyectado = rating_actual + bonus_winrate + bonus_quality_rivales
  - Confidence = inversa de RD (mientras más matches, más cierta la proyección)
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import desc, or_, select

from app.core.deps import DbDep, UserDep
from app.models import Event, EventType, MatchResult, PlayerProfile, PlayerRating

router = APIRouter()

RANKED_TYPES = {
    EventType.COMPETITIVE,
    EventType.ELITE_CHALLENGE,
    EventType.FINAL_ELITE,
    EventType.MONTHLY_LEAGUE,
}


class CeilingOut(BaseModel):
    game_id: int | None = None
    game_name: str | None = None
    rating: float
    rd: float
    peak: float
    projected_ceiling: float
    confidence: float  # 0.0..1.0
    matches_last_30d: int
    win_rate_recent: float
    avg_opponent_rating: float | None = None
    explanation: str


@router.get("/me", response_model=CeilingOut)
def my_ceiling(current: UserDep, db: DbDep, game_id: int | None = None) -> CeilingOut:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    pid = current.profile.id

    # Si no se manda game_id, tomamos el rating con más matches del jugador
    q = select(PlayerRating).where(PlayerRating.player_id == pid)
    if game_id:
        q = q.where(PlayerRating.game_id == game_id)
    else:
        q = q.order_by(desc(PlayerRating.matches_played))
    rating_row = db.scalars(q.limit(1)).first()
    if not rating_row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Sin ratings registrados")

    # Resolver nombre del juego
    from app.models import Game
    game = db.get(Game, rating_row.game_id)

    # Últimos 30 días de matches
    cutoff = datetime.now(timezone.utc) - timedelta(days=30)
    matches = list(db.scalars(
        select(MatchResult)
        .join(Event, MatchResult.event_id == Event.id)
        .where(
            or_(MatchResult.player_a_id == pid, MatchResult.player_b_id == pid),
            MatchResult.created_at >= cutoff,
            Event.event_type.in_(RANKED_TYPES),
        )
        .order_by(desc(MatchResult.created_at))
        .limit(30)
    ))

    won = 0
    opp_ratings: list[float] = []
    for m in matches:
        is_a = m.player_a_id == pid
        opp_id = m.player_b_id if is_a else m.player_a_id
        if m.winner_id == pid:
            won += 1
        # Rating del oponente en el mismo game
        if opp_id:
            opp_rating = db.scalar(
                select(PlayerRating.rating).where(
                    PlayerRating.player_id == opp_id,
                    PlayerRating.game_id == rating_row.game_id,
                )
            )
            if opp_rating is not None:
                opp_ratings.append(float(opp_rating))

    n = len(matches)
    win_rate = (won / n) if n else 0.0
    avg_opp = sum(opp_ratings) / len(opp_ratings) if opp_ratings else None

    # Ceiling: rating actual + bonus por win rate sobre 50% + bonus por jugar contra rating alto
    bonus_winrate = (win_rate - 0.5) * 200  # +100 si winrate 100%, -100 si 0%
    bonus_quality = 0.0
    if avg_opp is not None and avg_opp > rating_row.rating:
        # Si juegas contra promedio mayor a ti, hay margen para crecer
        bonus_quality = min(150, (avg_opp - rating_row.rating) * 0.5)
    elif avg_opp is not None and avg_opp < rating_row.rating - 200:
        # Si juegas contra mucho más bajos, tu techo está limitado
        bonus_quality = -50

    projected = rating_row.rating + bonus_winrate + bonus_quality
    projected = max(rating_row.rating, projected)  # nunca menos que el actual
    projected = min(projected, 2800)  # cap razonable

    # Confidence: max(0, 1 - rd/300) — RD bajo = alta confianza
    confidence = max(0.0, min(1.0, 1.0 - (rating_row.rd / 300.0)))

    # Explicación human-readable
    if n == 0:
        expl = "No has jugado matches recientes. Necesitas datos para proyectar."
    elif win_rate >= 0.7:
        expl = f"Estás dominando ({int(win_rate*100)}% WR). Tu techo es alto."
    elif win_rate >= 0.55:
        expl = f"Buena forma ({int(win_rate*100)}% WR). Subiendo escalones."
    elif win_rate >= 0.45:
        expl = f"En equilibrio ({int(win_rate*100)}% WR). Justo donde está tu rating."
    else:
        expl = f"Mala racha ({int(win_rate*100)}% WR). Cambiar deck o estrategia ayudaría."

    return CeilingOut(
        game_id=rating_row.game_id,
        game_name=game.name if game else None,
        rating=float(rating_row.rating),
        rd=float(rating_row.rd),
        peak=float(rating_row.peak_rating),
        projected_ceiling=round(projected, 1),
        confidence=round(confidence, 3),
        matches_last_30d=n,
        win_rate_recent=round(win_rate * 100, 1),
        avg_opponent_rating=round(avg_opp, 1) if avg_opp else None,
        explanation=expl,
    )
