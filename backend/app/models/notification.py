from __future__ import annotations

from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class Notification(Base, TimestampMixin):
    """Notificación in-app para un jugador.

    Tipos sugeridos (string libre):
      - level_up
      - achievement_granted
      - mission_completed
      - reservation_approved
      - reservation_rejected
      - reservation_paid
      - event_registered
      - event_finished_results
      - season_closed
      - admin_message
    """

    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Gremio que origina la notif. Nullable porque hay notifs globales (level_up histórico).
    guild_id: Mapped[int | None] = mapped_column(ForeignKey("guilds.id"), index=True)
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(160), nullable=False)
    body: Mapped[str | None] = mapped_column(Text)
    link: Mapped[str | None] = mapped_column(String(300))  # ej. /events/12, /profile, /missions
    is_read: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
