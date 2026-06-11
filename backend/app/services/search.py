"""Full-text search con SQLite FTS5.

Crea una tabla virtual `search_index` con contenido normalizado de:
  - PlayerProfile (alias, full_name, elite_id_code, bio)
  - PlayerDeck (name, archetype, leader_card, notes)
  - Product (name, category, description)
  - Game (name, code, short_name)

Cada documento tiene una `kind` ('player', 'deck', 'product', 'game') y un
`ref_id` que apunta a la PK de la tabla origen.

FTS5 está incluido en SQLite por defecto desde 3.20 (2017). Para Postgres en
producción habría que reemplazar con `tsvector + GIN index`; ya lo tenemos
abstraído detrás de search() y rebuild_index() para no acoplar el caller.
"""
from __future__ import annotations

import logging
from typing import Any

from sqlalchemy import text

from app.core.db import engine

logger = logging.getLogger(__name__)


_CREATE_TABLE_SQL = """
CREATE VIRTUAL TABLE IF NOT EXISTS search_index USING fts5(
    kind UNINDEXED,
    ref_id UNINDEXED,
    title,
    body,
    tags,
    tokenize = 'unicode61 remove_diacritics 2'
);
"""

_TRUNCATE_SQL = "DELETE FROM search_index;"


def _is_sqlite() -> bool:
    return engine.url.drivername.startswith("sqlite")


def ensure_table() -> None:
    """Crea la tabla virtual FTS5 si no existe. No-op fuera de SQLite —
    en Postgres la búsqueda usa el fallback ILIKE sobre las tablas reales."""
    if not _is_sqlite():
        return
    with engine.begin() as conn:
        conn.execute(text(_CREATE_TABLE_SQL))


def rebuild_index() -> int:
    """Trunca el índice FTS y lo repobla desde scratch.
    Devuelve cantidad de docs insertados. No-op en Postgres (usa ILIKE en vivo)."""
    if not _is_sqlite():
        return 0
    ensure_table()
    from app.core.db import SessionLocal
    from sqlalchemy import select
    from app.models import Game, PlayerDeck, PlayerProfile, Product

    db = SessionLocal()
    total = 0
    try:
        with engine.begin() as conn:
            conn.execute(text(_TRUNCATE_SQL))

            # Players
            for p in db.scalars(select(PlayerProfile)):
                conn.execute(text("""
                    INSERT INTO search_index (kind, ref_id, title, body, tags)
                    VALUES ('player', :ref, :title, :body, :tags)
                """), {
                    "ref": p.id,
                    "title": p.alias,
                    "body": " ".join(filter(None, [p.full_name, p.bio])),
                    "tags": p.elite_id_code,
                })
                total += 1

            # Decks (solo públicos para FTS — los privados también se indexan
            # pero el endpoint /search filtra por user)
            for d in db.scalars(select(PlayerDeck)):
                conn.execute(text("""
                    INSERT INTO search_index (kind, ref_id, title, body, tags)
                    VALUES ('deck', :ref, :title, :body, :tags)
                """), {
                    "ref": d.id,
                    "title": d.name,
                    "body": " ".join(filter(None, [d.archetype, d.leader_card, d.notes])),
                    "tags": "public" if d.is_public else "private",
                })
                total += 1

            # Products
            for prod in db.scalars(select(Product)):
                conn.execute(text("""
                    INSERT INTO search_index (kind, ref_id, title, body, tags)
                    VALUES ('product', :ref, :title, :body, :tags)
                """), {
                    "ref": prod.id,
                    "title": prod.name,
                    "body": " ".join(filter(None, [prod.category, prod.description])),
                    "tags": f"{'preorder' if prod.is_preorder else 'regular'} "
                            f"{prod.access.value if hasattr(prod.access, 'value') else prod.access}",
                })
                total += 1

            # Games
            for g in db.scalars(select(Game)):
                conn.execute(text("""
                    INSERT INTO search_index (kind, ref_id, title, body, tags)
                    VALUES ('game', :ref, :title, :body, :tags)
                """), {
                    "ref": g.id,
                    "title": g.name,
                    "body": g.description or "",
                    "tags": g.code,
                })
                total += 1
        logger.info("FTS rebuilt: %d docs", total)
    finally:
        db.close()
    return total


