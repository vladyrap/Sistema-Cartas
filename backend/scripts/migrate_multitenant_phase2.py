"""Migración multi-tenant Fase 2. Idempotente.

Cierra los pendientes que dejó la migración inicial:

1. Verifica que no haya rows con `guild_id IS NULL` en las tablas scopeadas.
2. Rebuild SQLite de cada tabla para hacer `guild_id NOT NULL`.
3. Swap del UNIQUE de `seasons.number` global → `(guild_id, number)` por Gremio.
4. Crea la tabla `guild_join_requests` para el workflow de solicitudes.

SQLite no soporta ALTER COLUMN ni cambiar UNIQUE in-place: usamos el patrón
oficial de rebuild (https://www.sqlite.org/lang_altertable.html#otheralter).
"""
from __future__ import annotations

import re

from sqlalchemy import inspect, text

from app.core.db import engine
from app.models import GuildJoinRequest


SCOPED_TABLES = ["seasons", "events", "products", "missions", "achievements", "titles"]


def verify_no_nulls() -> bool:
    bad = []
    with engine.connect() as conn:
        for tbl in SCOPED_TABLES:
            n = conn.execute(text(f"SELECT COUNT(*) FROM {tbl} WHERE guild_id IS NULL")).scalar()
            if n:
                bad.append((tbl, n))
    if bad:
        print("✗ Hay filas con guild_id NULL — corre migrate_multitenant.py primero:")
        for tbl, n in bad:
            print(f"   {tbl}: {n} filas")
        return False
    print("✓ Todas las tablas scopeadas tienen guild_id en todas las filas")
    return True


def _get_table_sql(conn, table: str) -> str:
    row = conn.execute(text(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=:t"
    ), {"t": table}).first()
    return row[0] if row else ""


def _get_indexes(conn, table: str) -> list[tuple[str, str]]:
    rows = conn.execute(text(
        "SELECT name, sql FROM sqlite_master "
        "WHERE type='index' AND tbl_name=:t AND sql IS NOT NULL"
    ), {"t": table}).all()
    return [(r[0], r[1]) for r in rows]


def _rebuild_table_with_not_null(table: str, *, is_seasons: bool = False):
    """Rebuild de una tabla en SQLite para hacer guild_id NOT NULL.

    Si `is_seasons`, además swap del UNIQUE.
    """
    with engine.begin() as conn:
        # Detectar si ya está NOT NULL: si lo está, skip.
        create_sql = _get_table_sql(conn, table)
        if not create_sql:
            print(f"· {table}: tabla no existe, salto")
            return
        # Heurística simple: buscamos "guild_id" seguido por NOT NULL en la línea.
        already_not_null = bool(re.search(
            r"guild_id\s+\w+[^,]*\bNOT\s+NULL\b", create_sql, re.IGNORECASE
        ))
        already_composite = bool(re.search(
            r"uq_season_guild_number", create_sql, re.IGNORECASE
        )) if is_seasons else True

        if already_not_null and already_composite:
            print(f"· {table}: ya está al día (guild_id NOT NULL"
                  + (", unique compuesto" if is_seasons else "")
                  + ")")
            return

        indexes = _get_indexes(conn, table)
        # Construimos el nuevo CREATE TABLE manipulando el SQL existente.
        new_sql = create_sql
        # 1) guild_id INTEGER → guild_id INTEGER NOT NULL REFERENCES guilds(id)
        new_sql = re.sub(
            r"(\bguild_id\s+INTEGER\b)(?!\s+NOT\s+NULL)",
            r"\1 NOT NULL REFERENCES guilds(id)",
            new_sql,
            flags=re.IGNORECASE,
        )
        # 2) Para seasons: swap UNIQUE
        if is_seasons:
            # Quita la constraint global UNIQUE(number) — puede venir como
            # `CONSTRAINT uq_season_number UNIQUE (number)` o variantes.
            new_sql = re.sub(
                r",\s*CONSTRAINT\s+uq_season_number\s+UNIQUE\s*\(\s*number\s*\)",
                "",
                new_sql,
                flags=re.IGNORECASE,
            )
            new_sql = re.sub(
                r",\s*UNIQUE\s*\(\s*number\s*\)",
                "",
                new_sql,
                flags=re.IGNORECASE,
            )
            # Agrega el nuevo UNIQUE (guild_id, number) antes del cierre de paréntesis.
            new_sql = re.sub(
                r"\)(\s*)$",
                r", CONSTRAINT uq_season_guild_number UNIQUE (guild_id, number))\1",
                new_sql,
                count=1,
            )

        # Renombramos el target en el CREATE: TABLE seasons → TABLE _new_seasons
        new_sql = re.sub(
            rf'\bCREATE\s+TABLE\s+(?:"{table}"|{table})\b',
            f'CREATE TABLE _new_{table}',
            new_sql,
            count=1,
            flags=re.IGNORECASE,
        )

        # Rebuild dentro de la transacción.
        conn.execute(text("PRAGMA foreign_keys=OFF"))
        conn.execute(text(new_sql))
        # Copiar datos (mismas columnas, mismo orden).
        cols_info = inspect(engine).get_columns(table)
        col_names = ", ".join(c["name"] for c in cols_info)
        conn.execute(text(
            f"INSERT INTO _new_{table} ({col_names}) SELECT {col_names} FROM {table}"
        ))
        conn.execute(text(f"DROP TABLE {table}"))
        conn.execute(text(f"ALTER TABLE _new_{table} RENAME TO {table}"))
        # Recrear índices (los unique constraints quedan en el CREATE TABLE
        # pero los `CREATE INDEX` separados se perdieron al hacer DROP).
        for idx_name, idx_sql in indexes:
            try:
                conn.execute(text(idx_sql))
            except Exception as e:
                print(f"   ⚠ no se pudo recrear índice {idx_name}: {e}")
        # Índice en guild_id para queries scopeadas (no existía antes en BD).
        idx_name = f"ix_{table}_guild_id"
        already = conn.execute(text(
            "SELECT 1 FROM sqlite_master WHERE type='index' AND name=:n"
        ), {"n": idx_name}).first()
        if not already:
            conn.execute(text(f"CREATE INDEX {idx_name} ON {table}(guild_id)"))
        conn.execute(text("PRAGMA foreign_keys=ON"))
        # Sanity check
        bad = conn.execute(text("PRAGMA foreign_key_check")).all()
        if bad:
            raise RuntimeError(f"FK check falló post-rebuild de {table}: {bad}")
    print(f"✓ {table}: rebuilt con guild_id NOT NULL"
          + (" + unique (guild_id, number)" if is_seasons else ""))


def ensure_join_requests_table():
    insp = inspect(engine)
    if "guild_join_requests" not in insp.get_table_names():
        GuildJoinRequest.__table__.create(bind=engine)
        print("✓ tabla guild_join_requests creada")
    else:
        print("· tabla guild_join_requests ya existe")


def main():
    print("=" * 60)
    print("EliteCards — Migración multi-tenant Fase 2")
    print("=" * 60)

    if not verify_no_nulls():
        return 1

    for tbl in SCOPED_TABLES:
        _rebuild_table_with_not_null(tbl, is_seasons=(tbl == "seasons"))

    ensure_join_requests_table()

    print("=" * 60)
    print("✓ Migración Fase 2 completa.")
    print("=" * 60)
    return 0


if __name__ == "__main__":
    import sys
    sys.exit(main())
