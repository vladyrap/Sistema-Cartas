"""Agrega columnas para Robustez Competitiva. Idempotente.

Columnas:
- challenge_duels: dual-confirm (challenger/challenged_reported_winner_id, _at, is_disputed, collusion_flag)
- player_ratings: promo series (wins/total/target_tier), demotion_shield_active, trust_score
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text
from app.core.db import engine


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
    with engine.begin() as conn:
        _add(conn, "challenge_duels", "challenger_reported_winner_id", "INTEGER")
        _add(conn, "challenge_duels", "challenged_reported_winner_id", "INTEGER")
        _add(conn, "challenge_duels", "challenger_reported_at", "DATETIME")
        _add(conn, "challenge_duels", "challenged_reported_at", "DATETIME")
        _add(conn, "challenge_duels", "is_disputed", "BOOLEAN DEFAULT 0 NOT NULL")
        _add(conn, "challenge_duels", "collusion_flag", "BOOLEAN DEFAULT 0 NOT NULL")

        _add(conn, "player_ratings", "promo_series_wins", "INTEGER DEFAULT 0 NOT NULL")
        _add(conn, "player_ratings", "promo_series_total", "INTEGER DEFAULT 0 NOT NULL")
        _add(conn, "player_ratings", "promo_series_target_tier", "VARCHAR(20)")
        _add(conn, "player_ratings", "demotion_shield_active", "BOOLEAN DEFAULT 0 NOT NULL")
        _add(conn, "player_ratings", "trust_score", "FLOAT DEFAULT 1.0 NOT NULL")
    print("[ok] columns added")


if __name__ == "__main__":
    main()
