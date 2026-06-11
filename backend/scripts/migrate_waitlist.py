"""Crea tabla event_waitlist + columna payment_reminder_sent. Idempotente."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import text
from app.core.db import engine
from app.models import EventWaitlist


def main() -> None:
    EventWaitlist.__table__.create(engine, checkfirst=True)
    print("[ok] event_waitlist")
    with engine.begin() as conn:
        try:
            conn.execute(text(
                "ALTER TABLE event_registrations ADD COLUMN payment_reminder_sent BOOLEAN DEFAULT 0 NOT NULL"
            ))
            print("  + event_registrations.payment_reminder_sent")
        except Exception as e:
            if "duplicate column" in str(e).lower():
                print("  = payment_reminder_sent (ya existía)")
            else:
                raise


if __name__ == "__main__":
    main()
