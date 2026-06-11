"""Páginas marcadas como Coming Soon — el front muestra overlay en lugar del contenido."""
from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ComingSoonPage(Base, TimestampMixin):
    __tablename__ = "coming_soon_pages"
    __table_args__ = (
        UniqueConstraint("route", name="uq_coming_soon_route"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    # Path frontend exacto, ej: "/wrapped", "/quantum". Match exacto (case-insensitive).
    # También soporta path con :param — el front normaliza antes de comparar.
    route: Mapped[str] = mapped_column(String(200), nullable=False)
    title: Mapped[str] = mapped_column(String(120), nullable=False, default="Próximamente")
    message: Mapped[str | None] = mapped_column(Text)
    image_url: Mapped[str | None] = mapped_column(String(800))
    # ETA opcional, freeform: "Q3 2026", "después del torneo Halloween", "muy pronto"
    eta: Mapped[str | None] = mapped_column(String(120))
    is_enabled: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True)

    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )
