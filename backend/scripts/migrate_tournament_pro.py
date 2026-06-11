"""Migración: check-in window + deck hash + intentional draw flag.

Idempotente.
"""
from sqlalchemy import inspect, text

from app.core.db import engine


def _add(conn, table: str, col: str, ddl: str) -> None:
    insp = inspect(engine)
    cols = [c["name"] for c in insp.get_columns(table)]
    if col in cols:
        print(f"- {table}.{col} ya existe")
        return
    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
    print(f"+ {table}.{col}")


def main():
    with engine.begin() as conn:
        # Event: ventana de check-in
        _add(conn, "events", "checkin_opens_minutes_before", "INTEGER DEFAULT 30 NOT NULL")
        _add(conn, "events", "checkin_closes_minutes_before", "INTEGER DEFAULT 5 NOT NULL")
        _add(conn, "events", "checkin_required", "BOOLEAN DEFAULT 0 NOT NULL")

        # EventRegistration: checkin meta
        _add(conn, "event_registrations", "checked_in_at", "DATETIME")
        _add(conn, "event_registrations", "checkin_method", "VARCHAR(20)")  # qr, manual, self
        _add(conn, "event_registrations", "checkin_token", "VARCHAR(40)")

        # PlayerDeck: hash + lock timestamp
        _add(conn, "player_decks", "list_hash", "VARCHAR(48)")
        _add(conn, "player_decks", "locked_at", "DATETIME")
        _add(conn, "player_decks", "locked_for_event_id", "INTEGER")

        # MatchResult: intentional_draw flag
        _add(conn, "match_results", "is_intentional_draw", "BOOLEAN DEFAULT 0 NOT NULL")
        _add(conn, "match_results", "id_consented_by_a", "BOOLEAN DEFAULT 0 NOT NULL")
        _add(conn, "match_results", "id_consented_by_b", "BOOLEAN DEFAULT 0 NOT NULL")


if __name__ == "__main__":
    main()