def _escape_fts_query(q: str) -> str:
    """Escapa caracteres especiales de FTS5 query syntax."""
    # FTS5: comillas dobles para frase exacta, paréntesis, NEAR, etc.
    # La forma segura es comillar y partir por espacios.
    parts = [p for p in q.replace('"', '').strip().split() if p]
    if not parts:
        return ""
    # Cada token con prefijo wildcard para autocomplete.
    return " ".join(f'"{p}"*' for p in parts)


def search(query: str, *, kind: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
    """Búsqueda FTS5. Devuelve lista de {kind, ref_id, title, snippet, rank}.

    `kind` filtra por player/deck/product/game; None devuelve todos.
    Soporta autocomplete (prefijos) por defecto.
    """
    if not query or len(query.strip()) < 2:
        return []
    if not _is_sqlite():
        return _search_ilike(query, kind=kind, limit=limit)

    ensure_table()
    fts_q = _escape_fts_query(query)
    if not fts_q:
        return []

    sql = """
        SELECT kind, ref_id, title,
               snippet(search_index, 3, '<mark>', '</mark>', '…', 12) AS snippet,
               bm25(search_index) AS rank
        FROM search_index
        WHERE search_index MATCH :q
    """
    params: dict[str, Any] = {"q": fts_q}
    if kind:
        sql += " AND kind = :kind"
        params["kind"] = kind
    sql += " ORDER BY rank LIMIT :lim"
    params["lim"] = limit

    with engine.begin() as conn:
        rows = conn.execute(text(sql), params).all()
    return [
        {
            "kind": r.kind,
            "ref_id": int(r.ref_id),
            "title": r.title,
            "snippet": r.snippet,
            "rank": float(r.rank),
        }
        for r in rows
    ]


def _search_ilike(query: str, *, kind: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
    """Fallback portable (Postgres) — ILIKE sobre las tablas reales. Sin
    ranking BM25, pero suficiente para autocomplete; ordena por prefijo exacto."""
    from app.core.db import SessionLocal
    from sqlalchemy import or_, select
    from app.models import Game, PlayerDeck, PlayerProfile, Product

    like = f"%{query.strip()}%"
    prefix = f"{query.strip()}%"
    out: list[dict[str, Any]] = []
    db = SessionLocal()
    try:
        sources = {
            "player": (PlayerProfile, PlayerProfile.alias, lambda r: r.alias),
            "deck": (PlayerDeck, PlayerDeck.name, lambda r: r.name),
            "product": (Product, Product.name, lambda r: r.name),
            "game": (Game, Game.name, lambda r: r.name),
        }
        kinds = [kind] if kind else list(sources)
        for k in kinds:
            model, title_col, title_fn = sources[k]
            rows = db.scalars(
                select(model).where(title_col.ilike(like)).limit(limit)
            )
            for r in rows:
                title = title_fn(r) or ""
                out.append({
                    "kind": k, "ref_id": int(r.id), "title": title,
                    "snippet": title,
                    # rank inverso: prefijo exacto primero (0), substring después (1)
                    "rank": 0.0 if title.lower().startswith(query.strip().lower()) else 1.0,
                })
    finally:
        db.close()
    out.sort(key=lambda d: (d["rank"], d["title"].lower()))
    return out[:limit]


# ============================== Sync triggers (incremental updates) ==============================


_TRIGGER_SQLS = [
    # Players
    """
    CREATE TRIGGER IF NOT EXISTS trg_search_player_ins AFTER INSERT ON player_profiles BEGIN
        INSERT INTO search_index(kind, ref_id, title, body, tags)
        VALUES ('player', NEW.id, NEW.alias,
                COALESCE(NEW.full_name, '') || ' ' || COALESCE(NEW.bio, ''),
                NEW.elite_id_code);
    END;
    """,
    """
    CREATE TRIGGER IF NOT EXISTS trg_search_player_upd AFTER UPDATE ON player_profiles BEGIN
        DELETE FROM search_index WHERE kind='player' AND ref_id=OLD.id;
        INSERT INTO search_index(kind, ref_id, title, body, tags)
        VALUES ('player', NEW.id, NEW.alias,
                COALESCE(NEW.full_name, '') || ' ' || COALESCE(NEW.bio, ''),
                NEW.elite_id_code);
    END;
    """,
    """
    CREATE TRIGGER IF NOT EXISTS trg_search_player_del AFTER DELETE ON player_profiles BEGIN
        DELETE FROM search_index WHERE kind='player' AND ref_id=OLD.id;
    END;
    """,
    # Decks
    """
    CREATE TRIGGER IF NOT EXISTS trg_search_deck_ins AFTER INSERT ON player_decks BEGIN
        INSERT INTO search_index(kind, ref_id, title, body, tags)
        VALUES ('deck', NEW.id, NEW.name,
                COALESCE(NEW.archetype, '') || ' ' || COALESCE(NEW.leader_card, ''),
                CASE WHEN NEW.is_public=1 THEN 'public' ELSE 'private' END);
    END;
    """,
    """
    CREATE TRIGGER IF NOT EXISTS trg_search_deck_upd AFTER UPDATE ON player_decks BEGIN
        DELETE FROM search_index WHERE kind='deck' AND ref_id=OLD.id;
        INSERT INTO search_index(kind, ref_id, title, body, tags)
        VALUES ('deck', NEW.id, NEW.name,
                COALESCE(NEW.archetype, '') || ' ' || COALESCE(NEW.leader_card, ''),
                CASE WHEN NEW.is_public=1 THEN 'public' ELSE 'private' END);
    END;
    """,
    """
    CREATE TRIGGER IF NOT EXISTS trg_search_deck_del AFTER DELETE ON player_decks BEGIN
        DELETE FROM search_index WHERE kind='deck' AND ref_id=OLD.id;
    END;
    """,
    # Products
    """
    CREATE TRIGGER IF NOT EXISTS trg_search_product_ins AFTER INSERT ON products BEGIN
        INSERT INTO search_index(kind, ref_id, title, body, tags)
        VALUES ('product', NEW.id, NEW.name,
                COALESCE(NEW.category, '') || ' ' || COALESCE(NEW.description, ''),
                CASE WHEN NEW.is_preorder=1 THEN 'preorder' ELSE 'regular' END);
    END;
    """,
    """
    CREATE TRIGGER IF NOT EXISTS trg_search_product_upd AFTER UPDATE ON products BEGIN
        DELETE FROM search_index WHERE kind='product' AND ref_id=OLD.id;
        INSERT INTO search_index(kind, ref_id, title, body, tags)
        VALUES ('product', NEW.id, NEW.name,
                COALESCE(NEW.category, '') || ' ' || COALESCE(NEW.description, ''),
                CASE WHEN NEW.is_preorder=1 THEN 'preorder' ELSE 'regular' END);
    END;
    """,
    """
    CREATE TRIGGER IF NOT EXISTS trg_search_product_del AFTER DELETE ON products BEGIN
        DELETE FROM search_index WHERE kind='product' AND ref_id=OLD.id;
    END;
    """,
]


def install_triggers() -> None:
    """Instala los triggers SQLite que mantienen FTS sync con INSERT/UPDATE/DELETE
    en las tablas origen. Solo SQLite — no usar en Postgres."""
    ensure_table()
    if not engine.url.drivername.startswith("sqlite"):
        logger.info("FTS triggers skipped (no es SQLite)")
        return
    with engine.begin() as conn:
        for sql in _TRIGGER_SQLS:
            conn.execute(text(sql))
    logger.info("FTS triggers installed (%d)", len(_TRIGGER_SQLS))
