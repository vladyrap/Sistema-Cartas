"""Crea tablas player_decks + polls + poll_options + poll_votes. Idempotente."""
from sqlalchemy import inspect

from app.core.db import engine
from app.models import PlayerDeck, Poll, PollOption, PollVote


def main():
    insp = inspect(engine)
    for tbl, model in [
        ("player_decks", PlayerDeck),
        ("polls", Poll),
        ("poll_options", PollOption),
        ("poll_votes", PollVote),
    ]:
        if tbl in insp.get_table_names():
            print(f"· {tbl} ya existe")
        else:
            model.__table__.create(bind=engine)
            print(f"✓ {tbl} creada")


if __name__ == "__main__":
    main()
