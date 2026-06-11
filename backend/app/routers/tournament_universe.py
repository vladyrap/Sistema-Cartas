"""Tournament Universe — predictions, rivalries, hype, achievements, storyline."""
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, desc, func, or_, select
from sqlalchemy.exc import IntegrityError

from app.core.deps import AdminDep, DbDep, UserDep, OptionalUserDep
from app.core.rate_limit import limiter
from app.models import (
    Event, EventRegistration, MatchResult, PlayerProfile, PlayerRivalry,
    SeasonProgress, TournamentAchievement, TournamentHypeEvent,
    TournamentHypeReaction, TournamentPrediction, TournamentStoryline,
)
from app.services import exp as exp_svc
from app.services import tournament_universe as univ_svc

router = APIRouter()


# ═══════════════════════════════════════════════════════════════════════
# PREDICTIONS
# ═══════════════════════════════════════════════════════════════════════


class PredictionIn(BaseModel):
    target_kind: Literal["match", "champion"]
    predicted_target_id: int
    predicted_winner_id: int
    stake_exp: int = Field(ge=10, le=5000)


class PredictionOut(BaseModel):
    id: int
    event_id: int
    target_kind: str
    predicted_target_id: int
    predicted_winner_id: int
    predicted_winner_alias: str
    bettor_player_id: int
    bettor_alias: str
    stake_exp: int
    payout_exp: int
    is_winner: bool | None
    settled_at: datetime | None
    created_at: datetime


def _pred_to_out(db, p: TournamentPrediction) -> PredictionOut:
    winner = db.get(PlayerProfile, p.predicted_winner_id)
    bettor = db.get(PlayerProfile, p.bettor_player_id)
    return PredictionOut(
        id=p.id, event_id=p.event_id, target_kind=p.target_kind,
        predicted_target_id=p.predicted_target_id,
        predicted_winner_id=p.predicted_winner_id,
        predicted_winner_alias=winner.alias if winner else f"#{p.predicted_winner_id}",
        bettor_player_id=p.bettor_player_id,
        bettor_alias=bettor.alias if bettor else f"#{p.bettor_player_id}",
        stake_exp=p.stake_exp, payout_exp=p.payout_exp,
        is_winner=p.is_winner, settled_at=p.settled_at, created_at=p.created_at,
    )


@router.post("/events/{event_id}/predictions", response_model=PredictionOut, status_code=201)
@limiter.limit("30/hour")
def place_prediction(
    request: Request, event_id: int, payload: PredictionIn,
    current: UserDep, db: DbDep,
) -> PredictionOut:
    """Coloca una apuesta. Descuenta el stake del balance EXP del bettor."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")

    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")

    # Validar target
    if payload.target_kind == "match":
        m = db.get(MatchResult, payload.predicted_target_id)
        if not m or m.event_id != event_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Match no pertenece a este evento")
        if m.reported_at:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "El match ya fue reportado — no podés apostar")
        if payload.predicted_winner_id not in (m.player_a_id, m.player_b_id or 0):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Winner debe ser uno de los dos players del match")
    elif payload.target_kind == "champion":
        if payload.predicted_target_id != event_id:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "predicted_target_id debe ser el event_id")
        reg = db.scalar(select(EventRegistration).where(
            EventRegistration.event_id == event_id,
            EventRegistration.player_id == payload.predicted_winner_id,
        ))
        if not reg:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "El jugador no está inscrito en este evento")

    # Validar EXP disponible (consultar balance via SeasonProgress.exp_total)
    season = exp_svc.get_active_season(db)
    if not season:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin temporada activa")
    sp = db.scalar(select(SeasonProgress).where(
        SeasonProgress.season_id == season.id,
        SeasonProgress.player_id == current.profile.id,
    ))
    if not sp or sp.exp_total < payload.stake_exp:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "EXP insuficiente para esa apuesta")

    # Descontar EXP via award_exp con amount negativo
    exp_svc.award_exp(
        db, player_id=current.profile.id,
        reason_code="prediction_stake", amount=-payload.stake_exp,
        reason=f"Apuesta {payload.target_kind} evento #{event_id}",
        related_event_id=event_id,
    )

    pred = TournamentPrediction(
        event_id=event_id,
        bettor_player_id=current.profile.id,
        target_kind=payload.target_kind,
        predicted_target_id=payload.predicted_target_id,
        predicted_winner_id=payload.predicted_winner_id,
        stake_exp=payload.stake_exp,
    )
    db.add(pred)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya tenés una apuesta en ese target — eliminala primero si querés cambiar")
    db.refresh(pred)

    # Achievement: high_roller
    if payload.stake_exp >= 500:
        univ_svc._grant(db, event_id=event_id, player_id=current.profile.id, key="high_roller")
        db.commit()
    return _pred_to_out(db, pred)


@router.delete("/predictions/{pred_id}", status_code=204)
def cancel_prediction(pred_id: int, current: UserDep, db: DbDep):
    """Cancela la apuesta y refundea EXP — solo si aún no fue settled."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    p = db.get(TournamentPrediction, pred_id)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Apuesta no encontrada")
    if p.bettor_player_id != current.profile.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No es tu apuesta")
    if p.settled_at is not None:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Apuesta ya resuelta — no se puede cancelar")
    # Para match: si ya empezó (reported_at o cualquier estado), no cancelar
    if p.target_kind == "match":
        m = db.get(MatchResult, p.predicted_target_id)
        if m and m.reported_at:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Match ya empezó")
    # Refund
    exp_svc.award_exp(
        db, player_id=current.profile.id,
        reason_code="prediction_refund", amount=p.stake_exp,
        reason=f"Cancelación apuesta #{p.id}",
        related_event_id=p.event_id,
    )
    db.delete(p)
    db.commit()


