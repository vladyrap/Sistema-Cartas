"""Crea tabla auth_tokens + columna users.email_verified_at. Idempotente."""
from sqlalchemy import inspect, text

from app.core.db import engine
from app.models import AuthToken


def main():
    insp = inspect(engine)
    # 1) Tabla auth_tokens
    if "auth_tokens" not in insp.get_table_names():
        AuthToken.__table__.create(bind=engine)
        print("✓ tabla auth_tokens creada")
    else:
        print("· auth_tokens ya existe")

    # 2) Columna users.email_verified_at
    cols = [c["name"] for c in insp.get_columns("users")]
    if "email_verified_at" in cols:
        print("· users.email_verified_at ya existe")
    else:
        with engine.begin() as conn:
            conn.execute(text("ALTER TABLE users ADD COLUMN email_verified_at DATETIME"))
        print("✓ users.email_verified_at agregada")


if __name__ == "__main__":
    main()
