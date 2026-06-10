"""Intentos de login fallidos — para account lockout anti brute-force."""
from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class LoginAttempt(Base, TimestampMixin):
    __tablename__ = "login_attempts"

    id: Mapped[int] = mapped_column(primary_key=True)
    # `email` en vez de user_id para registrar también intentos sobre cuentas inexistentes
    email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    ip: Mapped[str | None] = mapped_column(String(64))
    success: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    attempted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