@router.get("/events/{event_id}/predictions", response_model=list[PredictionOut])
def list_predictions(event_id: int, db: DbDep, current: OptionalUserDep,
                     target_kind: str | None = None) -> list[PredictionOut]:
    """Lista pública de apuestas del evento."""
    stmt = select(TournamentPrediction).where(TournamentPrediction.event_id == event_id)
    if target_kind:
        stmt = stmt.where(TournamentPrediction.target_kind == target_kind)
    stmt = stmt.order_by(desc(TournamentPrediction.stake_exp))
    rows = list(db.scalars(stmt))
    return [_pred_to_out(db, p) for p in rows]


class PredictionMarketOut(BaseModel):
    """Resumen del mercado para un target específico — qué porcentaje apostó por cada jugador."""
    target_kind: str
    predicted_target_id: int
    total_stake_exp: int
    bets_count: int
    by_winner: list[dict]


@router.get("/events/{event_id}/predictions/market", response_model=list[PredictionMarketOut])
def market_snapshot(event_id: int, db: DbDep) -> list[PredictionMarketOut]:
    """Devuelve el "mercado" actual — para cada target (match/champion), cuánto se apostó por cada jugador."""
    rows = list(db.scalars(select(TournamentPrediction).where(
        TournamentPrediction.event_id == event_id,
    )))
    groups: dict[tuple, dict] = {}
    for p in rows:
        key = (p.target_kind, p.predicted_target_id)
        g = groups.setdefault(key, {"total": 0, "count": 0, "by_winner": {}})
        g["total"] += p.stake_exp
        g["count"] += 1
        w = g["by_winner"].setdefault(p.predicted_winner_id, {"stake": 0, "bets": 0})
        w["stake"] += p.stake_exp
        w["bets"] += 1

    out: list[PredictionMarketOut] = []
    for (tk, tid), g in groups.items():
        by_winner = []
        for pid, info in sorted(g["by_winner"].items(), key=lambda x: -x[1]["stake"]):
            player = db.get(PlayerProfile, pid)
            pct = round(info["stake"] / max(1, g["total"]) * 100, 1)
            implied_payout = round(g["total"] / max(1, info["stake"]), 2)  # multiplier si gana
            by_winner.append({
                "player_id": pid,
                "alias": player.alias if player else f"#{pid}",
                "stake_total": info["stake"],
                "bets": info["bets"],
                "share_pct": pct,
                "implied_multiplier": implied_payout,
            })
        out.append(PredictionMarketOut(
            target_kind=tk, predicted_target_id=tid,
            total_stake_exp=g["total"], bets_count=g["count"],
            by_winner=by_winner,
        ))
    return out


