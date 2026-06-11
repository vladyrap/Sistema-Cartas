"""TCG news public feed + admin refresh endpoint."""
from datetime import datetime
from typing import Literal

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import desc, select

from app.core.deps import AdminDep, DbDep
from app.models import TcgNews
from app.services import tcg_news as news_svc

router = APIRouter()


class NewsItem(BaseModel):
    id: int
    game_key: str
    title: str
    summary: str | None
    url: str
    image_url: str | None
    source: str
    source_label: str
    author: str | None
    score: int
    comments_count: int
    published_at: datetime


@router.get("/feed", response_model=list[NewsItem])
def news_feed(
    db: DbDep,
    game: str | None = Query(default=None, description="mtg|pokemon|ygo|onepiece|union_arena|digimon|general"),
    source: str | None = None,
    limit: int = Query(default=30, ge=1, le=100),
    offset: int = Query(default=0, ge=0, le=5000),
) -> list[NewsItem]:
    """Feed público — sin auth. Filtrable por juego y fuente. Más nuevo primero."""
    stmt = select(TcgNews).order_by(desc(TcgNews.published_at)).offset(offset).limit(limit)
    if game and game != "all":
        stmt = stmt.where(TcgNews.game_key == game)
    if source:
        stmt = stmt.where(TcgNews.source == source)
    rows = list(db.scalars(stmt))
    return [
        NewsItem(
            id=r.id, game_key=r.game_key, title=r.title, summary=r.summary,
            url=r.url, image_url=r.image_url,
            source=r.source, source_label=r.source_label,
            author=r.author, score=r.score, comments_count=r.comments_count,
            published_at=r.published_at,
        ) for r in rows
    ]


class SourceOut(BaseModel):
    source_id: str
    source_label: str
    game_key: str
    kind: str


@router.get("/sources", response_model=list[SourceOut])
def list_sources() -> list[SourceOut]:
    return [
        SourceOut(source_id=s.source_id, source_label=s.source_label, game_key=s.game_key, kind=s.kind)
        for s in news_svc.SOURCES
    ]


@router.post("/refresh")
def admin_refresh(admin: AdminDep) -> dict:
    """Trigger manual del fetcher. Útil para mostrar últimas noticias sin esperar el cron."""
    return news_svc.refresh_all()


# ═══════════════════════════════════════════════════════════════════════
#  Editorial manual — para TCGs cuyos feeds están bloqueados (Pokemon, YGO,
#  One Piece, Union Arena, Digimon). Admin agrega noticias a mano.
# ═══════════════════════════════════════════════════════════════════════


class EditorialNewsIn(BaseModel):
    game_key: Literal["mtg", "pokemon", "ygo", "onepiece", "union_arena", "digimon", "general"]
    title: str
    url: str
    summary: str | None = None
    image_url: str | None = None
    published_at: datetime | None = None


@router.post("/editorial", response_model=NewsItem)
def create_editorial_news(payload: EditorialNewsIn, admin: AdminDep, db: DbDep) -> NewsItem:
    """Crea una noticia editorial — útil para juegos sin RSS funcional."""
    from datetime import datetime as _dt, timezone as _tz
    import hashlib, re as _re

    h_input = (payload.url.strip().lower() + "|" + _re.sub(r"\s+", " ", payload.title.strip().lower()))
    content_hash = hashlib.sha1(h_input.encode("utf-8")).hexdigest()[:32]

    now = _dt.now(_tz.utc)
    pub = payload.published_at or now
    if pub.tzinfo is None:
        pub = pub.replace(tzinfo=_tz.utc)

    row = TcgNews(
        game_key=payload.game_key,
        title=payload.title[:400],
        summary=payload.summary,
        url=payload.url[:800],
        image_url=(payload.image_url or None) and payload.image_url[:800],
        source=f"editorial_{admin.id}",
        source_label="Editorial",
        author=admin.email,
        score=0, comments_count=0,
        published_at=pub, fetched_at=now,
        content_hash=content_hash,
    )
    db.add(row)
    try:
        db.commit()
        db.refresh(row)
    except Exception:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe una noticia con esa URL")
    return NewsItem(
        id=row.id, game_key=row.game_key, title=row.title, summary=row.summary,
        url=row.url, image_url=row.image_url, source=row.source, source_label=row.source_label,
        author=row.author, score=row.score, comments_count=row.comments_count,
        published_at=row.published_at,
    )


@router.delete("/editorial/{news_id}", status_code=204)
def delete_editorial_news(news_id: int, admin: AdminDep, db: DbDep):
    """Elimina cualquier item del feed — útil si una noticia auto-fetcheada es inapropiada."""
    row = db.get(TcgNews, news_id)
    if not row:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Noticia no encontrada")
    db.delete(row)
    db.commit()
