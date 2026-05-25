from __future__ import annotations

from datetime import datetime
from enum import Enum

from sqlalchemy import DateTime, Enum as SAEnum, ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class JoinRequestStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class GuildJoinRequest(Base, TimestampMixin):
    """Solicitud de un usuario para unirse a un Gremio.

    Reemplaza el join directo: ahora el GUILD_ADMIN aprueba/rechaza.
    Solo puede haber UNA solicitud PENDING por (user, guild) a la vez.
    """

    __tablename__ = "guild_join_requests"
    __table_args__ = (
        UniqueConstraint("user_id", "guild_id", "status", name="uq_join_req_user_guild_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    guild_id: Mapped[int] = mapped_column(ForeignKey("guilds.id"), nullable=False, index=True)
    status: Mapped[JoinRequestStatus] = mapped_column(
        SAEnum(JoinRequestStatus, name="join_request_status"),
        default=JoinRequestStatus.PENDING,
        nullable=False,
        index=True,
    )
    message: Mapped[str | None] = mapped_column(String(500))
    decided_by_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decision_note: Mapped[str | None] = mapped_column(String(500))
