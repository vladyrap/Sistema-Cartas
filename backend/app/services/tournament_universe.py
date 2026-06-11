"""Services para Tournament Universe — predictions, rivalries, achievements,
hype, storyline.

Hooks: detect_achievements_on_match() y update_rivalry_on_match() son llamados
desde el servicio tournament.report_match() de forma resiliente (try/except).
"""
from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import (
    Event, EventRegistration, MatchResult, PlayerProfile, PlayerRivalry,
    TournamentAchievement, TournamentPrediction, TournamentStoryline,
)

log = logging.getLogger("tournament_universe")


# ═══════════════════════════════════════════════════════════════════════
# Achievement definitions — viven en código, no en DB
# ═══════════════════════════════════════════════════════════════════════


@dataclass(frozen=True)
class AchievementDef:
    key: str
    title: str
    description: str
    icon: str       # emoji
    rarity: str     # common | rare | epic | legendary
    exp_reward: int


ACHIEVEMENTS: dict[str, AchievementDef] = {
    "first_blood":      AchievementDef("first_blood",      "Primera Sangre",       "Ganaste tu primer match del evento", "⚔️", "common", 30),
    "comeback_kid":     AchievementDef("comeback_kid",     "Comeback Kid",         "Ganaste el match después de perder game 1", "🔥", "rare", 60),
    "reverse_sweep":    AchievementDef("reverse_sweep",    "Reverse Sweep",        "Ganaste 2-1 después de estar 0-1", "🌪️", "rare", 60),
    "perfect_game":     AchievementDef("perfect_game",     "Perfect Game",         "Ganaste 2-0 sin que el oponente sume games", "💎", "epic", 100),
    "undefeated":       AchievementDef("undefeated",       "Invicto",              "Terminaste el swiss sin perder ni un match", "👑", "legendary", 300),
    "no_draw":          AchievementDef("no_draw",          "Sin Empates",          "Ningún match terminó en draw", "🎯", "common", 20),
    "x2_byes":          AchievementDef("x2_byes",          "Doble Bye",            "Recibiste 2 byes en el evento", "🍀", "rare", 40),
    "x3_byes":          AchievementDef("x3_byes",          "Triple Bye",           "Recibiste 3 byes en el evento", "🍀🍀", "epic", 80),
    "killer_draw":      AchievementDef("killer_draw",      "Mata Draw",            "Aguantaste un match a draw 1-1 contra el #1 del ranking", "🛡️", "epic", 100),
    "giant_killer":     AchievementDef("giant_killer",     "Giant Killer",         "Venciste a alguien con rating >200 puntos arriba tuyo", "🗡️", "epic", 120),
    "rivalry_clash":    AchievementDef("rivalry_clash",    "Rivalry Clash",        "Te enfrentaste a un rival histórico (3+ matches previos)", "⚡", "rare", 50),
    "top_8":            AchievementDef("top_8",            "Top 8",                "Llegaste al top 8 del evento", "🥇", "epic", 150),
    "podium":           AchievementDef("podium",           "Al Podio",             "Terminaste top 3 del evento", "🏆", "legendary", 250),
    "champion":         AchievementDef("champion",         "Campeón",              "Ganaste el evento", "👑", "legendary", 500),
    "predictor":        AchievementDef("predictor",        "Vidente",              "Acertaste tu predicción de campeón", "🔮", "rare", 80),
    "high_roller":      AchievementDef("high_roller",      "High Roller",          "Apostaste 500+ EXP en predicciones", "💰", "rare", 50),
    "people_pleaser":   AchievementDef("people_pleaser",   "Querido por todos",    "10+ jugadores te apostaron como ganador", "💜", "epic", 100),
    "spectator_favorite":AchievementDef("spectator_favorite","Favorito del Público","Apareciste en 5+ posts del hype feed", "📣", "epic", 80),
    "marathon":         AchievementDef("marathon",         "Maratón",              "Jugaste 6+ rondas en un mismo evento", "🏃", "rare", 50),
    "iron_will":        AchievementDef("iron_will",        "Voluntad de Hierro",   "No droppeaste a pesar de tener 0 victorias en ronda 4+", "🛡️", "epic", 100),
}