# ═══════════════════════════════════════════════════════════════════════
# RIVALRIES
# ═══════════════════════════════════════════════════════════════════════


class RivalryOut(BaseModel):
    id: int
    player_a_id: int
    player_a_alias: str
    player_b_id: int
    player_b_alias: str
    matches_count: int
    wins_a: int
    wins_b: int
    draws: int
    last_match_at: datetime | None
    intensity_score: float


def _rivalry_to_out(db, r: PlayerRivalry, *, focus_player_id: int | None = None) -> RivalryOut:
    a = db.get(PlayerProfile, r.player_low_id)
    b = db.get(PlayerProfile, r.player_high_id)
    # Si nos pasan focus_player, ordenamos para que aparezca primero
    if focus_player_id == r.player_high_id:
        return RivalryOut(
            id=r.id,
            player_a_id=r.player_high_id, player_a_alias=b.alias if b else f"#{r.player_high_id}",
            player_b_id=r.player_low_id, player_b_alias=a.alias if a else f"#{r.player_low_id}",
            matches_count=r.matches_count, wins_a=r.wins_high, wins_b=r.wins_low,
            draws=r.draws, last_match_at=r.last_match_at, intensity_score=r.intensity_score,
        )
    return RivalryOut(
        id=r.id,
        player_a_id=r.player_low_id, player_a_alias=a.alias if a else f"#{r.player_low_id}",
        player_b_id=r.player_high_id, player_b_alias=b.alias if b else f"#{r.player_high_id}",
        matches_count=r.matches_count, wins_a=r.wins_low, wins_b=r.wins_high,
        draws=r.draws, last_match_at=r.last_match_at, intensity_score=r.intensity_score,
    )


@router.get("/rivalries/top", response_model=list[RivalryOut])
def top_rivalries(db: DbDep, limit: int = 20) -> list[RivalryOut]:
    """Rivalidades más intensas globalmente — score por matches × balance."""
    rows = list(db.scalars(
        select(PlayerRivalry)
        .where(PlayerRivalry.matches_count >= 2)
        .order_by(desc(PlayerRivalry.intensity_score), desc(PlayerRivalry.matches_count))
        .limit(limit)
    ))
    return [_rivalry_to_out(db, r) for r in rows]


@router.get("/rivalries/player/{player_id}", response_model=list[RivalryOut])
def player_rivalries(player_id: int, db: DbDep, limit: int = 10) -> list[RivalryOut]:
    """Rivales del jugador, ordenados por intensidad."""
    rows = list(db.scalars(
        select(PlayerRivalry).where(
            or_(PlayerRivalry.player_low_id == player_id,
                PlayerRivalry.player_high_id == player_id),
            PlayerRivalry.matches_count >= 1,
        ).order_by(desc(PlayerRivalry.intensity_score)).limit(limit)
    ))
    return [_rivalry_to_out(db, r, focus_player_id=player_id) for r in rows]


@router.get("/rivalries/match/{match_id}", response_model=RivalryOut | None)
def rivalry_for_match(match_id: int, db: DbDep) -> RivalryOut | None:
    """Si existe rivalry entre los 2 jugadores del match, la devuelve. Si no, null."""
    m = db.get(MatchResult, match_id)
    if not m or not m.player_b_id or m.is_bye:
        return None
    r = univ_svc.get_rivalry_between(db, a_id=m.player_a_id, b_id=m.player_b_id)
    if not r or r.matches_count < 2:
        return None
    return _rivalry_to_out(db, r, focus_player_id=m.player_a_id)


# ═══════════════════════════════════════════════════════════════════════
# HYPE FEED
# ═══════════════════════════════════════════════════════════════════════


class HypeIn(BaseModel):
    kind: Literal["admin_post", "match_highlight", "rivalry_alert", "system"] = "admin_post"
    content: str = Field(min_length=2, max_length=600)
    image_url: str | None = Field(default=None, max_length=800)


