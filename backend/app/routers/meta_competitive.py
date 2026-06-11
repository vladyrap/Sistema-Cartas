"""Meta-competitive endpoints: Auctions, Mercenaries, Coach, Spectator Picks."""
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, desc, func, select
from sqlalchemy.exc import IntegrityError

from app.core.deps import AdminDep, DbDep, OptionalUserDep, UserDep
from app.models import (
    CoachBooking, CoachOffer, Event, MercenaryHire, MercenaryOffer,
    PlayerProfile, Season, SeasonProgress, SpectatorPick,
    TournamentAuction, TournamentAuctionBid,
)
from app.services import exp as exp_svc

router = APIRouter()


def _exp_balance(db, player_id: int) -> int:
    season = exp_svc.get_active_season(db)
    if not season:
        return 0
    sp = db.scalar(select(SeasonProgress).where(
        SeasonProgress.season_id == season.id, SeasonProgress.player_id == player_id
    ))
    return sp.exp_total if sp else 0


# ═══════════════════════════════════════════════════════════════════════
# TOURNAMENT AUCTIONS
# ═══════════════════════════════════════════════════════════════════════


class AuctionCreateIn(BaseModel):
    event_id: int
    slots_available: int = Field(default=8, ge=1, le=64)
    min_bid_exp: int = Field(default=500, ge=100)
    closes_at: datetime


@router.post("/auctions", status_code=201)
def admin_create_auction(payload: AuctionCreateIn, admin: AdminDep, db: DbDep) -> dict:
    ev = db.get(Event, payload.event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no existe")
    a = TournamentAuction(
        event_id=payload.event_id, slots_available=payload.slots_available,
        min_bid_exp=payload.min_bid_exp, closes_at=payload.closes_at,
    )
    db.add(a)
    try:
        db.commit()
        db.refresh(a)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe subasta para este evento")
    return {"ok": True, "auction_id": a.id}


@router.get("/auctions/{auction_id}")
def get_auction(auction_id: int, db: DbDep) -> dict:
    a = db.get(TournamentAuction, auction_id)
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subasta no existe")
    bids = list(db.scalars(select(TournamentAuctionBid).where(
        TournamentAuctionBid.auction_id == auction_id
    ).order_by(desc(TournamentAuctionBid.bid_exp))))
    bid_list = []
    for b in bids:
        p = db.get(PlayerProfile, b.bidder_player_id)
        bid_list.append({
            "bidder_player_id": b.bidder_player_id,
            "alias": p.alias if p else f"#{b.bidder_player_id}",
            "bid_exp": b.bid_exp,
            "is_winner": b.is_winner,
        })
    return {
        "id": a.id, "event_id": a.event_id, "slots_available": a.slots_available,
        "min_bid_exp": a.min_bid_exp, "closes_at": a.closes_at.isoformat(),
        "status": a.status, "bids": bid_list, "total_bids": len(bids),
    }


@router.post("/auctions/{auction_id}/bid")
def place_bid(auction_id: int, current: UserDep, db: DbDep, amount: int = Query(...)) -> dict:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    a = db.get(TournamentAuction, auction_id)
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subasta no existe")
    if a.status != "OPEN":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Subasta cerrada")
    if amount < a.min_bid_exp:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Bid mínimo: {a.min_bid_exp}")
    if _exp_balance(db, current.profile.id) < amount:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "EXP insuficiente")

    # Existing bid? Refund and upgrade
    existing = db.scalar(select(TournamentAuctionBid).where(
        TournamentAuctionBid.auction_id == auction_id,
        TournamentAuctionBid.bidder_player_id == current.profile.id,
    ))
    if existing:
        if amount <= existing.bid_exp:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Bid debe ser mayor al actual")
        # Refund anterior, descontar nuevo
        exp_svc.award_exp(db, player_id=current.profile.id, reason_code="auction_refund",
                          amount=existing.bid_exp, reason=f"Upgrade bid auction #{auction_id}")
        exp_svc.award_exp(db, player_id=current.profile.id, reason_code="auction_stake",
                          amount=-amount, reason=f"Auction bid #{auction_id}")
        existing.bid_exp = amount
    else:
        exp_svc.award_exp(db, player_id=current.profile.id, reason_code="auction_stake",
                          amount=-amount, reason=f"Auction bid #{auction_id}")
        db.add(TournamentAuctionBid(auction_id=auction_id, bidder_player_id=current.profile.id, bid_exp=amount))
    db.commit()
    return {"ok": True, "amount": amount}