# ═══════════════════════════════════════════════════════════════════════
# RIVALRY: actualiza el par tras cada match
# ═══════════════════════════════════════════════════════════════════════


def update_rivalry_on_match(db: Session, *, match: MatchResult) -> PlayerRivalry | None:
    """Update o crea el rivalry pair tras un match reportado."""
    if match.is_bye or not match.player_b_id:
        return None
    low, high = sorted([match.player_a_id, match.player_b_id])
    rivalry = db.scalar(select(PlayerRivalry).where(
        PlayerRivalry.player_low_id == low,
        PlayerRivalry.player_high_id == high,
    ))
    if not rivalry:
        rivalry = PlayerRivalry(player_low_id=low, player_high_id=high)
        db.add(rivalry)
        db.flush()
    rivalry.matches_count += 1
    if match.is_draw:
        rivalry.draws += 1
    elif match.winner_id == low:
        rivalry.wins_low += 1
    elif match.winner_id == high:
        rivalry.wins_high += 1
    rivalry.last_match_at = datetime.now(timezone.utc)
    rivalry.last_event_id = match.event_id
    # Intensity score: matches * (1 - |balance|) * recency_factor
    balance = abs(rivalry.wins_low - rivalry.wins_high) / max(1, rivalry.matches_count)
    rivalry.intensity_score = round(rivalry.matches_count * (1.0 - 0.4 * balance), 3)
    return rivalry


def get_rivalry_between(db: Session, *, a_id: int, b_id: int) -> PlayerRivalry | None:
    low, high = sorted([a_id, b_id])
    return db.scalar(select(PlayerRivalry).where(
        PlayerRivalry.player_low_id == low,
        PlayerRivalry.player_high_id == high,
    ))


# ═══════════════════════════════════════════════════════════════════════
# ACHIEVEMENTS: detect on match + on event finalize
# ═══════════════════════════════════════════════════════════════════════


def _grant(db: Session, *, event_id: int, player_id: int, key: str,
           round_n: int | None = None, extra: dict | None = None) -> TournamentAchievement | None:
    """Otorga achievement si no existe. Idempotente — UNIQUE constraint protege."""
    if key not in ACHIEVEMENTS:
        log.warning("achievement %s no definido", key)
        return None
    existing = db.scalar(select(TournamentAchievement).where(
        TournamentAchievement.event_id == event_id,
        TournamentAchievement.player_id == player_id,
        TournamentAchievement.achievement_key == key,
    ))
    if existing:
        return existing
    ach = TournamentAchievement(
        event_id=event_id, player_id=player_id, achievement_key=key,
        unlocked_round=round_n,
        extra_data=json.dumps(extra) if extra else None,
    )
    db.add(ach)
    # Otorgar EXP
    try:
        from app.services import exp as exp_svc
        exp_svc.award_exp(
            db, player_id=player_id,
            reason_code="achievement",
            amount=ACHIEVEMENTS[key].exp_reward,
            reason=f"Achievement: {ACHIEVEMENTS[key].title}",
            related_event_id=event_id,
        )
    except Exception:
        log.exception("failed to award EXP for achievement %s", key)
    db.flush()
    return ach


