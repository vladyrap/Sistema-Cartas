"""Crea tablas del Tournament Universe. Idempotente."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.db import engine
from app.models import (
    TournamentPrediction, PlayerRivalry, TournamentHypeEvent,
    TournamentHypeReaction, TournamentAchievement, TournamentStoryline,
)

TABLES = [
    TournamentPrediction, PlayerRivalry, TournamentHypeEvent,
    TournamentHypeReaction, TournamentAchievement, TournamentStoryline,
]


def main() -> None:
    for t in TABLES:
        t.__table__.create(engine, checkfirst=True)
        print(f"[ok] {t.__tablename__}")


if __name__ == "__main__":
    main()
