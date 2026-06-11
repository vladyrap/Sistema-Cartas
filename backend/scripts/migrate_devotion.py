"""Migración: archetype_devotions."""
from sqlalchemy import inspect

from app.core.db import engine
from app.models.archetype_devotion import ArchetypeDevotion


def main():
    insp = inspect(engine)
    if "archetype_devotions" in insp.get_table_names():
        print("- archetype_devotions ya existe")
        return
    ArchetypeDevotion.__table__.create(bind=engine)
    print("+ archetype_devotions creada")


if __name__ == "__main__":
    main()