@router.post("/auctions/{auction_id}/settle")
def settle_auction(auction_id: int, admin: AdminDep, db: DbDep) -> dict:
    """Cierra subasta: top N bids ganan; resto refundeado."""
    a = db.get(TournamentAuction, auction_id)
    if not a:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Subasta no existe")
    if a.status == "SETTLED":
        return {"ok": True, "already_settled": True}
    bids = list(db.scalars(select(TournamentAuctionBid).where(
        TournamentAuctionBid.auction_id == auction_id
    ).order_by(desc(TournamentAuctionBid.bid_exp))))
    winners = bids[:a.slots_available]
    losers = bids[a.slots_available:]
    now = datetime.now(timezone.utc)
    for w in winners:
        w.is_winner = True
    for l in losers:
        l.is_winner = False
        l.refunded_at = now
        exp_svc.award_exp(db, player_id=l.bidder_player_id, reason_code="auction_refund",
                          amount=l.bid_exp, reason=f"Lost auction #{auction_id}")
    a.status = "SETTLED"
    db.commit()
    return {"ok": True, "winners": len(winners), "refunded": len(losers)}


# ═══════════════════════════════════════════════════════════════════════
# MERCENARY MODE
# ═══════════════════════════════════════════════════════════════════════


class MercenaryOfferIn(BaseModel):
    game_id: int
    rate_per_match_exp: int = Field(ge=10, le=5000)
    bio: str | None = Field(default=None, max_length=600)


@router.post("/mercenary/offer", status_code=201)
def create_offer(payload: MercenaryOfferIn, current: UserDep, db: DbDep) -> dict:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    existing = db.scalar(select(MercenaryOffer).where(
        MercenaryOffer.player_id == current.profile.id,
        MercenaryOffer.game_id == payload.game_id,
    ))
    if existing:
        existing.rate_per_match_exp = payload.rate_per_match_exp
        existing.bio = payload.bio
        existing.is_available = True
        db.commit()
        return {"ok": True, "offer_id": existing.id, "updated": True}
    o = MercenaryOffer(
        player_id=current.profile.id, game_id=payload.game_id,
        rate_per_match_exp=payload.rate_per_match_exp, bio=payload.bio,
    )
    db.add(o)
    db.commit()
    db.refresh(o)
    return {"ok": True, "offer_id": o.id}


@router.get("/mercenary/offers")
def list_offers(db: DbDep, game_id: int | None = None) -> list[dict]:
    stmt = select(MercenaryOffer).where(MercenaryOffer.is_available.is_(True))
    if game_id:
        stmt = stmt.where(MercenaryOffer.game_id == game_id)
    rows = list(db.scalars(stmt.order_by(MercenaryOffer.rate_per_match_exp)))
    out = []
    for o in rows:
        p = db.get(PlayerProfile, o.player_id)
        out.append({
            "id": o.id, "player_id": o.player_id,
            "alias": p.alias if p else f"#{o.player_id}",
            "game_id": o.game_id, "rate_per_match_exp": o.rate_per_match_exp,
            "bio": o.bio, "total_matches_hired": o.total_matches_hired,
        })
    return out


class HireMercIn(BaseModel):
    offer_id: int
    guild_id: int
    matches: int = Field(ge=1, le=10)
    war_id: int | None = None


@router.post("/mercenary/hire", status_code=201)
def hire_mercenary(payload: HireMercIn, current: UserDep, db: DbDep) -> dict:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    offer = db.get(MercenaryOffer, payload.offer_id)
    if not offer or not offer.is_available:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Offer no disponible")

    total_cost = offer.rate_per_match_exp * payload.matches
    if _exp_balance(db, current.profile.id) < total_cost:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Necesitás {total_cost} EXP")

    # Transfer: hirer paga, mercenary recibe
    exp_svc.award_exp(db, player_id=current.profile.id, reason_code="mercenary_hire",
                      amount=-total_cost, reason=f"Hire {offer.player_id} x{payload.matches} matches")
    exp_svc.award_exp(db, player_id=offer.player_id, reason_code="mercenary_pay",
                      amount=total_cost, reason=f"Hired by player {current.profile.id}")

    hire = MercenaryHire(
        offer_id=payload.offer_id, guild_id=payload.guild_id,
        war_id=payload.war_id, matches_paid=payload.matches,
        total_paid_exp=total_cost, started_at=datetime.now(timezone.utc),
    )
    db.add(hire)
    offer.total_matches_hired += payload.matches
    db.commit()
    db.refresh(hire)
    return {"ok": True, "hire_id": hire.id, "total_paid_exp": total_cost}


# ═══════════════════════════════════════════════════════════════════════
# COACH SYSTEM
# ═══════════════════════════════════════════════════════════════════════


class CoachOfferIn(BaseModel):
    game_id: int
    title: str = Field(min_length=3, max_length=120)
    description: str | None = Field(default=None, max_length=600)
    price_exp: int = Field(ge=50, le=5000)
    duration_minutes: int = Field(ge=15, le=180, default=60)


@router.post("/coach/offers", status_code=201)
def create_coach_offer(payload: CoachOfferIn, current: UserDep, db: DbDep) -> dict:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    o = CoachOffer(
        coach_player_id=current.profile.id, game_id=payload.game_id,
        title=payload.title, description=payload.description,
        price_exp=payload.price_exp, duration_minutes=payload.duration_minutes,
    )
    db.add(o)
    db.commit()
    db.refresh(o)
    return {"ok": True, "id": o.id}


