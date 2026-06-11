"""Crea tablas meta-competitive. Idempotente."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.db import engine
from app.models import (
    TournamentAuction, TournamentAuctionBid,
    MercenaryOffer, MercenaryHire,
    CoachOffer, CoachBooking,
    SpectatorPick,
)

TABLES = [
    TournamentAuction, TournamentAuctionBid,
    MercenaryOffer, MercenaryHire,
    CoachOffer, CoachBooking,
    SpectatorPick,
]


def main() -> None:
    for t in TABLES:
        t.__table__.create(engine, checkfirst=True)
        print(f"[ok] {t.__tablename__}")


if __name__ == "__main__":
    main()
