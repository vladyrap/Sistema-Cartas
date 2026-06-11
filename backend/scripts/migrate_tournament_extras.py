"""Migración: match_reports, match_disputes, round_timers, event_rating_snapshots, event_penalties.

Idempotente — si las tablas existen, no hace nada.
"""
from sqlalchemy import inspect

from app.core.db import engine
from app.models.tournament_extras import (
    MatchReport, MatchDispute, RoundTimer,
    EventRatingSnapshot, EventPenalty,
)


def main():
    insp = inspect(engine)
    existing = set(insp.get_table_names())
    for model in (MatchReport, MatchDispute, RoundTimer, EventRatingSnapshot, EventPenalty):
        name = model.__tablename__
        if name in existing:
            print(f"- {name} ya existe")
        else:
            model.__table__.create(bind=engine)
            print(f"+ {name} creada")


if __name__ == "__main__":
    main()
