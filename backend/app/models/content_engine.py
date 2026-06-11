"""Content Engine — generación automática de contenido social post-torneo.

Pipeline: finalize → ContentJob → harvest (DB) → análisis (Sonnet) →
generación por plataforma (Fable) → aprobación admin → publicación →
métricas → Social Impact Score → winning hooks (few-shot del analista).
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    CheckConstraint, DateTime, Float, ForeignKey, Index, Integer, String,
    Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin

JOB_STATUSES = ("PENDING", "HARVESTING", "ANALYZING", "GENERATING", "READY", "FAILED")
PIECE_STATUSES = ("DRAFT", "APPROVED", "REJECTED", "PUBLISHED", "SKIPPED")
PLATFORMS = ("tiktok", "instagram", "facebook", "youtube_shorts", "discord")


class ContentJob(Base, TimestampMixin):
    """Job maestro: 1 por evento. Regenerar todo = endpoint explícito."""
    __tablename__ = "content_jobs"
    __table_args__ = (
        UniqueConstraint("event_id", name="uq_content_job_event"),
        CheckConstraint(
            "status IN ('PENDING','HARVESTING','ANALYZING','GENERATING','READY','FAILED')",
            name="ck_content_job_status",
        ),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False, index=True)
    harvest_json: Mapped[str | None] = mapped_column(Text)   # datos crudos auditables
    brief_json: Mapped[str | None] = mapped_column(Text)     # output del analista
    error: Mapped[str | None] = mapped_column(Text)
    retries: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    analysis_model: Mapped[str | None] = mapped_column(String(60))


class ContentPiece(Base, TimestampMixin):
    """Pack de contenido por plataforma. body_json sigue la receta de la red."""
    __tablename__ = "content_pieces"
    __table_args__ = (
        UniqueConstraint("job_id", "platform", "generation", name="uq_piece_gen"),
        Index("ix_piece_platform_status", "platform", "status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    job_id: Mapped[int] = mapped_column(
        ForeignKey("content_jobs.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False, index=True
    )
    platform: Mapped[str] = mapped_column(String(20), nullable=False)
    body_json: Mapped[str] = mapped_column(Text, nullable=False)
    edited_body_json: Mapped[str | None] = mapped_column(Text)  # edición admin (original intacto)
    status: Mapped[str] = mapped_column(String(20), default="DRAFT", nullable=False, index=True)
    revision_note: Mapped[str | None] = mapped_column(String(500))
    generation: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    writer_model: Mapped[str | None] = mapped_column(String(60))
    approved_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
    approved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    published_url: Mapped[str | None] = mapped_column(String(800))
    impact_score: Mapped[float | None] = mapped_column(Float)  # SIS del último snapshot


class ContentMetric(Base, TimestampMixin):
    """Snapshot de métricas — el SIS evoluciona los primeros días."""
    __tablename__ = "content_metrics"

    id: Mapped[int] = mapped_column(primary_key=True)
    piece_id: Mapped[int] = mapped_column(
        ForeignKey("content_pieces.id", ondelete="CASCADE"), nullable=False, index=True
    )
    captured_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    views: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    likes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    comments: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    shares: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    saves: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    source: Mapped[str] = mapped_column(String(20), default="manual", nullable=False)


class ContentWinningHook(Base, TimestampMixin):
    """Hooks con SIS alto — few-shot del analista (el engine aprende tu voz)."""
    __tablename__ = "content_winning_hooks"

    id: Mapped[int] = mapped_column(primary_key=True)
    platform: Mapped[str] = mapped_column(String(20), nullable=False, index=True)
    hook_text: Mapped[str] = mapped_column(String(300), nullable=False)
    impact_score: Mapped[float] = mapped_column(Float, nullable=False)
    event_id: Mapped[int | None] = mapped_column(ForeignKey("events.id", ondelete="SET NULL"))
