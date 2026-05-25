"""Tests de aislamiento multi-tenant.

Verifica que un GUILD_ADMIN de un Gremio NO puede tocar data de OTRO Gremio
a través de los endpoints scopeados.
"""
from __future__ import annotations

import os

# Forzar config de test ANTES de importar la app
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_isolation.db")
os.environ.setdefault("JWT_SECRET", "test-secret-multitenant-isolation-32chars-min")
os.environ.setdefault("EMAIL_BACKEND", "console")

from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event
from sqlalchemy.orm import sessionmaker

from app.core.deps import get_db
from app.core.security import create_access_token, hash_password
from app.main import app
from app.models import (
    Achievement, Base, Event, EventStatus, EventType, Game,
    Guild, GuildMembership, GuildRole, GuildStatus,
    Mission, PlayerProfile, Product, ProductAccess,
    Season, SeasonStatus, User, UserRole,
)


# Engine local solo para este test
_TEST_DB_FILE = "./test_isolation_mt.db"
_test_engine = create_engine(f"sqlite:///{_TEST_DB_FILE}", connect_args={"check_same_thread": False})


@event.listens_for(_test_engine, "connect")
def _fk(conn, _):
    cur = conn.cursor()
    cur.execute("PRAGMA foreign_keys=ON")
    cur.close()


TestSessionLocal = sessionmaker(bind=_test_engine, autoflush=False, autocommit=False, future=True)


def _override_get_db():
    db = TestSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(scope="module", autouse=True)
def _bind_test_db():
    """Setup: borra DB, crea schema. Teardown: borra DB y restaura."""
    if os.path.exists(_TEST_DB_FILE):
        os.remove(_TEST_DB_FILE)
    Base.metadata.create_all(bind=_test_engine)
    app.dependency_overrides[get_db] = _override_get_db
    yield
    app.dependency_overrides.pop(get_db, None)
    Base.metadata.drop_all(bind=_test_engine)
    if os.path.exists(_TEST_DB_FILE):
        try:
            os.remove(_TEST_DB_FILE)
        except OSError:
            pass


@pytest.fixture()
def seed():
    """Wipe + crea data fresca para cada test."""
    # Reset
    Base.metadata.drop_all(bind=_test_engine)
    Base.metadata.create_all(bind=_test_engine)
    db = TestSessionLocal()
    try:
        u1 = User(email="alice@test.cl", password_hash=hash_password("x"), role=UserRole.PLAYER)
        u2 = User(email="bob@test.cl",   password_hash=hash_password("x"), role=UserRole.PLAYER)
        db.add_all([u1, u2])
        db.flush()
        db.add_all([
            PlayerProfile(user_id=u1.id, alias="Alice", elite_id_code="EC-A", elite_id_number=1),
            PlayerProfile(user_id=u2.id, alias="Bob",   elite_id_code="EC-B", elite_id_number=2),
        ])

        g1 = Guild(code="g1", name="Gremio A", status=GuildStatus.ACTIVE, is_public=True)
        g2 = Guild(code="g2", name="Gremio B", status=GuildStatus.ACTIVE, is_public=True)
        db.add_all([g1, g2]); db.flush()

        now = datetime.now(timezone.utc)
        db.add_all([
            GuildMembership(user_id=u1.id, guild_id=g1.id, role=GuildRole.GUILD_ADMIN, is_active=True, joined_at=now),
            GuildMembership(user_id=u2.id, guild_id=g2.id, role=GuildRole.GUILD_ADMIN, is_active=True, joined_at=now),
        ])

        game = Game(code="op", name="One Piece", short_name="OP")
        db.add(game); db.flush()

        ids: dict[str, dict[str, int]] = {"g1": {}, "g2": {}}
        for g_obj, key in ((g1, "g1"), (g2, "g2")):
            s = Season(guild_id=g_obj.id, number=1, name=f"T1 {g_obj.code}",
                       starts_at=now, ends_at=now + timedelta(days=60),
                       status=SeasonStatus.ACTIVE)
            db.add(s); db.flush()
            ids[key]["season"] = s.id

            ev = Event(guild_id=g_obj.id, name=f"Torneo {g_obj.code}", game_id=game.id,
                       event_type=EventType.COMPETITIVE, status=EventStatus.OPEN,
                       starts_at=now + timedelta(days=1), slots=8, price_clp=0)
            db.add(ev); db.flush(); ids[key]["event"] = ev.id

            pr = Product(guild_id=g_obj.id, name=f"Booster {g_obj.code}",
                         price_clp=5000, stock=10, access=ProductAccess.NORMAL,
                         required_level=1, is_preorder=False, is_active=True)
            db.add(pr); db.flush(); ids[key]["product"] = pr.id

            ms = Mission(guild_id=g_obj.id, code=f"m-{g_obj.code}", name=f"Misión {g_obj.code}",
                         exp_reward=100, is_weekly=True, is_active=True)
            db.add(ms); db.flush(); ids[key]["mission"] = ms.id

            ac = Achievement(guild_id=g_obj.id, code=f"a-{g_obj.code}",
                             name=f"Medalla {g_obj.code}", is_seasonal=False, is_secret=False)
            db.add(ac); db.flush(); ids[key]["achievement"] = ac.id

        db.commit()
        return {
            "u1_id": u1.id, "u2_id": u2.id,
            "g1_id": g1.id, "g2_id": g2.id,
            "g2_event_id": ids["g2"]["event"],
            "g2_product_id": ids["g2"]["product"],
            "g2_mission_id": ids["g2"]["mission"],
            "g2_achievement_id": ids["g2"]["achievement"],
            "g2_season_id": ids["g2"]["season"],
        }
    finally:
        db.close()


