"""Helper de paginación para endpoints que devuelven listas grandes.

Patrón: el caller construye el `select(...)` base, llama `paginate(db, stmt, page, page_size)`
y recibe `(items, meta)`.
"""
from __future__ import annotations

from typing import TypeVar

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.schemas.common import PageMeta

T = TypeVar("T")

MAX_PAGE_SIZE = 200
DEFAULT_PAGE_SIZE = 30


def normalize(page: int, page_size: int) -> tuple[int, int]:
    page = max(1, int(page or 1))
    page_size = max(1, min(MAX_PAGE_SIZE, int(page_size or DEFAULT_PAGE_SIZE)))
    return page, page_size


def paginate(db: Session, stmt, page: int, page_size: int) -> tuple[list, PageMeta]:
    """Aplica LIMIT/OFFSET al `stmt` y devuelve items + meta de paginación.

    El stmt puede tener cualquier orden; lo respetamos. El COUNT se hace
    sobre el stmt sin order_by para eficiencia.
    """
    page, page_size = normalize(page, page_size)

    # Total count (sin order_by, sin limit/offset)
    count_stmt = select(func.count()).select_from(stmt.order_by(None).subquery())
    total = db.scalar(count_stmt) or 0

    pages = (total + page_size - 1) // page_size if total else 0

    # Page items
    items_stmt = stmt.limit(page_size).offset((page - 1) * page_size)
    items = list(db.execute(items_stmt).all())

    return items, PageMeta(page=page, page_size=page_size, total=total, pages=pages)
