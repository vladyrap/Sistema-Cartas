"""Migración: agregar telegram_bot_token, telegram_chat_id, discord_webhook_url a guilds."""
from sqlalchemy import inspect, text

from app.core.db import engine


def _add(conn, table: str, col: str, ddl: str) -> None:
    insp = inspect(engine)
    cols = [c["name"] for c in insp.get_columns(table)]
    if col in cols:
        print(f"- {table}.{col} ya existe")
        return
    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}"))
    print(f"+ {table}.{col} agregada")


def main():
    with engine.begin() as conn:
        _add(conn, "guilds", "telegram_bot_token", "VARCHAR(120)")
        _add(conn, "guilds", "telegram_chat_id", "VARCHAR(60)")
        _add(conn, "guilds", "discord_webhook_url", "VARCHAR(500)")
        _add(conn, "users", "discord_id", "VARCHAR(40)")
        _add(conn, "users", "discord_username", "VARCHAR(80)")
        _add(conn, "users", "discord_avatar", "VARCHAR(120)")


if __name__ == "__main__":
    main()