@router.get("/coach/offers")
def list_coach_offers(db: DbDep, game_id: int | None = None) -> list[dict]:
    stmt = select(CoachOffer).where(CoachOffer.is_active.is_(True))
    if game_id:
        stmt = stmt.where(CoachOffer.game_id == game_id)
    rows = list(db.scalars(stmt.order_by(desc(CoachOffer.sessions_completed))))
    out = []
    for o in rows:
        p = db.get(PlayerProfile, o.coach_player_id)
        out.append({
            "id": o.id, "coach_player_id": o.coach_player_id,
            "coach_alias": p.alias if p else f"#{o.coach_player_id}",
            "title": o.title, "description": o.description,
            "price_exp": o.price_exp, "duration_minutes": o.duration_minutes,
            "sessions_completed": o.sessions_completed,
            "rating_avg": o.rating_avg,
        })
    return out


@router.post("/coach/book", status_code=201)
def book_coach(current: UserDep, db: DbDep, offer_id: int = Query(...),
               scheduled_at: datetime | None = None) -> dict:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    offer = db.get(CoachOffer, offer_id)
    if not offer or not offer.is_active:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Offer no activa")
    if offer.coach_player_id == current.profile.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No podés bookear a vos mismo")
    if _exp_balance(db, current.profile.id) < offer.price_exp:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, f"Necesitás {offer.price_exp} EXP")

    exp_svc.award_exp(db, player_id=current.profile.id, reason_code="coach_book",
                      amount=-offer.price_exp, reason=f"Coach booking offer #{offer_id}")
    booking = CoachBooking(
        offer_id=offer_id, student_player_id=current.profile.id,
        scheduled_at=scheduled_at, paid_exp=offer.price_exp,
    )
    db.add(booking)
    db.commit()
    db.refresh(booking)
    return {"ok": True, "booking_id": booking.id}


@router.post("/coach/bookings/{booking_id}/complete")
def complete_booking(booking_id: int, current: UserDep, db: DbDep,
                     rating: int = Query(ge=1, le=5), review: str | None = None) -> dict:
    b = db.get(CoachBooking, booking_id)
    if not b:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Booking no existe")
    if b.student_player_id != current.profile.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "No es tu booking")
    if b.status == "COMPLETED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Ya completado")

    b.status = "COMPLETED"
    b.completed_at = datetime.now(timezone.utc)
    b.student_rating = rating
    b.student_review = review
    # Pagar al coach
    offer = db.get(CoachOffer, b.offer_id)
    if offer:
        exp_svc.award_exp(db, player_id=offer.coach_player_id, reason_code="coach_earn",
                          amount=b.paid_exp, reason=f"Coaching session #{booking_id}")
        offer.sessions_completed += 1
        # Update rating avg
        all_completed = list(db.scalars(select(CoachBooking).where(
            CoachBooking.offer_id == offer.id,
            CoachBooking.status == "COMPLETED",
            CoachBooking.student_rating.is_not(None),
        )))
        if all_completed:
            offer.rating_avg = sum(x.student_rating for x in all_completed) / len(all_completed)
    db.commit()
    return {"ok": True}


# ═══════════════════════════════════════════════════════════════════════
# SPECTATOR PICKS
# ═══════════════════════════════════════════════════════════════════════


class PickIn(BaseModel):
    picked_player_id: int
    comment: str | None = Field(default=None, max_length=200)


@router.post("/events/{event_id}/picks/{round_number}", status_code=201)
def submit_pick(event_id: int, round_number: int, payload: PickIn,
                current: UserDep, db: DbDep) -> dict:
    existing = db.scalar(select(SpectatorPick).where(
        SpectatorPick.event_id == event_id,
        SpectatorPick.round_number == round_number,
        SpectatorPick.voter_user_id == current.id,
    ))
    if existing:
        existing.picked_player_id = payload.picked_player_id
        existing.comment = payload.comment
    else:
        pick = SpectatorPick(
            event_id=event_id, round_number=round_number,
            voter_user_id=current.id,
            picked_player_id=payload.picked_player_id, comment=payload.comment,
        )
        db.add(pick)
    db.commit()
    return {"ok": True}


@router.get("/events/{event_id}/picks/{round_number}")
def round_picks(event_id: int, round_number: int, db: DbDep) -> dict:
    rows = list(db.scalars(select(SpectatorPick).where(
        SpectatorPick.event_id == event_id, SpectatorPick.round_number == round_number,
    )))
    counts: dict[int, int] = {}
    for r in rows:
        counts[r.picked_player_id] = counts.get(r.picked_player_id, 0) + 1
    leaderboard = []
    for pid, n in sorted(counts.items(), key=lambda x: -x[1]):
        p = db.get(PlayerProfile, pid)
        leaderboard.append({
            "player_id": pid, "alias": p.alias if p else f"#{pid}",
            "votes": n,
        })
    return {"event_id": event_id, "round_number": round_number,
            "total_votes": len(rows), "leaderboard": leaderboard[:8]}
