"""Endpoints de IA: deck analyzer + weekly summary del Gremio."""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel
from sqlalchemy import func, select

from app.core.deps import DbDep, GuildContext, UserDep, ScopedAdminDep
from app.core.rate_limit import limiter
from app.models import (
    AdminActionLog, Event, EventRegistration, EventStatus, ExpTransaction,
    GuildJoinRequest, GuildMembership, JoinRequestStatus, PlayerDeck, PlayerProfile, Season, SeasonStatus,
)
from app.services import ai_chat

router = APIRouter()


# ============================== Deck analyzer ==============================


DECK_ANALYZER_SYSTEM = """You are a TCG deck analyst with expertise across Magic: The Gathering, Pokémon TCG, Yu-Gi-Oh!, One Piece TCG, Union Arena, Hololive Card Game, and other major card games.

Analyze the user's deck list and respond ONLY with valid JSON in this exact shape:

{
  "game": "<best guess at the game name>",
  "archetype": "<archetype like 'Aggro Red', 'Midrange', 'Control', 'Combo Spirits', etc.>",
  "strengths": ["<bullet 1>", "<bullet 2>", "<bullet 3>"],
  "weaknesses": ["<bullet 1>", "<bullet 2>"],
  "suggestions": ["<concrete card/strategy suggestion 1>", "<suggestion 2>"],
  "summary": "<2-3 sentence overall assessment>"
}

Be concise. Each bullet under 80 chars. Output ONLY the JSON, no preamble or markdown."""


class DeckAnalysisOut(BaseModel):
    game: str | None = None
    archetype: str | None = None
    strengths: list[str] = []
    weaknesses: list[str] = []
    suggestions: list[str] = []
    summary: str | None = None
    raw: str | None = None
    error: str | None = None


@router.post("/decks/{deck_id}/analyze", response_model=DeckAnalysisOut)
@limiter.limit("10/hour")
def analyze_deck(deck_id: int, request: Request, db: DbDep, current: UserDep) -> DeckAnalysisOut:
    """Analiza un deck del jugador autenticado con Claude.

    El jugador debe poseer el deck. Rate limit 10/h para evitar abuso de tokens.
    """
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    deck = db.get(PlayerDeck, deck_id)
    if not deck or deck.player_id != current.profile.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Deck no encontrado")
    if not deck.list_text or len(deck.list_text.strip()) < 10:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "El deck no tiene lista cargada (mínimo 10 caracteres)",
        )

    prompt = (
        f"Deck name: {deck.name}\n"
        f"Archetype hint: {deck.archetype or 'unknown'}\n"
        f"Notes: {deck.notes or 'none'}\n\n"
        f"Deck list:\n{deck.list_text}\n"
    )
    result = ai_chat.complete_json(prompt, system=DECK_ANALYZER_SYSTEM, max_tokens=800)

    return DeckAnalysisOut(
        game=result.get("game"),
        archetype=result.get("archetype"),
        strengths=result.get("strengths", []),
        weaknesses=result.get("weaknesses", []),
        suggestions=result.get("suggestions", []),
        summary=result.get("summary"),
        raw=result.get("raw"),
        error=result.get("error"),
    )


# ============================== Guild weekly summary ==============================


SUMMARY_SYSTEM = """You are an analytics assistant for a TCG community platform.
You receive structured metrics about a 'Guild' (a local TCG store community) for the past 7 days.
Write a friendly summary in Spanish (Chilean tone, but professional), 100-150 words, that:
1. Highlights what went well (new members, busy events, top earners).
2. Notes concerns (low attendance, drop in activity, joining requests pendientes).
3. Suggests 1-2 concrete actions for the Master (Maestro del Gremio).

Output PLAIN TEXT only, no markdown formatting, no headers. Direct prose."""


class SummaryOut(BaseModel):
    summary: str
    metrics: dict


@router.post("/guilds/{guild_id}/weekly-summary", response_model=SummaryOut)
@limiter.limit("20/hour")
def weekly_summary(
    guild_id: int, request: Request, *,
    db: DbDep, admin: ScopedAdminDep, guild: GuildContext,
) -> SummaryOut:
    """Resumen semanal del Gremio generado por IA."""
    if not guild or guild.id != guild_id:
        # Validamos que el header X-Guild-Id matche el path
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Mismatch de Gremio")

    cutoff = datetime.now(timezone.utc) - timedelta(days=7)

    # Métricas crudas
    new_members = db.scalar(
        select(func.count(GuildMembership.id)).where(
            GuildMembership.guild_id == guild_id,
            GuildMembership.is_active.is_(True),
            GuildMembership.joined_at >= cutoff,
        )
    ) or 0
    total_members = db.scalar(
        select(func.count(GuildMembership.id)).where(
            GuildMembership.guild_id == guild_id,
            GuildMembership.is_active.is_(True),
        )
    ) or 0
    pending_requests = db.scalar(
        select(func.count(GuildJoinRequest.id)).where(
            GuildJoinRequest.guild_id == guild_id,
            GuildJoinRequest.status == JoinRequestStatus.PENDING,
        )
    ) or 0
    events_this_week = db.scalar(
        select(func.count(Event.id)).where(
            Event.guild_id == guild_id,
            Event.starts_at >= cutoff,
        )
    ) or 0
    events_finished = db.scalar(
        select(func.count(Event.id)).where(
            Event.guild_id == guild_id,
            Event.status == EventStatus.FINISHED,
            Event.ends_at >= cutoff,
        )
    ) or 0
    # EXP repartida
    active = db.scalar(select(Season).where(Season.guild_id == guild_id, Season.status == SeasonStatus.ACTIVE))
    exp_total_week = 0
    top_earners: list[tuple[str, int]] = []
    if active:
        exp_total_week = db.scalar(
            select(func.coalesce(func.sum(ExpTransaction.amount), 0)).where(
                ExpTransaction.season_id == active.id,
                ExpTransaction.created_at >= cutoff,
                ExpTransaction.amount > 0,
            )
        ) or 0
        top_rows = db.execute(
            select(PlayerProfile.alias, func.sum(ExpTransaction.amount))
            .join(PlayerProfile, ExpTransaction.player_id == PlayerProfile.id)
            .where(
                ExpTransaction.season_id == active.id,
                ExpTransaction.created_at >= cutoff,
                ExpTransaction.amount > 0,
            )
            .group_by(PlayerProfile.alias)
            .order_by(func.sum(ExpTransaction.amount).desc())
            .limit(3)
        ).all()
        top_earners = [(alias, int(amt)) for alias, amt in top_rows]

    metrics = {
        "guild_name": guild.name,
        "total_members": total_members,
        "new_members_7d": new_members,
        "pending_join_requests": pending_requests,
        "events_scheduled_7d": events_this_week,
        "events_finished_7d": events_finished,
        "exp_distributed_7d": int(exp_total_week),
        "top_earners": [{"alias": a, "exp": e} for a, e in top_earners],
        "active_season": active.name if active else None,
    }

    import json as _json
    prompt = f"Métricas del Gremio en los últimos 7 días:\n\n{_json.dumps(metrics, ensure_ascii=False, indent=2)}"
    text = ai_chat.complete(prompt, system=SUMMARY_SYSTEM, max_tokens=400)

    return SummaryOut(summary=text, metrics=metrics)