def detect_achievements_on_match(db: Session, *, match: MatchResult) -> list[str]:
    """Chequea achievements al reportar un match. Returns lista de keys nuevos."""
    granted: list[str] = []
    if match.is_bye:
        # Contar byes del player_a en el evento
        bye_count = db.scalar(select(func.count(MatchResult.id)).where(
            MatchResult.event_id == match.event_id,
            MatchResult.player_a_id == match.player_a_id,
            MatchResult.is_bye.is_(True),
        )) or 0
        if bye_count >= 3:
            _grant(db, event_id=match.event_id, player_id=match.player_a_id, key="x3_byes",
                   round_n=match.round_number, extra={"bye_count": bye_count})
            granted.append("x3_byes")
        elif bye_count == 2:
            _grant(db, event_id=match.event_id, player_id=match.player_a_id, key="x2_byes",
                   round_n=match.round_number)
            granted.append("x2_byes")
        return granted

    if not match.winner_id or match.is_draw:
        return granted

    winner_id = match.winner_id
    loser_id = match.player_a_id if winner_id == match.player_b_id else match.player_b_id

    # Perfect Game: 2-0
    games_w = match.games_a if winner_id == match.player_a_id else match.games_b
    games_l = match.games_b if winner_id == match.player_a_id else match.games_a
    if games_w >= 2 and games_l == 0:
        _grant(db, event_id=match.event_id, player_id=winner_id, key="perfect_game",
               round_n=match.round_number, extra={"score": f"{games_w}-{games_l}"})
        granted.append("perfect_game")
    # Reverse Sweep: 2-1 con el primero perdido
    if games_w == 2 and games_l == 1:
        _grant(db, event_id=match.event_id, player_id=winner_id, key="reverse_sweep",
               round_n=match.round_number)
        granted.append("reverse_sweep")

    # First Blood: primera victoria del jugador en este evento
    prev_wins = db.scalar(select(func.count(MatchResult.id)).where(
        MatchResult.event_id == match.event_id,
        MatchResult.winner_id == winner_id,
        MatchResult.id != match.id,
    )) or 0
    if prev_wins == 0:
        _grant(db, event_id=match.event_id, player_id=winner_id, key="first_blood",
               round_n=match.round_number)
        granted.append("first_blood")

    # Rivalry Clash: ya tenían 3+ matches previos entre ellos
    if loser_id:
        rivalry = get_rivalry_between(db, a_id=winner_id, b_id=loser_id)
        if rivalry and rivalry.matches_count >= 3:
            _grant(db, event_id=match.event_id, player_id=winner_id, key="rivalry_clash",
                   round_n=match.round_number, extra={"matches": rivalry.matches_count})
            granted.append("rivalry_clash")

    return granted


def detect_achievements_on_finalize(db: Session, *, event_id: int) -> int:
    """Al finalizar el evento, detecta achievements basados en standings completos."""
    total_granted = 0
    regs = list(db.scalars(select(EventRegistration).where(EventRegistration.event_id == event_id)))
    if not regs:
        return 0

    # Champion / Podium / Top 8 basado en final_position
    for r in regs:
        if r.final_position is None:
            continue
        if r.final_position == 1:
            if _grant(db, event_id=event_id, player_id=r.player_id, key="champion"):
                total_granted += 1
        if r.final_position <= 3:
            if _grant(db, event_id=event_id, player_id=r.player_id, key="podium"):
                total_granted += 1
        if r.final_position <= 8:
            if _grant(db, event_id=event_id, player_id=r.player_id, key="top_8"):
                total_granted += 1

        # Undefeated: rounds_won >= 3 y rounds_lost = 0 (excluyendo draws)
        if r.rounds_lost == 0 and r.rounds_won >= 3:
            if _grant(db, event_id=event_id, player_id=r.player_id, key="undefeated",
                      extra={"record": f"{r.rounds_won}W-{r.rounds_lost}L-{r.rounds_draw}D"}):
                total_granted += 1
        # No draws
        if r.rounds_draw == 0 and (r.rounds_won + r.rounds_lost) >= 3:
            if _grant(db, event_id=event_id, player_id=r.player_id, key="no_draw"):
                total_granted += 1
        # Marathon: 6+ rondas jugadas
        played = r.rounds_won + r.rounds_lost + r.rounds_draw
        if played >= 6:
            if _grant(db, event_id=event_id, player_id=r.player_id, key="marathon"):
                total_granted += 1

    return total_granted


# ═══════════════════════════════════════════════════════════════════════
# PREDICTIONS: settle al cerrar evento
# ═══════════════════════════════════════════════════════════════════════


