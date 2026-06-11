"""Meta-competitive models: Auctions, Mercenaries, Coach offers, Spectator picks."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String,
    Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


# ═══════════════════════════════════════════════════════════════════════
# TOURNAMENT AUCTIONS — pujás EXP por un slot en torneo cerrado
# ═══════════════════════════════════════════════════════════════════════


class TournamentAuction(Base, TimestampMixin):
    """Una subasta de slots para un torneo (typicamente cerrado/invitational)."""
    __tablename__ = "tournament_auctions"
    __table_args__ = (
        UniqueConstraint("event_id", name="uq_auction_event"),
        CheckConstraint("status IN ('OPEN','CLOSED','SETTLED')", name="ck_auction_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    slots_available: Mapped[int] = mapped_column(Integer, nullable=False, default=8)
    min_bid_exp: Mapped[int] = mapped_column(Integer, nullable=False, default=500)
    closes_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="OPEN", nullable=False)


class TournamentAuctionBid(Base, TimestampMixin):
    """Una puja. Si gana, el EXP queda como entry fee del evento."""
    __tablename__ = "tournament_auction_bids"
    __table_args__ = (
        UniqueConstraint("auction_id", "bidder_player_id", name="uq_bid_per_player"),
        Index("ix_bid_amount", "auction_id", "bid_exp"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    auction_id: Mapped[int] = mapped_column(ForeignKey("tournament_auctions.id", ondelete="CASCADE"), nullable=False, index=True)
    bidder_player_id: Mapped[int] = mapped_column(ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False)
    bid_exp: Mapped[int] = mapped_column(Integer, nullable=False)
    is_winner: Mapped[bool | None] = mapped_column(Boolean)
    refunded_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ═══════════════════════════════════════════════════════════════════════
# MERCENARY MODE — alquilás top players para guild wars
# ═══════════════════════════════════════════════════════════════════════


class MercenaryOffer(Base, TimestampMixin):
    """Un jugador se ofrece como mercenary. Guilds lo "alquilan" para sus wars."""
    __tablename__ = "mercenary_offers"
    __table_args__ = (
        UniqueConstraint("player_id", "game_id", name="uq_merc_offer_unique"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True)
    rate_per_match_exp: Mapped[int] = mapped_column(Integer, nullable=False, default=100)
    bio: Mapped[str | None] = mapped_column(Text)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    total_matches_hired: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class MercenaryHire(Base, TimestampMixin):
    """Un guild contrata a un mercenary por X matches."""
    __tablename__ = "mercenary_hires"
    __table_args__ = (
        CheckConstraint("status IN ('ACTIVE','COMPLETED','CANCELLED')", name="ck_merc_hire_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    offer_id: Mapped[int] = mapped_column(ForeignKey("mercenary_offers.id", ondelete="CASCADE"), nullable=False, index=True)
    guild_id: Mapped[int] = mapped_column(ForeignKey("guilds.id", ondelete="CASCADE"), nullable=False, index=True)
    war_id: Mapped[int | None] = mapped_column(ForeignKey("guild_wars.id", ondelete="SET NULL"))
    matches_paid: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    total_paid_exp: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", nullable=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ═══════════════════════════════════════════════════════════════════════
# COACH SYSTEM — top players venden coaching
# ═══════════════════════════════════════════════════════════════════════


class CoachOffer(Base, TimestampMixin):
    """Un jugador top ofrece sesiones de coaching."""
    __tablename__ = "coach_offers"

    id: Mapped[int] = mapped_column(primary_key=True)
    coach_player_id: Mapped[int] = mapped_column(ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(120), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    price_exp: Mapped[int] = mapped_column(Integer, nullable=False, default=500)
    duration_minutes: Mapped[int] = mapped_column(Integer, nullable=False, default=60)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    rating_avg: Mapped[float | None] = mapped_column(default=None)
    sessions_completed: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class CoachBooking(Base, TimestampMixin):
    """Una sesión reservada. Student paga EXP al confirmar."""
    __tablename__ = "coach_bookings"
    __table_args__ = (
        CheckConstraint("status IN ('REQUESTED','CONFIRMED','COMPLETED','CANCELLED')",
                        name="ck_coach_booking_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    offer_id: Mapped[int] = mapped_column(ForeignKey("coach_offers.id", ondelete="CASCADE"), nullable=False, index=True)
    student_player_id: Mapped[int] = mapped_column(ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    scheduled_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_exp: Mapped[int] = mapped_column(Integer, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="REQUESTED", nullable=False)
    student_review: Mapped[str | None] = mapped_column(Text)
    student_rating: Mapped[int | None] = mapped_column(Integer)  # 1-5
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


# ═══════════════════════════════════════════════════════════════════════
# SPECTATOR PICKS — votar MVP por ronda
# ═══════════════════════════════════════════════════════════════════════


class SpectatorPick(Base, TimestampMixin):
    """Un espectador vota por su MVP de la ronda."""
    __tablename__ = "spectator_picks"
    __table_args__ = (
        UniqueConstraint("event_id", "round_number", "voter_user_id", name="uq_pick_per_voter"),
        Index("ix_pick_event_round", "event_id", "round_number"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True)
    round_number: Mapped[int] = mapped_column(Integer, nullable=False)
    voter_user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    picked_player_id: Mapped[int] = mapped_column(ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True)
    comment: Mapped[str | None] = mapped_column(String(200))
