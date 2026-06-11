"""Bootstrap de base de datos para PRODUCCIÓN — idempotente, portable a Postgres.

Reemplaza la cadena de 34 migraciones manuales (que usan sintaxis SQLite) en un
deploy fresco: SQLAlchemy genera el schema completo con tipos portables vía
create_all(). Las migraciones incrementales solo existían para evolucionar el
SQLite de dev sin perder datos — en una base nueva no se necesitan.

Qué hace (todo idempotente, NUNCA borra datos):
  1. create_all  -> crea las tablas que falten
  2. install_triggers -> triggers FTS5 (no-op fuera de SQLite)
  3. gremio raíz + games base si la base está vacía
  4. usuario admin desde ADMIN_EMAIL / ADMIN_PASSWORD (env) si no existe

Uso:
    DATABASE_URL=postgresql+psycopg2://user:pass@host/elitecards \
    ADMIN_EMAIL=admin@tutienda.cl ADMIN_PASSWORD=... \
    python -m scripts.init_db
"""
import os
import sys
from pathlib import Path

# Consolas Windows (cp1252) no imprimen acentos/glyphs — forzamos UTF-8.
try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from sqlalchemy import func, select

from app.core.db import SessionLocal, engine
from app.core.security import hash_password
from app.models import Base, Game, Guild, GuildStatus, PlayerProfile, User, UserRole
from app.services import search as search_svc
from app.services.elite_id import generate_next_elite_id


def _create_schema() -> None:
    print(f"-> Dialecto: {engine.url.drivername}")
    Base.metadata.create_all(bind=engine)
    print("[ok] Schema creado/actualizado (create_all)")
    search_svc.install_triggers()
    print("[ok] Triggers FTS instalados (no-op si no es SQLite)")


def _seed_minimum(db) -> None:
    # Gremio raíz (tenant principal)
    if not db.scalar(select(func.count(Guild.id))):
        from scripts.seed import seed_guild, seed_games
        seed_guild(db)
        seed_games(db)
        db.commit()
        print("[ok] Gremio raíz + games base creados")
    else:
        print("= Ya hay gremio(s) — no se toca")

    # Admin
    admin_email = os.environ.get("ADMIN_EMAIL", "admin@elitecards.cl")
    admin_pass = os.environ.get("ADMIN_PASSWORD")
    existing = db.scalar(select(User).where(User.email == admin_email))
    if existing:
        print(f"= Admin {admin_email} ya existe")
        return
    if not admin_pass:
        print(f"[!] Sin ADMIN_PASSWORD en env — admin '{admin_email}' NO creado.")
        print("  Reejecutá con ADMIN_PASSWORD=... para crear el admin inicial.")
        return
    user = User(email=admin_email, password_hash=hash_password(admin_pass),
                role=UserRole.SUPER_ADMIN, email_verified_at=func.now())
    db.add(user)
    db.flush()
    code, num = generate_next_elite_id(db)
    db.add(PlayerProfile(user_id=user.id, alias="admin",
                         elite_id_code=code, elite_id_number=num))
    db.commit()
    print(f"[ok] Admin SUPER_ADMIN creado: {admin_email}")


def main() -> None:
    _create_schema()
    db = SessionLocal()
    try:
        _seed_minimum(db)
    finally:
        db.close()
    print("\n[DONE] init_db completo.")


if __name__ == "__main__":
    main()
