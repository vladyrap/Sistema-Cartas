from __future__ import annotations

from sqlalchemy import ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ExpTransaction(Base, TimestampMixin):
    """Auditoría de toda EXP ganada o perdida en una temporada.

    Cada award_exp() o deduct_exp() crea una fila acá. Esto permite revertir,
    auditar, mostrarle al jugador su historial, y debuggear cuándo subió de nivel.
    """

    __tablename__ = "exp_transactions"

    id: Mapped[int] = mapped_column(primary_key=True)
    season_id: Mapped[int] = mapped_column(ForeignKey("seasons.id"), nullable=False, index=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id"), nullable=False, index=True
    )

    amount: Mapped[int] = mapped_column(Integer, nullable=False)  # puede ser negativo
    reason: Mapped[str] = mapped_column(String(120), nullable=False)
    # Códigos sugeridos: "register", "complete_profile", "event_participation",
    # "round_won", "top_8", "top_4", "finalist", "champion", "challenge_participation",
    # "referral", "trade_day", "themed_deck", "no_show", "unsportsmanlike", "admin_adjust"
    reason_code: Mapped[str] = mapped_column(String(40), nullable=False)

    related_event_id: Mapped[int | None] = mapped_column(ForeignKey("events.id"))
    admin_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
