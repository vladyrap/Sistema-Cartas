from __future__ import annotations

from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, ReservationStatus, TimestampMixin


class Reservation(Base, TimestampMixin):
    __tablename__ = "reservations"

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id"), nullable=False, index=True
    )
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"), nullable=False, index=True)
    # Variant específica reservada. Si null, la reserva es a nivel Product
    # (productos sin variantes).
    variant_id: Mapped[int | None] = mapped_column(
        ForeignKey("product_variants.id", ondelete="SET NULL"), index=True
    )

    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    status: Mapped[ReservationStatus] = mapped_column(
        Enum(ReservationStatus, name="reservation_status"),
        default=ReservationStatus.PENDING,
        nullable=False,
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    note: Mapped[str | None] = mapped_column(String(500))

    # MercadoPago: preference creada al iniciar pago + payment_id confirmado por webhook.
    mp_preference_id: Mapped[str | None] = mapped_column(String(80), index=True)
    mp_payment_id: Mapped[str | None] = mapped_column(String(80), index=True)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