def settle_match_predictions(db: Session, *, match: MatchResult) -> int:
    """Al reportar un match, resuelve las predicciones de tipo 'match' para ese
    match_id. Payouts proporcionales al stake entre los winners."""
    if match.is_draw or not match.winner_id:
        # Draws devuelven stake (no win / no loss)
        preds = list(db.scalars(select(TournamentPrediction).where(
            TournamentPrediction.target_kind == "match",
            TournamentPrediction.predicted_target_id == match.id,
            TournamentPrediction.settled_at.is_(None),
        )))
        for p in preds:
            p.is_winner = False
            p.payout_exp = p.stake_exp  # refund
            p.settled_at = datetime.now(timezone.utc)
            try:
                from app.services import exp as exp_svc
                exp_svc.award_exp(
                    db, player_id=p.bettor_player_id,
                    reason_code="prediction_refund", amount=p.stake_exp,
                    reason=f"Match #{match.id} terminó draw — refund",
                    related_event_id=match.event_id,
                )
            except Exception:
                log.exception("refund failed")
        return len(preds)

    preds = list(db.scalars(select(TournamentPrediction).where(
        TournamentPrediction.target_kind == "match",
        TournamentPrediction.predicted_target_id == match.id,
        TournamentPrediction.settled_at.is_(None),
    )))
    if not preds:
        return 0

    total_pool = sum(p.stake_exp for p in preds)
    winners = [p for p in preds if p.predicted_winner_id == match.winner_id]
    winners_stake_total = sum(p.stake_exp for p in winners) or 1

    now = datetime.now(timezone.utc)
    for p in preds:
        p.settled_at = now
        if p.predicted_winner_id == match.winner_id:
            p.is_winner = True
            p.payout_exp = round(p.stake_exp / winners_stake_total * total_pool)
            try:
                from app.services import exp as exp_svc
                exp_svc.award_exp(
                    db, player_id=p.bettor_player_id,
                    reason_code="prediction_win", amount=p.payout_exp,
                    reason=f"Predicción correcta match #{match.id}",
                    related_event_id=match.event_id,
                )
            except Exception:
                log.exception("payout failed")
        else:
            p.is_winner = False
            p.payout_exp = 0
    return len(preds)


def settle_champion_predictions(db: Session, *, event_id: int) -> int:
    """Cuando el evento finaliza, resuelve las predicciones de campeón."""
    champion_reg = db.scalar(select(EventRegistration).where(
        EventRegistration.event_id == event_id,
        EventRegistration.final_position == 1,
    ))
    if not champion_reg:
        return 0
    champion_id = champion_reg.player_id

    preds = list(db.scalars(select(TournamentPrediction).where(
        TournamentPrediction.target_kind == "champion",
        TournamentPrediction.predicted_target_id == event_id,
        TournamentPrediction.settled_at.is_(None),
    )))
    if not preds:
        return 0

    total_pool = sum(p.stake_exp for p in preds)
    winners = [p for p in preds if p.predicted_winner_id == champion_id]
    winners_stake_total = sum(p.stake_exp for p in winners) or 1

    now = datetime.now(timezone.utc)
    for p in preds:
        p.settled_at = now
        if p.predicted_winner_id == champion_id:
            p.is_winner = True
            p.payout_exp = round(p.stake_exp / winners_stake_total * total_pool)
            try:
                from app.services import exp as exp_svc
                exp_svc.award_exp(
                    db, player_id=p.bettor_player_id,
                    reason_code="prediction_champion",
                    amount=p.payout_exp,
                    reason=f"Predicción correcta de campeón evento #{event_id}",
                    related_event_id=event_id,
                )
                # Achievement: predictor
                _grant(db, event_id=event_id, player_id=p.bettor_player_id, key="predictor")
            except Exception:
                log.exception("champion payout failed")
        else:
            p.is_winner = False
            p.payout_exp = 0

    return len(preds)


# ═══════════════════════════════════════════════════════════════════════
# STORYLINE: Claude genera la narrativa
# ═══════════════════════════════════════════════════════════════════════


