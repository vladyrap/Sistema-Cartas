"""TCG news aggregator — items fetched from Reddit JSON + official RSS feeds.

Política de retención: ~30 días. El scheduler limpia items viejos cada noche.
Dedup por content_hash (sha1 de url + title) — la misma noticia desde múltiples
fuentes solo entra una vez.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Index, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class TcgNews(Base, TimestampMixin):
    __tablename__ = "tcg_news"
    __table_args__ = (
        Index("ix_tcg_news_game_pub", "game_key", "published_at"),
        Index("ix_tcg_news_pub", "published_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # mtg | pokemon | ygo | onepiece | union_arena | digimon | general
    game_key: Mapped[str] = mapped_column(String(20), nullable=False, index=True)

    title: Mapped[str] = mapped_column(String(400), nullable=False)
    summary: Mapped[str | None] = mapped_column(Text)
    url: Mapped[str] = mapped_column(String(800), nullable=False, unique=True)
    image_url: Mapped[str | None] = mapped_column(String(800))

    source: Mapped[str] = mapped_column(String(60), nullable=False)        # internal id: reddit_magictcg
    source_label: Mapped[str] = mapped_column(String(120), nullable=False) # human: r/magicTCG
    author: Mapped[str | None] = mapped_column(String(120))

    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False, index=True)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)

    score: Mapped[int] = mapped_column(Integer, default=0, nullable=False)   # likes/upvotes si la fuente lo expone
    comments_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    content_hash: Mapped[str] = mapped_column(String(48), nullable=False, index=True)