@pytest.fixture()
def client():
    return TestClient(app)


def _auth(user_id: int) -> dict[str, str]:
    tok = create_access_token(user_id, extra_claims={"role": "PLAYER"})
    return {"Authorization": f"Bearer {tok}"}


def _hdr(user_id: int, guild_id: int) -> dict[str, str]:
    return {**_auth(user_id), "X-Guild-Id": str(guild_id)}


# ============================== Tests ==============================


def test_list_endpoints_only_return_own_guild_data(client, seed):
    r = client.get("/api/admin/events", headers=_hdr(seed["u1_id"], seed["g1_id"]))
    assert r.status_code == 200, r.text
    names = [e["name"] for e in r.json()]
    assert "Torneo g1" in names
    assert "Torneo g2" not in names


def test_alice_cannot_access_g2_admin(client, seed):
    r = client.get("/api/admin/events", headers=_hdr(seed["u1_id"], seed["g2_id"]))
    assert r.status_code == 403, r.text


def test_alice_cannot_edit_g2_event(client, seed):
    r = client.patch(
        f"/api/admin/events/{seed['g2_event_id']}",
        headers=_hdr(seed["u1_id"], seed["g1_id"]),
        json={"name": "hackeado"},
    )
    assert r.status_code in (403, 404), r.text


def test_alice_cannot_delete_g2_product(client, seed):
    r = client.delete(
        f"/api/admin/products/{seed['g2_product_id']}",
        headers=_hdr(seed["u1_id"], seed["g1_id"]),
    )
    assert r.status_code in (403, 404), r.text


def test_alice_cannot_edit_g2_mission(client, seed):
    r = client.patch(
        f"/api/admin/missions/{seed['g2_mission_id']}",
        headers=_hdr(seed["u1_id"], seed["g1_id"]),
        json={"name": "hackeada"},
    )
    assert r.status_code in (403, 404), r.text


def test_alice_cannot_edit_g2_achievement(client, seed):
    r = client.patch(
        f"/api/admin/achievements/{seed['g2_achievement_id']}",
        headers=_hdr(seed["u1_id"], seed["g1_id"]),
        json={"name": "hackeada"},
    )
    assert r.status_code in (403, 404), r.text


def test_alice_cannot_activate_g2_season(client, seed):
    r = client.post(
        f"/api/admin/seasons/{seed['g2_season_id']}/activate",
        headers=_hdr(seed["u1_id"], seed["g1_id"]),
    )
    assert r.status_code in (403, 404), r.text


def test_alice_cannot_list_g2_members(client, seed):
    r = client.get(
        f"/api/guilds/{seed['g2_id']}/members",
        headers=_auth(seed["u1_id"]),
    )
    assert r.status_code == 403, r.text


def test_alice_cannot_change_g2_settings(client, seed):
    r = client.patch(
        f"/api/guilds/{seed['g2_id']}/settings",
        headers=_auth(seed["u1_id"]),
        json={"tagline": "hackeado"},
    )
    assert r.status_code == 403, r.text


def test_no_x_guild_id_for_player_returns_400(client, seed):
    r = client.get("/api/admin/events", headers=_auth(seed["u1_id"]))
    assert r.status_code == 400, r.text


def test_public_endpoints_scope_correctly(client, seed):
    r1 = client.get("/api/events", headers={"X-Guild-Id": str(seed["g1_id"])})
    r2 = client.get("/api/events", headers={"X-Guild-Id": str(seed["g2_id"])})
    n1 = [e["name"] for e in r1.json()]
    n2 = [e["name"] for e in r2.json()]
    assert "Torneo g1" in n1 and "Torneo g2" not in n1
    assert "Torneo g2" in n2 and "Torneo g1" not in n2
