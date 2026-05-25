"""Fixtures pytest compartidas — DB en memoria limpia por test."""
from __future__ import annotations

import os

# Forzar SQLite en memoria antes de importar la app
os.environ["DATABASE_URL"] = "sqlite:///:memory:"
os.environ["JWT_SECRET"] = "test-secret"

import pytest
from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from app.core.security import hash_password
from app.models import (
    Base,
    Game,
    PlayerProfile,
    Season,
    SeasonStatus,
    User,
    UserRole,
)


@pytest.fixture()
def engine():
    """Engine SQLite en memoria con FK habilitadas, una BD por test."""
    eng = create_engine("sqlite:///:memory:", connect_args={"check_same_thread": False})

    @event.listens_for(eng, "connect")
    def _enable_fk(conn, _):
        cursor = conn.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(bind=eng)
    return eng


@pytest.fixture()
def db(engine) -> Session:
    SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, future=True)
    session = SessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture()
def game(db: Session) -> Game:
    g = Game(code="one_piece", name="One Piece", short_name="OP")
    db.add(g)
    db.commit()
    db.refresh(g)
    return g


@pytest.fixture()
def make_player(db: Session):
    """Factory para crear jugadores."""
    counter = {"n": 0}

    def _make(alias: str = "", **extra) -> PlayerProfile:
        counter["n"] += 1
        n = counter["n"]
        alias = alias or f"player{n}"
        user = User(
            email=f"{alias.lower()}@test.cl",
            password_hash=hash_password("password123"),
            role=UserRole.PLAYER,
        )
        db.add(user)
        db.flush()
        from app.services.elite_id import generate_next_elite_id
        code, num = generate_next_elite_id(db)
        p = PlayerProfile(
            user_id=user.id, alias=alias, elite_id_code=code, elite_id_number=num,
            **extra,
        )
        db.add(p)
        db.commit()
        db.refresh(p)
        return p

    return _make


@pytest.fixture()
def make_season(db: Session):
    counter = {"n": 0}

    def _make(name: str = "", status: SeasonStatus = SeasonStatus.DRAFT, **extra) -> Season:
        from datetime import datetime, timedelta, timezone
        counter["n"] += 1
        n = counter["n"]
        s = Season(
            number=n,
            name=name or f"Temporada {n}",
            starts_at=datetime.now(timezone.utc),
            ends_at=datetime.now(timezone.utc) + timedelta(days=90),
            status=status,
            **extra,
        )
        db.add(s)
        db.commit()
        db.refresh(s)
        return s

    return _make
