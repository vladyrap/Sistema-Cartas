from __future__ import annotations

from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class AdminActionLog(Base, TimestampMixin):
    """Auditoría de acciones administrativas (cerrar temporada, asignar EXP, etc.)."""

    __tablename__ = "admin_action_log"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Nullable: NULL = acción global del SUPER_ADMIN; non-null = scoped al Gremio
    guild_id: Mapped[int | None] = mapped_column(ForeignKey("guilds.id"), index=True)
    admin_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    # ej: "season.close", "season.create", "season.activate", "exp.adjust", "reservation.approve"
    target_kind: Mapped[str | None] = mapped_column(String(40))  # "season", "player", "event"...
    target_id: Mapped[int | None] = mapped_column()
    payload: Mapped[str | None] = mapped_column(Text)  # JSON serializado
