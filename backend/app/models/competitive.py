"""Competitive Universe — ladder divisions, duels, sparring, guild wars,
team drafts, special events, meta tracker, tier list, bounty bracket, sponsors.

Todos los modelos del bloque competitivo en un archivo para mantener cohesión.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, Float, ForeignKey, Index, Integer,
    String, Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


# ═══════════════════════════════════════════════════════════════════════
# CHALLENGE DUELS — 1v1 directos con apuesta EXP
# ═══════════════════════════════════════════════════════════════════════


class ChallengeDuel(Base, TimestampMixin):
    """Un duelo casual o ranked entre dos jugadores específicos, fuera de torneo.

    Estados:
      PENDING → challenger envió, esperando respuesta
      ACCEPTED → ambos pactaron, juegan; al reportar se settle
      DECLINED, EXPIRED, COMPLETED, CANCELLED
    """
    __tablename__ = "challenge_duels"
    __table_args__ = (
        CheckConstraint("status IN ('PENDING','ACCEPTED','DECLINED','EXPIRED','COMPLETED','CANCELLED')",
                        name="ck_duel_status"),
        CheckConstraint("challenger_id != challenged_id", name="ck_duel_diff_players"),
        CheckConstraint("stake_exp >= 0 AND stake_exp <= 5000", name="ck_duel_stake_range"),
        Index("ix_duel_pair", "challenger_id", "challenged_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    challenger_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    challenged_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    game_id: Mapped[int] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True
    )
    format_id: Mapped[int | None] = mapped_column(ForeignKey("game_formats.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False, index=True)
    stake_exp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    message: Mapped[str | None] = mapped_column(String(300))
    is_ranked: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)

    accepted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    winner_id: Mapped[int | None] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="SET NULL")
    )
    games_challenger: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    games_challenged: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    rating_delta: Mapped[float | None] = mapped_column(Float)  # del winner si is_ranked

    # Dual-confirm: ambos players reportan; settle solo si coinciden
    challenger_reported_winner_id: Mapped[int | None] = mapped_column(Integer)
    challenged_reported_winner_id: Mapped[int | None] = mapped_column(Integer)
    challenger_reported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    challenged_reported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_disputed: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    # Anti-collusion flag
    collusion_flag: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)


# ═══════════════════════════════════════════════════════════════════════
# SPARRING QUEUE — matchmaking casual entre jugadores activos
# ═══════════════════════════════════════════════════════════════════════


class SparringQueueEntry(Base, TimestampMixin):
    """Un jugador en cola de sparring. El matchmaker corre cada 30s y pairs
    jugadores compatibles (mismo game + archetype similar)."""
    __tablename__ = "sparring_queue"
    __table_args__ = (
        UniqueConstraint("player_id", "game_id", name="uq_sparring_player_game"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    game_id: Mapped[int] = mapped_column(
        ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True
    )
    archetype: Mapped[str | None] = mapped_column(String(80))
    deck_id: Mapped[int | None] = mapped_column(ForeignKey("player_decks.id", ondelete="SET NULL"))
    notes: Mapped[str | None] = mapped_column(String(200))
    # Para matchmaker: rating range buscado +/-
    rating_min: Mapped[float | None] = mapped_column(Float)
    rating_max: Mapped[float | None] = mapped_column(Float)
    matched_with_id: Mapped[int | None] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="SET NULL")
    )
    matched_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ═══════════════════════════════════════════════════════════════════════
# GUILD WARS — gremios se enfrentan semanalmente
# ═══════════════════════════════════════════════════════════════════════


class GuildWar(Base, TimestampMixin):
    """Una guerra entre 2 gremios, típicamente semanal. Las matches reportadas
    contra el rival suman al score."""
    __tablename__ = "guild_wars"
    __table_args__ = (
        CheckConstraint("guild_a_id != guild_b_id", name="ck_war_diff_guilds"),
        CheckConstraint("status IN ('PROPOSED','ACTIVE','FINISHED','CANCELLED')",
                        name="ck_war_status"),
        Index("ix_war_active", "status", "starts_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    guild_a_id: Mapped[int] = mapped_column(ForeignKey("guilds.id", ondelete="CASCADE"), nullable=False)
    guild_b_id: Mapped[int] = mapped_column(ForeignKey("guilds.id", ondelete="CASCADE"), nullable=False)
    game_id: Mapped[int | None] = mapped_column(ForeignKey("games.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(20), default="PROPOSED", nullable=False)
    starts_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ends_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    score_a: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    score_b: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    winner_guild_id: Mapped[int | None] = mapped_column(ForeignKey("guilds.id", ondelete="SET NULL"))
    notes: Mapped[str | None] = mapped_column(Text)


class GuildWarMatch(Base, TimestampMixin):
    """Una match reportada dentro de una guild war."""
    __tablename__ = "guild_war_matches"

    id: Mapped[int] = mapped_column(primary_key=True)
    war_id: Mapped[int] = mapped_column(ForeignKey("guild_wars.id", ondelete="CASCADE"), nullable=False, index=True)
    player_a_id: Mapped[int] = mapped_column(ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False)
    player_b_id: Mapped[int] = mapped_column(ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False)
    winner_id: Mapped[int | None] = mapped_column(ForeignKey("player_profiles.id", ondelete="SET NULL"))
    is_draw: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    reported_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ═══════════════════════════════════════════════════════════════════════
# TEAM DRAFT — pick/ban + lineup
# ═══════════════════════════════════════════════════════════════════════


class TeamDraft(Base, TimestampMixin):
    """Un draft pick/ban para armar 2 equipos antes de un evento."""
    __tablename__ = "team_drafts"
    __table_args__ = (
        CheckConstraint("status IN ('OPEN','PICKING','LOCKED','CANCELLED')", name="ck_draft_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int | None] = mapped_column(ForeignKey("events.id", ondelete="SET NULL"))
    guild_id: Mapped[int | None] = mapped_column(ForeignKey("guilds.id", ondelete="SET NULL"))
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    captain_a_id: Mapped[int] = mapped_column(ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False)
    captain_b_id: Mapped[int] = mapped_column(ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False)
    team_size: Mapped[int] = mapped_column(Integer, default=4, nullable=False)
    current_pick_captain_id: Mapped[int | None] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="SET NULL")
    )
    status: Mapped[str] = mapped_column(String(20), default="OPEN", nullable=False)
    locked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class TeamDraftPick(Base, TimestampMixin):
    __tablename__ = "team_draft_picks"
    __table_args__ = (
        UniqueConstraint("draft_id", "pick_order", name="uq_draft_pick_order"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    draft_id: Mapped[int] = mapped_column(ForeignKey("team_drafts.id", ondelete="CASCADE"), nullable=False, index=True)
    pick_order: Mapped[int] = mapped_column(Integer, nullable=False)
    team_letter: Mapped[str] = mapped_column(String(1), nullable=False)  # 'A' o 'B'
    picked_player_id: Mapped[int] = mapped_column(ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False)


# ═══════════════════════════════════════════════════════════════════════
# SPECIAL EVENTS — flags reutilizando Event vía tabla satélite
# ═══════════════════════════════════════════════════════════════════════


class EventSpecialMode(Base, TimestampMixin):
    """Modo especial de un evento — gauntlet, qualifier, last man standing.

    Una entrada por evento. Si no existe, el evento es "estándar".
    """
    __tablename__ = "event_special_modes"
    __table_args__ = (
        UniqueConstraint("event_id", name="uq_special_mode_event"),
        CheckConstraint("mode IN ('GAUNTLET','QUALIFIER','LAST_MAN_STANDING','BOUNTY_BRACKET')",
                        name="ck_special_mode"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    mode: Mapped[str] = mapped_column(String(30), nullable=False)
    # Para gauntlet: JSON list de formats por ronda. Para qualifier: event_id_target.
    config_json: Mapped[str | None] = mapped_column(Text)


# ═══════════════════════════════════════════════════════════════════════
# BOUNTY BRACKET — top 4 acumula bounties
# ═══════════════════════════════════════════════════════════════════════


class BountyBracketState(Base, TimestampMixin):
    """Estado vivo del bounty bracket de un evento."""
    __tablename__ = "bounty_bracket_state"
    __table_args__ = (
        UniqueConstraint("event_id", "player_id", name="uq_bounty_state_unique"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False)
    own_bounty_exp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    accumulated_exp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)  # ganadas al matar bounties


# ═══════════════════════════════════════════════════════════════════════
# SPONSOR SYSTEM — patrocinadores eligen jugador embajador
# ═══════════════════════════════════════════════════════════════════════


class Sponsor(Base, TimestampMixin):
    """Un patrocinador (tienda, persona, marca) registrado."""
    __tablename__ = "sponsors"

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    name: Mapped[str] = mapped_column(String(120), nullable=False, unique=True)
    logo_url: Mapped[str | None] = mapped_column(String(800))
    website_url: Mapped[str | None] = mapped_column(String(800))
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    total_paid_exp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class SponsorAmbassador(Base, TimestampMixin):
    """Un jugador es embajador de un sponsor por un período."""
    __tablename__ = "sponsor_ambassadors"
    __table_args__ = (
        UniqueConstraint("sponsor_id", "player_id", "season_id", name="uq_sponsor_amb_unique"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    sponsor_id: Mapped[int] = mapped_column(ForeignKey("sponsors.id", ondelete="CASCADE"), nullable=False, index=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    season_id: Mapped[int | None] = mapped_column(ForeignKey("seasons.id", ondelete="SET NULL"))
    bonus_exp_per_top8: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    bonus_exp_per_champion: Mapped[int] = mapped_column(Integer, default=500, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
