"""Migración: tablas para Spinner, Card of the Day, Bounty del Campeón.

Idempotente — si las tablas existen, no hace nada.
"""
from sqlalchemy import inspect

from app.core.db import engine
from app.models.daily_spin import DailySpin
from app.models.daily_card import DailyCard
from app.models.bounty_kill import BountyKill


def main():
    insp = inspect(engine)
    existing = set(insp.get_table_names())
    for model in (DailySpin, DailyCard, BountyKill):
        name = model.__tablename__
        if name in existing:
            print(f"- {name} ya existe")
        else:
            model.__table__.create(bind=engine)
            print(f"+ {name} creada")


if __name__ == "__main__":
    main()
