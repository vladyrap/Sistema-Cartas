"""Agrega notifications.guild_id (nullable) + índice. Idempotente."""
from sqlalchemy import inspect, text
from app.core.db import engine


def main():
    insp = inspect(engine)
    cols = [c["name"] for c in insp.get_columns("notifications")]
    with engine.begin() as conn:
        if "guild_id" in cols:
            print("· notifications.guild_id ya existe")
        else:
            conn.execute(text("ALTER TABLE notifications ADD COLUMN guild_id INTEGER REFERENCES guilds(id)"))
            print("✓ notifications.guild_id agregado")
        # Índice si no está
        idx_rows = conn.execute(text(
            "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='notifications' AND name='ix_notifications_guild_id'"
        )).first()
        if not idx_rows:
            conn.execute(text("CREATE INDEX ix_notifications_guild_id ON notifications(guild_id)"))
            print("✓ ix_notifications_guild_id creado")
        else:
            print("· índice ya existe")


if __name__ == "__main__":
    main()
