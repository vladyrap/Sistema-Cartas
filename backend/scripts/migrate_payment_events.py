"""Crea la tabla payment_events para idempotency de webhooks MercadoPago.

Idempotente — si la tabla ya existe, no hace nada.
"""
from sqlalchemy import inspect

from app.core.db import engine
from app.models.payment_event import PaymentEvent


def main():
    insp = inspect(engine)
    if "payment_events" in insp.get_table_names():
        print("· payment_events ya existe")
        return
    PaymentEvent.__table__.create(bind=engine)
    print("✓ payment_events creada")


if __name__ == "__main__":
    main()
