"""Crea tabla notifications si no existe. Idempotente."""
from sqlalchemy import inspect

from app.core.db import engine
from app.models import Notification


def run():
    inspector = inspect(engine)
    if "notifications" in inspector.get_table_names():
        print("Tabla notifications ya existe.")
        return
    Notification.__table__.create(bind=engine)
    print("OK · tabla notifications creada.")


if __name__ == "__main__":
    run()
