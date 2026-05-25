"""Base declarative + shared mixins + enums."""
from __future__ import annotations

import enum
from datetime import datetime

from sqlalchemy import DateTime, func
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), nullable=False
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


# ============================== Enums ==============================


class UserRole(str, enum.Enum):
    PLAYER = "PLAYER"
    ORGANIZER = "ORGANIZER"
    ADMIN = "ADMIN"              # legacy → mapeado a GUILD_ADMIN del Gremio Principal
    SUPER_ADMIN = "SUPER_ADMIN"  # admin global de EliteCards


class GuildRole(str, enum.Enum):
    """Rol del usuario DENTRO de un Gremio específico."""
    MEMBER = "MEMBER"
    ORGANIZER = "ORGANIZER"
    JUDGE = "JUDGE"
    GUILD_ADMIN = "GUILD_ADMIN"


class GuildStatus(str, enum.Enum):
    PENDING = "PENDING"    # solicitado, esperando aprobación de SUPER_ADMIN
    ACTIVE = "ACTIVE"
    SUSPENDED = "SUSPENDED"
    ARCHIVED = "ARCHIVED"


class PlayerClass(str, enum.Enum):
    DUELISTA = "DUELISTA"
    COLECCIONISTA = "COLECCIONISTA"
    ESTRATEGA = "ESTRATEGA"
    MENTOR = "MENTOR"
    TRADER = "TRADER"
    EXPLORADOR = "EXPLORADOR"


class EventType(str, enum.Enum):
    CASUAL = "CASUAL"
    COMPETITIVE = "COMPETITIVE"
    ELITE_CHALLENGE = "ELITE_CHALLENGE"
    TRADE_DAY = "TRADE_DAY"
    WEEKLY_LEAGUE = "WEEKLY_LEAGUE"
    MONTHLY_LEAGUE = "MONTHLY_LEAGUE"
    FINAL_ELITE = "FINAL_ELITE"
    BEGINNER_EVENT = "BEGINNER_EVENT"
    PREORDER_EVENT = "PREORDER_EVENT"


class EventStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    OPEN = "OPEN"
    CLOSED = "CLOSED"
    FINISHED = "FINISHED"
    CANCELLED = "CANCELLED"


class PaymentStatus(str, enum.Enum):
    PENDING = "PENDING"
    PAID = "PAID"
    CANCELLED = "CANCELLED"
    REFUNDED = "REFUNDED"


class AttendanceStatus(str, enum.Enum):
    PENDING = "PENDING"
    ATTENDED = "ATTENDED"
    NO_SHOW = "NO_SHOW"


class ProductAccess(str, enum.Enum):
    NORMAL = "NORMAL"
    ELITE_ACCESS = "ELITE_ACCESS"
    ELITE_PRO = "ELITE_PRO"


class ReservationStatus(str, enum.Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    PAID = "PAID"
    EXPIRED = "EXPIRED"
    CANCELLED = "CANCELLED"


class SeasonStatus(str, enum.Enum):
    DRAFT = "DRAFT"
    ACTIVE = "ACTIVE"
    CLOSED = "CLOSED"


class RankName(str, enum.Enum):
    INICIADO = "INICIADO"
    APRENDIZ = "APRENDIZ"
    DUELISTA = "DUELISTA"
    RETADOR = "RETADOR"
    ELITE = "ELITE"
    MAESTRO = "MAESTRO"
    CAMPEON = "CAMPEON"

    @classmethod
    def is_top_tier(cls, rank: "RankName") -> bool:
        """True si el rango cualifica para el inicio promovido (Duelista N10)."""
        return rank in (cls.MAESTRO, cls.CAMPEON)
