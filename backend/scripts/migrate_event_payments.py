"""Trazabilidad de pagos MP en event_registrations. Idempotente."""
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
        _add(conn, "event_registrations", "mp_preference_id", "VARCHAR(80)")
        _add(conn, "event_registrations", "mp_payment_id", "VARCHAR(80)")
        _add(conn, "event_registrations", "paid_at", "DATETIME")
        _add(conn, "event_registrations", "payment_expires_at", "DATETIME")
    print("[ok] event payment columns ready")


if __name__ == "__main__":
    main()
