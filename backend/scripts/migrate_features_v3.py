"""Migración v3: PackOpening, Wordle, CardSwipe. Idempotente."""
from sqlalchemy import inspect

from app.core.db import engine
from app.models.pack_opening import PackOpening
from app.models.wordle import WordlePuzzle, WordleAttempt
from app.models.card_swipe import CardSwipe


def main():
    insp = inspect(engine)
    existing = set(insp.get_table_names())
    for model in (PackOpening, WordlePuzzle, WordleAttempt, CardSwipe):
        name = model.__tablename__
        if name in existing:
            print(f"- {name} ya existe")
        else:
            model.__table__.create(bind=engine)
            print(f"+ {name} creada")


if __name__ == "__main__":
    main()