class HypeOut(BaseModel):
    id: int
    event_id: int
    kind: str
    content: str
    image_url: str | None
    author_alias: str | None
    reactions_count: int
    created_at: datetime
    i_reacted: bool = False


def _hype_to_out(db, h: TournamentHypeEvent, *, user_id: int | None = None) -> HypeOut:
    author_alias = None
    if h.author_user_id:
        from app.models import User
        u = db.get(User, h.author_user_id)
        author_alias = (u.profile.alias if u and u.profile else None) or (u.email if u else None)
    i_reacted = False
    if user_id:
        i_reacted = db.scalar(select(func.count(TournamentHypeReaction.id)).where(
            TournamentHypeReaction.hype_event_id == h.id,
            TournamentHypeReaction.user_id == user_id,
        )) > 0
    return HypeOut(
        id=h.id, event_id=h.event_id, kind=h.kind, content=h.content,
        image_url=h.image_url, author_alias=author_alias,
        reactions_count=h.reactions_count, created_at=h.created_at,
        i_reacted=i_reacted,
    )


@router.get("/events/{event_id}/hype", response_model=list[HypeOut])
def list_hype(event_id: int, db: DbDep, current: OptionalUserDep, limit: int = 50) -> list[HypeOut]:
    rows = list(db.scalars(
        select(TournamentHypeEvent)
        .where(TournamentHypeEvent.event_id == event_id)
        .order_by(desc(TournamentHypeEvent.created_at))
        .limit(limit)
    ))
    return [_hype_to_out(db, h, user_id=current.id if current else None) for h in rows]


@router.post("/events/{event_id}/hype", response_model=HypeOut, status_code=201)
def post_hype(event_id: int, payload: HypeIn, admin: AdminDep, db: DbDep) -> HypeOut:
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    h = TournamentHypeEvent(
        event_id=event_id, kind=payload.kind, content=payload.content,
        image_url=payload.image_url, author_user_id=admin.id,
    )
    db.add(h)
    db.commit()
    db.refresh(h)
    return _hype_to_out(db, h, user_id=admin.id)


@router.post("/hype/{hype_id}/react")
@limiter.limit("60/hour")
def react_to_hype(request: Request, hype_id: int, current: UserDep, db: DbDep) -> dict:
    """Toggle reacción. Si ya reaccionó, la quita. Sino, suma."""
    h = db.get(TournamentHypeEvent, hype_id)
    if not h:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Hype event no encontrado")
    existing = db.scalar(select(TournamentHypeReaction).where(
        TournamentHypeReaction.hype_event_id == hype_id,
        TournamentHypeReaction.user_id == current.id,
    ))
    if existing:
        db.delete(existing)
        h.reactions_count = max(0, h.reactions_count - 1)
        action = "removed"
    else:
        db.add(TournamentHypeReaction(hype_event_id=hype_id, user_id=current.id))
        h.reactions_count += 1
        action = "added"
    db.commit()
    return {"action": action, "reactions_count": h.reactions_count}


@router.delete("/hype/{hype_id}", status_code=204)
def delete_hype(hype_id: int, admin: AdminDep, db: DbDep):
    h = db.get(TournamentHypeEvent, hype_id)
    if not h:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No existe")
    db.delete(h)
    db.commit()


# ═══════════════════════════════════════════════════════════════════════
# ACHIEVEMENTS
# ═══════════════════════════════════════════════════════════════════════


class AchievementDefOut(BaseModel):
    key: str
    title: str
    description: str
    icon: str
    rarity: str
    exp_reward: int


class TournamentAchievementOut(BaseModel):
    id: int
    event_id: int
    player_id: int
    player_alias: str
    achievement_key: str
    definition: AchievementDefOut
    unlocked_round: int | None
    created_at: datetime


@router.get("/achievements/catalog", response_model=list[AchievementDefOut])
def achievement_catalog() -> list[AchievementDefOut]:
    """Lista completa de achievements disponibles — útil para mostrarlos en perfil."""
    return [
        AchievementDefOut(key=d.key, title=d.title, description=d.description,
                          icon=d.icon, rarity=d.rarity, exp_reward=d.exp_reward)
        for d in univ_svc.ACHIEVEMENTS.values()
    ]


