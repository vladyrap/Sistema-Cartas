"""AI Tournament Documentary — narrativa estructurada en escenas del evento.

Genera 5-8 escenas con stats reales + voice over de Claude. El frontend
reproduce las escenas como slideshow cinematic (sin generar video real).
"""
import logging

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import desc, func, select

from app.core.deps import DbDep
from app.models import (
    Event, EventRegistration, MatchResult, PlayerProfile,
)
from app.services import ai_chat

log = logging.getLogger("documentary")
router = APIRouter()


NARRATOR_SYSTEM = """You are a sports/esports documentary narrator with dramatic flair.

You write SHORT voice-over lines for tournament documentary scenes.
Style: Chilean Spanish, slightly dramatic, no clichés like "el destino".
Each line is 1 sentence, 60-120 chars, suitable for a 5-second screen card.

Respond ONLY with the line. No quotes, no preamble."""


class SceneOut(BaseModel):
    kind: str
    title: str
    subtitle: str | None = None
    narration: str
    data: dict = {}
    accent: str = "violet"


class DocumentaryOut(BaseModel):
    event_id: int
    event_name: str
    total_rounds: int
    total_matches: int
    players: int
    scenes: list[SceneOut]


def _narrate(prompt: str, fallback: str) -> str:
    try:
        text = ai_chat.complete(prompt, system=NARRATOR_SYSTEM, max_tokens=120, creative=True).strip()
        if not text or text.startswith("[MOCK]") or text.startswith("[Error AI]"):
            return fallback
        return text[:200]
    except Exception:
        return fallback


@router.get("/events/{event_id}/documentary", response_model=DocumentaryOut)
def documentary(event_id: int, db: DbDep) -> DocumentaryOut:
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")

    # Datos base
    regs = list(db.scalars(select(EventRegistration).where(EventRegistration.event_id == event_id)))
    matches = list(db.scalars(select(MatchResult).where(MatchResult.event_id == event_id)))
    rounds = max((m.round_number for m in matches), default=0)

    if not regs:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Evento sin participantes")

    scenes: list[SceneOut] = []

    # ESCENA 1: Apertura
    scenes.append(SceneOut(
        kind="opening",
        title=ev.name,
        subtitle=f"{len(regs)} jugadores · {rounds} rondas · {len(matches)} matches",
        narration=_narrate(
            f"Open scene for a tournament called '{ev.name}' with {len(regs)} players.",
            f"{len(regs)} jugadores entraron buscando la gloria. Solo uno se la llevará.",
        ),
        accent="violet",
        data={"players": len(regs), "rounds": rounds},
    ))

    # ESCENA 2: Champion
    reg_sorted = sorted(regs, key=lambda r: r.final_position or 9999)
    champion_reg = reg_sorted[0] if reg_sorted else None
    if champion_reg:
        champion = db.get(PlayerProfile, champion_reg.player_id)
        if champion:
            scenes.append(SceneOut(
                kind="champion",
                title="El Campeón",
                subtitle=champion.alias,
                narration=_narrate(
                    f"The champion is {champion.alias}, with {champion_reg.match_points} match points across {rounds} rounds.",
                    f"{champion.alias} dominó {champion_reg.rounds_won} rondas. Su MP final: {champion_reg.match_points}.",
                ),
                accent="amber",
                data={
                    "alias": champion.alias, "elite_id": champion.elite_id_code,
                    "match_points": champion_reg.match_points,
                    "rounds_won": champion_reg.rounds_won,
                },
            ))

    # ESCENA 3: Match más reñido (mayor diff de games en 5+ games)
    competitive = [m for m in matches if not m.is_bye and m.reported_at and (m.games_a + m.games_b) >= 3]
    competitive.sort(key=lambda m: abs(m.games_a - m.games_b))
    if competitive:
        m = competitive[0]
        pa = db.get(PlayerProfile, m.player_a_id)
        pb = db.get(PlayerProfile, m.player_b_id) if m.player_b_id else None
        if pa and pb:
            scenes.append(SceneOut(
                kind="clutch",
                title="El partido más cerrado",
                subtitle=f"{pa.alias} vs {pb.alias} · {m.games_a}-{m.games_b}",
                narration=_narrate(
                    f"The closest match: {pa.alias} vs {pb.alias} ended {m.games_a}-{m.games_b}.",
                    f"{m.games_a}-{m.games_b}. Pudieron ser cualquiera. Decidió uno solo.",
                ),
                accent="rose",
                data={"a": pa.alias, "b": pb.alias, "score": f"{m.games_a}-{m.games_b}"},
            ))

    # ESCENA 4: Player con más victorias
    by_wins = sorted(regs, key=lambda r: r.rounds_won, reverse=True)
    if by_wins and by_wins[0].rounds_won >= 3:
        top_player = db.get(PlayerProfile, by_wins[0].player_id)
        if top_player:
            scenes.append(SceneOut(
                kind="warrior",
                title="El más implacable",
                subtitle=f"{top_player.alias} · {by_wins[0].rounds_won}W-{by_wins[0].rounds_lost}L",
                narration=_narrate(
                    f"{top_player.alias} won {by_wins[0].rounds_won} of {by_wins[0].rounds_won + by_wins[0].rounds_lost} matches.",
                    f"{by_wins[0].rounds_won} victorias. Ningún rival le duró las tres rondas.",
                ),
                accent="emerald",
                data={"alias": top_player.alias, "wins": by_wins[0].rounds_won},
            ))

    # ESCENA 5: Underdog (más MP relativo dado seed bajo)
    # Sin seeding real, tomamos al de menor matches_played que terminó top 8
    underdog = next((r for r in reg_sorted[:8] if r.rounds_won + r.rounds_lost <= rounds - 1 and r.rounds_won >= 2), None)
    if underdog:
        up = db.get(PlayerProfile, underdog.player_id)
        if up:
            scenes.append(SceneOut(
                kind="underdog",
                title="La sorpresa",
                subtitle=up.alias,
                narration=_narrate(
                    f"Underdog story: {up.alias} reached top {underdog.final_position} despite low expectations.",
                    f"Nadie apostaba por {up.alias}. Terminó top {underdog.final_position}.",
                ),
                accent="cyan",
                data={"alias": up.alias, "position": underdog.final_position},
            ))

    # ESCENA 6: Stats globales
    total_games = sum(m.games_a + m.games_b for m in matches if not m.is_bye)
    scenes.append(SceneOut(
        kind="stats",
        title="Por los números",
        subtitle=f"{len(matches)} matches · {total_games} games · {rounds} rondas",
        narration=_narrate(
            f"Stats: {len(matches)} matches, {total_games} individual games.",
            f"{total_games} games jugados. Cada uno una decisión, cada decisión una historia.",
        ),
        accent="fuchsia",
        data={"matches": len(matches), "games": total_games, "rounds": rounds},
    ))

    # ESCENA FINAL
    scenes.append(SceneOut(
        kind="closing",
        title="Y entonces…",
        subtitle="El polvo se asienta",
        narration=_narrate(
            f"Closing scene for tournament {ev.name}.",
            "El torneo termina. Las cartas vuelven a sus mazos. La próxima ya está empezando.",
        ),
        accent="violet",
        data={},
    ))

    return DocumentaryOut(
        event_id=ev.id, event_name=ev.name,
        total_rounds=rounds, total_matches=len(matches),
        players=len(regs),
        scenes=scenes,
    )
