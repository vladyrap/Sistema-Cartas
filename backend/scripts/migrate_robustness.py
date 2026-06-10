"""Migración: revoked_tokens + login_attempts. Idempotente."""
from sqlalchemy import inspect

from app.core.db import engine
from app.models.token_blocklist import RevokedToken
from app.models.login_attempt import LoginAttempt


def main():
    insp = inspect(engine)
    existing = set(insp.get_table_names())
    for model in (RevokedToken, LoginAttempt):
        name = model.__tablename__
        if name in existing:
            print(f"- {name} ya existe")
        else:
            model.__table__.create(bind=engine)
            print(f"+ {name} creada")


if __name__ == "__main__":
    main()