@router.get("/events/{event_id}/achievements", response_model=list[TournamentAchievementOut])
def event_achievements(event_id: int, db: DbDep) -> list[TournamentAchievementOut]:
    rows = list(db.scalars(
        select(TournamentAchievement)
        .where(TournamentAchievement.event_id == event_id)
        .order_by(desc(TournamentAchievement.created_at))
    ))
    out: list[TournamentAchievementOut] = []
    for a in rows:
        d = univ_svc.ACHIEVEMENTS.get(a.achievement_key)
        if not d:
            continue
        p = db.get(PlayerProfile, a.player_id)
        out.append(TournamentAchievementOut(
            id=a.id, event_id=a.event_id, player_id=a.player_id,
            player_alias=p.alias if p else f"#{a.player_id}",
            achievement_key=a.achievement_key,
            definition=AchievementDefOut(
                key=d.key, title=d.title, description=d.description,
                icon=d.icon, rarity=d.rarity, exp_reward=d.exp_reward,
            ),
            unlocked_round=a.unlocked_round, created_at=a.created_at,
        ))
    return out


@router.get("/players/{player_id}/achievements", response_model=list[TournamentAchievementOut])
def player_achievements(player_id: int, db: DbDep, limit: int = 50) -> list[TournamentAchievementOut]:
    rows = list(db.scalars(
        select(TournamentAchievement)
        .where(TournamentAchievement.player_id == player_id)
        .order_by(desc(TournamentAchievement.created_at))
        .limit(limit)
    ))
    p = db.get(PlayerProfile, player_id)
    out: list[TournamentAchievementOut] = []
    for a in rows:
        d = univ_svc.ACHIEVEMENTS.get(a.achievement_key)
        if not d:
            continue
        out.append(TournamentAchievementOut(
            id=a.id, event_id=a.event_id, player_id=a.player_id,
            player_alias=p.alias if p else f"#{a.player_id}",
            achievement_key=a.achievement_key,
            definition=AchievementDefOut(
                key=d.key, title=d.title, description=d.description,
                icon=d.icon, rarity=d.rarity, exp_reward=d.exp_reward,
            ),
            unlocked_round=a.unlocked_round, created_at=a.created_at,
        ))
    return out


# ═══════════════════════════════════════════════════════════════════════
# STORYLINE
# ═══════════════════════════════════════════════════════════════════════


class StorylineOut(BaseModel):
    id: int
    event_id: int
    title: str | None
    narrative: str
    champion_player_id: int | None
    champion_alias: str | None
    model_used: str | None
    is_published: bool
    created_at: datetime


def _storyline_to_out(db, s: TournamentStoryline) -> StorylineOut:
    champion_alias = None
    if s.champion_player_id:
        p = db.get(PlayerProfile, s.champion_player_id)
        champion_alias = p.alias if p else None
    return StorylineOut(
        id=s.id, event_id=s.event_id, title=s.title, narrative=s.narrative,
        champion_player_id=s.champion_player_id, champion_alias=champion_alias,
        model_used=s.model_used, is_published=s.is_published,
        created_at=s.created_at,
    )


@router.get("/events/{event_id}/storyline", response_model=StorylineOut | None)
def get_storyline(event_id: int, db: DbDep) -> StorylineOut | None:
    s = db.scalar(select(TournamentStoryline).where(TournamentStoryline.event_id == event_id))
    return _storyline_to_out(db, s) if s else None


@router.post("/events/{event_id}/storyline/generate", response_model=StorylineOut)
def generate_storyline_endpoint(event_id: int, admin: AdminDep, db: DbDep,
                                regenerate: bool = False) -> StorylineOut:
    """Genera (o regenera con ?regenerate=true) la narrativa del evento."""
    s = univ_svc.generate_storyline(db, event_id=event_id, regenerate=regenerate, admin_user_id=admin.id)
    db.commit()
    return _storyline_to_out(db, s)
