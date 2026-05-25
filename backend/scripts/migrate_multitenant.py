"""Migración a multi-tenant ("Gremios de Aventureros"). Idempotente.

Pasos:
  1. Crea tablas guilds + guild_memberships si no existen.
  2. Crea el "Gremio Principal" (id=1) si no existe.
  3. Agrega columna guild_id (nullable) a: seasons, events, products, missions,
     achievements, titles, admin_action_log.
  4. Backfill: setea guild_id=1 a todas las filas existentes.
  5. Crea GuildMembership para cada PlayerProfile existente:
       - role = GUILD_ADMIN si User.role == ADMIN
       - role = MEMBER en otro caso
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import inspect, select, text

from app.core.db import engine, SessionLocal
from app.models import Guild, GuildMembership, GuildRole, GuildStatus, PlayerProfile, User, UserRole


TABLES_NEEDING_GUILD_ID = [
    "seasons", "events", "products", "missions", "achievements", "titles", "admin_action_log",
]


def ensure_guild_tables():
    inspector = inspect(engine)
    if "guilds" not in inspector.get_table_names():
        Guild.__table__.create(bind=engine)
        print("✓ tabla guilds creada")
    else:
        print("· tabla guilds ya existe")
    if "guild_memberships" not in inspector.get_table_names():
        GuildMembership.__table__.create(bind=engine)
        print("✓ tabla guild_memberships creada")
    else:
        print("· tabla guild_memberships ya existe")


def add_guild_id_columns():
    inspector = inspect(engine)
    with engine.begin() as conn:
        for table in TABLES_NEEDING_GUILD_ID:
            if table not in inspector.get_table_names():
                print(f"· tabla {table} no existe — saltando")
                continue
            cols = [c["name"] for c in inspector.get_columns(table)]
            if "guild_id" in cols:
                print(f"· {table}.guild_id ya existe")
                continue
            conn.execute(text(f"ALTER TABLE {table} ADD COLUMN guild_id INTEGER"))
            print(f"✓ {table}.guild_id agregado")


def create_default_guild(db) -> Guild:
    existing = db.scalar(select(Guild).where(Guild.code == "principal"))
    if existing:
        print(f"· Gremio Principal ya existe (id={existing.id})")
        return existing

    # Buscar primer admin para owner_user_id (sino el primer usuario)
    owner = db.scalar(select(User).where(User.role == UserRole.ADMIN))
    if owner is None:
        owner = db.scalar(select(User).order_by(User.id))
    owner_id = owner.id if owner else None

    g = Guild(
        code="principal",
        name="Gremio Principal",
        tagline="El Gremio fundador de EliteCards",
        description="Gremio creado automáticamente durante la migración a multi-tenant. Contiene toda la data legacy.",
        owner_user_id=owner_id,
        status=GuildStatus.ACTIVE,
        is_public=True,
    )
    db.add(g)
    db.commit()
    db.refresh(g)
    print(f"✓ Gremio Principal creado (id={g.id})")
    return g


def backfill_guild_id(guild_id: int):
    with engine.begin() as conn:
        for table in TABLES_NEEDING_GUILD_ID:
            try:
                result = conn.execute(
                    text(f"UPDATE {table} SET guild_id = :gid WHERE guild_id IS NULL"),
                    {"gid": guild_id},
                )
                if result.rowcount > 0:
                    print(f"✓ backfill {table}: {result.rowcount} filas")
                else:
                    print(f"· {table}: nada que migrar")
            except Exception as e:
                print(f"⚠ {table}: {e}")


def create_memberships(db, guild_id: int):
    profiles = list(db.scalars(select(PlayerProfile)))
    if not profiles:
        print("· sin jugadores que migrar")
        return

    created = 0
    now = datetime.now(timezone.utc)
    for p in profiles:
        existing = db.scalar(
            select(GuildMembership).where(
                GuildMembership.user_id == p.user_id, GuildMembership.guild_id == guild_id
            )
        )
        if existing:
            continue
        user = db.get(User, p.user_id)
        if not user:
            continue
        role = GuildRole.GUILD_ADMIN if user.role == UserRole.ADMIN else GuildRole.MEMBER
        db.add(GuildMembership(
            user_id=user.id, guild_id=guild_id, role=role, is_active=True, joined_at=now,
        ))
        created += 1

    db.commit()
    print(f"✓ {created} memberships creadas en Gremio Principal")


def main():
    print("=" * 60)
    print("EliteCards — Migración a multi-tenant")
    print("=" * 60)

    ensure_guild_tables()
    add_guild_id_columns()

    db = SessionLocal()
    try:
        guild = create_default_guild(db)
        backfill_guild_id(guild.id)
        create_memberships(db, guild.id)
    finally:
        db.close()

    print("=" * 60)
    print("✓ Migración completa.")
    print("  - Gremio Principal creado (code='principal')")
    print("  - Toda la data legacy asignada a Gremio Principal")
    print("  - Memberships creadas para todos los jugadores")
    print("=" * 60)


if __name__ == "__main__":
    main()
