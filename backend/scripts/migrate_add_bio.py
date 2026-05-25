"""Migración non-destructiva: agrega columna `bio` a player_profiles.

Idempotente. Si la columna ya existe, no hace nada.
"""
from sqlalchemy import inspect, text

from app.core.db import engine


def run():
    inspector = inspect(engine)
    if "player_profiles" not in inspector.get_table_names():
        print("Tabla player_profiles no existe. Corre `python -m scripts.seed` primero.")
        return
    cols = [c["name"] for c in inspector.get_columns("player_profiles")]
    if "bio" in cols:
        print("Columna `bio` ya existe — nada que hacer.")
        return
    with engine.begin() as conn:
        conn.execute(text("ALTER TABLE player_profiles ADD COLUMN bio TEXT"))
    print("OK · columna `bio` agregada a player_profiles.")


if __name__ == "__main__":
    run()
