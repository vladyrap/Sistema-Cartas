"""Agrega player_profiles.checkin_token + genera tokens para todos los existentes.

Idempotente.
"""
import secrets

from sqlalchemy import inspect, select, text

from app.core.db import SessionLocal, engine
from app.models import PlayerProfile


def main():
    insp = inspect(engine)
    cols = [c["name"] for c in insp.get_columns("player_profiles")]
    if "checkin_token" not in cols:
        with engine.begin() as conn:
            conn.execute(text(
                "ALTER TABLE player_profiles ADD COLUMN checkin_token VARCHAR(64)"
            ))
            conn.execute(text(
                "CREATE UNIQUE INDEX IF NOT EXISTS ix_player_profiles_checkin_token "
                "ON player_profiles(checkin_token)"
            ))
        print("✓ checkin_token agregado + index creado")
    else:
        print("· checkin_token ya existe")

    # Backfill: generar token para los que no tengan
    db = SessionLocal()
    try:
        rows = list(db.scalars(select(PlayerProfile).where(PlayerProfile.checkin_token.is_(None))))
        for p in rows:
            p.checkin_token = secrets.token_urlsafe(32)
        if rows:
            db.commit()
            print(f"✓ {len(rows)} tokens generados")
        else:
            print("· todos los perfiles ya tienen token")
    finally:
        db.close()


if __name__ == "__main__":
    main()
