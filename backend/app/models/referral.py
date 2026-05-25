"""Referidos: jugador A invita a jugador B usando el Elite ID de A.

Flujo:
1. A comparte su Elite ID code (ej. EC-2026-000005).
2. B se registra usando ?ref=EC-2026-000005. Se crea Referral en estado PENDING.
3. Al activarse (B completa primer evento attended), se otorga bonus EXP a ambos
   y se marca ACTIVATED. Idempotente: solo se activa una vez por referido.
"""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, Enum, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class ReferralStatus(str, enum.Enum):
    PENDING = "PENDING"
    ACTIVATED = "ACTIVATED"


class Referral(Base, TimestampMixin):
    __tablename__ = "referrals"
    __table_args__ = (
        UniqueConstraint("referred_user_id", name="uq_referral_referred"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    referrer_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False, index=True
    )
    referred_user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id"), nullable=False
    )
    status: Mapped[ReferralStatus] = mapped_column(
        Enum(ReferralStatus, name="referral_status"),
        default=ReferralStatus.PENDING, nullable=False, index=True,
    )
    activated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
