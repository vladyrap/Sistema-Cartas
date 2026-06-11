"""Migración: cardgrave, tornado, bounty contracts, deck roulette."""
from sqlalchemy import inspect

from app.core.db import engine
from app.models.cardgrave import CardgraveEntry
from app.models.tornado_event import TornadoEvent
from app.models.bounty_contract import BountyContract
from app.models.deck_roulette import DeckRouletteAssignment


def main():
    insp = inspect(engine)
    existing = set(insp.get_table_names())
    for model in (CardgraveEntry, TornadoEvent, BountyContract, DeckRouletteAssignment):
        name = model.__tablename__
        if name in existing:
            print(f"- {name} ya existe")
        else:
            model.__table__.create(bind=engine)
            print(f"+ {name} creada")


if __name__ == "__main__":
    main()
