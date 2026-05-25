from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, String, Text, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, GuildRole, GuildStatus, TimestampMixin


class Guild(Base, TimestampMixin):
    """Un Gremio de Aventureros — la tienda/sociedad. Tenant del sistema."""

    __tablename__ = "guilds"

    id: Mapped[int] = mapped_column(primary_key=True)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    name: Mapped[str] = mapped_column(String(120), nullable=False)
    tagline: Mapped[str | None] = mapped_column(String(200))
    description: Mapped[str | None] = mapped_column(Text)
    logo_url: Mapped[str | None] = mapped_column(String(500))
    banner_url: Mapped[str | None] = mapped_column(String(500))
    accent_color: Mapped[str | None] = mapped_column(String(20))  # hex color para branding

    owner_user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    status: Mapped[GuildStatus] = mapped_column(
        Enum(GuildStatus, name="guild_status"), default=GuildStatus.ACTIVE, nullable=False
    )
    is_public: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class GuildMembership(Base, TimestampMixin):
    """Relación usuario ↔ Gremio con rol específico."""

    __tablename__ = "guild_memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "guild_id", name="uq_guild_membership"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    guild_id: Mapped[int] = mapped_column(
        ForeignKey("guilds.id", ondelete="CASCADE"), nullable=False, index=True
    )
    role: Mapped[GuildRole] = mapped_column(
        Enum(GuildRole, name="guild_role"), default=GuildRole.MEMBER, nullable=False
    )
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
