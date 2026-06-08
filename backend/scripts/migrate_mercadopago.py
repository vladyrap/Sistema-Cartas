"""Agrega columnas MP a guilds + reservations. Idempotente."""
from sqlalchemy import inspect, text

from app.core.db import engine


def _add(conn, table: str, col: str, ddl: str) -> None:
    insp = inspect(engine)
    cols = [c["name"] for c in insp.get_columns(table)]
    if col in cols:
        print(f"· {table}.{col} ya existe")
        return
    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
    print(f"✓ {table}.{col} agregada")


def main():
    with engine.begin() as conn:
        _add(conn, "guilds", "mp_access_token", "VARCHAR(255)")
        _add(conn, "guilds", "mp_public_key", "VARCHAR(120)")
        _add(conn, "reservations", "mp_preference_id", "VARCHAR(80)")
        _add(conn, "reservations", "mp_payment_id", "VARCHAR(80)")
        _add(conn, "reservations", "paid_at", "DATETIME")


if __name__ == "__main__":
    main()
