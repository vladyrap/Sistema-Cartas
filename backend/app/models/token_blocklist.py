"""Lista de tokens JWT revocados (logout o forzado)."""
from datetime import datetime

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class RevokedToken(Base, TimestampMixin):
    __tablename__ = "revoked_tokens"

    id: Mapped[int] = mapped_column(primary_key=True)
    jti: Mapped[str] = mapped_column(String(48), unique=True, nullable=False, index=True)
    user_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"), index=True)
    # Cuándo expira el token original — para poder limpiar de la tabla después
    token_exp: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), index=True)
    reason: Mapped[str | None] = mapped_column(String(40))  # "logout" | "forced" | "password_reset"