def _build_storyline_prompt(db: Session, *, event_id: int) -> tuple[str, str]:
    """Construye prompt para Claude con el contexto completo del evento."""
    ev = db.get(Event, event_id)
    standings = list(db.scalars(select(EventRegistration).where(
        EventRegistration.event_id == event_id,
        EventRegistration.final_position.is_not(None),
    ).order_by(EventRegistration.final_position).limit(8)))

    lines: list[str] = []
    for r in standings:
        p = db.get(PlayerProfile, r.player_id)
        lines.append(
            f"#{r.final_position} {p.alias if p else r.player_id} — "
            f"{r.rounds_won}W {r.rounds_lost}L {r.rounds_draw}D, MP={r.match_points}"
        )

    # Matches notables (perfect games, reverse sweeps)
    notable = list(db.scalars(select(TournamentAchievement).where(
        TournamentAchievement.event_id == event_id,
        TournamentAchievement.achievement_key.in_(["comeback_kid", "reverse_sweep", "perfect_game", "rivalry_clash", "giant_killer"]),
    )))
    notable_text = []
    for a in notable[:20]:
        p = db.get(PlayerProfile, a.player_id)
        ad = ACHIEVEMENTS.get(a.achievement_key)
        notable_text.append(f"- {p.alias if p else '?'}: {ad.title} en ronda {a.unlocked_round or '?'}")

    system = (
        "Sos un narrador épico de torneos competitivos de Trading Card Games. "
        "Escribís en español de Chile, tono cinematográfico pero accesible. "
        "Generás una narrativa de 4-6 párrafos del torneo: el ambiente, el camino del campeón, "
        "los momentos clave, rivalidades, drama. Si no hay datos suficientes para algo, no inventes — "
        "ceñite a los datos provistos. Output solo el cuerpo de la narrativa, sin headers ni intro."
    )
    user = f"""TORNEO: {ev.name if ev else f'#{event_id}'}

TOP 8 FINAL:
{chr(10).join(lines) or '(sin standings)'}

MOMENTOS NOTABLES:
{chr(10).join(notable_text) or '(sin highlights detectados)'}

Generá la narrativa épica del torneo."""
    return system, user


def generate_storyline(db: Session, *, event_id: int, regenerate: bool = False,
                       admin_user_id: int | None = None) -> TournamentStoryline:
    """Genera la storyline. Si ya existe y regenerate=False, devuelve la existente."""
    existing = db.scalar(select(TournamentStoryline).where(TournamentStoryline.event_id == event_id))
    if existing and not regenerate:
        return existing

    system, user = _build_storyline_prompt(db, event_id=event_id)

    narrative = None
    model_used = "mock"
    if settings.ai_backend == "anthropic" and settings.anthropic_api_key:
        try:
            import anthropic
            client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
            r = client.messages.create(
                model=settings.anthropic_creative_model,
                max_tokens=1200,
                system=system,
                messages=[{"role": "user", "content": user}],
            )
            narrative = r.content[0].text if r.content else None
            model_used = settings.anthropic_creative_model
        except Exception:
            log.exception("anthropic storyline generation failed")

    if not narrative:
        # Mock fallback
        narrative = (
            f"El torneo {db.get(Event, event_id).name if db.get(Event, event_id) else event_id} "
            "fue una batalla intensa. Decks de todos los sabores chocaron en mesas calientes hasta "
            "definir un campeón. Las rondas finales tuvieron drama, mazos meta cayendo ante brews "
            "inesperados, y un tope de cuts donde nadie quería rendirse.\n\n"
            "Configura ANTHROPIC_API_KEY para narrativas reales generadas por Claude."
        )
        model_used = "mock"

    champion_reg = db.scalar(select(EventRegistration).where(
        EventRegistration.event_id == event_id,
        EventRegistration.final_position == 1,
    ))

    if existing:
        existing.narrative = narrative
        existing.model_used = model_used
        existing.champion_player_id = champion_reg.player_id if champion_reg else None
        existing.generated_by_user_id = admin_user_id
        db.flush()
        return existing

    row = TournamentStoryline(
        event_id=event_id,
        narrative=narrative,
        model_used=model_used,
        champion_player_id=champion_reg.player_id if champion_reg else None,
        generated_by_user_id=admin_user_id,
    )
    db.add(row)
    db.flush()
    return row
