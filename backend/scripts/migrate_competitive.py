"""Crea las tablas del bloque competitive. Idempotente."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text
from app.core.db import engine
from app.models import (
    ChallengeDuel, SparringQueueEntry, GuildWar, GuildWarMatch,
    TeamDraft, TeamDraftPick, EventSpecialMode, BountyBracketState,
    Sponsor, SponsorAmbassador,
)

TABLES = [
    ChallengeDuel, SparringQueueEntry, GuildWar, GuildWarMatch,
    TeamDraft, TeamDraftPick, EventSpecialMode, BountyBracketState,
    Sponsor, SponsorAmbassador,
]


def _add(conn, table: str, col: str, ddl: str) -> None:
    try:
        conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
        print(f"  + {table}.{col}")
    except Exception as e:
        if "duplicate column" in str(e).lower() or "already exists" in str(e).lower():
            print(f"  = {table}.{col} (ya existía)")
        else:
            raise


def main() -> None:
    # Agregar freeze_until a player_ratings
    with engine.begin() as conn:
        _add(conn, "player_ratings", "freeze_until", "DATETIME")
    for t in TABLES:
        t.__table__.create(engine, checkfirst=True)
        print(f"[ok] {t.__tablename__}")


if __name__ == "__main__":
    main()
