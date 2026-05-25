"""Crea tabla player_streaks. Idempotente."""
from sqlalchemy import inspect

from app.core.db import engine
from app.models import PlayerStreak


def main():
    insp = inspect(engine)
    if "player_streaks" in insp.get_table_names():
        print("· player_streaks ya existe")
        return
    PlayerStreak.__table__.create(bind=engine)
    print("✓ player_streaks creada")


if __name__ == "__main__":
    main()
