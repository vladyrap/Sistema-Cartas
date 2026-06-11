"""Growth pack: store credits, membership, némesis, botín físico, trade log.

Modelos del bloque de retención/ingresos:
  - StoreCredit: ledger de créditos de tienda (CLP) — premios de torneo que
    vuelven como crédito canjeable, cupones de retención, ajustes admin.
  - Membership: membresía mensual (30 días por pago) con beneficios.
  - SeasonNemesis: archienemigo asignado por temporada (EXP doble en matches).
  - PhysicalReward + PhysicalRewardClaim: achievements canjeables por botín
    físico en tienda, con cola de entrega para el admin.
  - TradeRecord: registro de intercambios presenciales con dual-confirm y
    fairness check por valor estimado.
"""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import (
    Boolean, CheckConstraint, DateTime, ForeignKey, Index, Integer, String,
    Text, UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class StoreCredit(Base, TimestampMixin):
    """Movimiento de crédito de tienda. Balance = SUM(amount_clp) por jugador.
    amount_clp positivo = otorgado; negativo = canjeado en tienda."""
    __tablename__ = "store_credits"
    __table_args__ = (
        Index("ix_store_credit_player", "player_id", "created_at"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    amount_clp: Mapped[int] = mapped_column(Integer, nullable=False)
    reason: Mapped[str] = mapped_column(String(200), nullable=False)
    # prize | coupon | redeem | admin_adjust
    kind: Mapped[str] = mapped_column(String(30), nullable=False, default="admin_adjust")
    related_event_id: Mapped[int | None] = mapped_column(
        ForeignKey("events.id", ondelete="SET NULL")
    )
    created_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )


class Membership(Base, TimestampMixin):
    """Membresía de tienda. Un registro por jugador; cada pago extiende 30 días.

    Beneficios aplicados en código: descuento % en entradas de eventos,
    prioridad en waitlist, freeze de rating sin tope de días, badge.
    """
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("player_id", name="uq_membership_player"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    paid_until: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    # mp | manual (admin cortesía)
    source: Mapped[str] = mapped_column(String(20), nullable=False, default="mp")
    mp_last_payment_id: Mapped[str | None] = mapped_column(String(80))
    total_payments: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class SeasonNemesis(Base, TimestampMixin):
    """Archienemigo asignado al jugador para la temporada. EXP doble al
    enfrentarlo. Par dirigido: A tiene a B y B tiene a A (2 filas)."""
    __tablename__ = "season_nemesis"
    __table_args__ = (
        UniqueConstraint("season_id", "player_id", name="uq_nemesis_per_season"),
        CheckConstraint("player_id != nemesis_player_id", name="ck_nemesis_not_self"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    season_id: Mapped[int] = mapped_column(
        ForeignKey("seasons.id", ondelete="CASCADE"), nullable=False, index=True
    )
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    nemesis_player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False
    )
    # Head-to-head de la temporada (solo matches entre ellos)
    my_wins: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    their_wins: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    draws: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class PhysicalReward(Base, TimestampMixin):
    """Botín físico canjeable al desbloquear un achievement de torneo."""
    __tablename__ = "physical_rewards"
    __table_args__ = (
        UniqueConstraint("achievement_key", name="uq_physical_reward_ach"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    achievement_key: Mapped[str] = mapped_column(String(60), nullable=False)
    label: Mapped[str] = mapped_column(String(160), nullable=False)  # "Sleeves Elite + dado"
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class PhysicalRewardClaim(Base, TimestampMixin):
    """Canje de botín. Un claim por (player, achievement) — aunque repita el
    achievement en otros eventos, el botín se canjea una vez."""
    __tablename__ = "physical_reward_claims"
    __table_args__ = (
        UniqueConstraint("player_id", "achievement_key", name="uq_loot_claim_unique"),
        CheckConstraint("status IN ('PENDING','DELIVERED','CANCELLED')", name="ck_loot_status"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    achievement_key: Mapped[str] = mapped_column(String(60), nullable=False)
    reward_id: Mapped[int] = mapped_column(
        ForeignKey("physical_rewards.id", ondelete="CASCADE"), nullable=False
    )
    status: Mapped[str] = mapped_column(String(20), default="PENDING", nullable=False, index=True)
    delivered_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    delivered_by_user_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )


class TradeRecord(Base, TimestampMixin):
    """Registro de un intercambio presencial entre dos jugadores.

    No es marketplace: es historial + fairness check. A propone con el detalle
    de ambos lados, B confirma (dual-confirm). Valores en CLP estimados
    (typicamente desde el Scanner con precios TCGPlayer→CLP).
    """
    __tablename__ = "trade_records"
    __table_args__ = (
        CheckConstraint("player_a_id != player_b_id", name="ck_trade_diff_players"),
        CheckConstraint("status IN ('PROPOSED','CONFIRMED','REJECTED','CANCELLED')",
                        name="ck_trade_status"),
        Index("ix_trade_players", "player_a_id", "player_b_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    player_a_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    player_b_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    event_id: Mapped[int | None] = mapped_column(ForeignKey("events.id", ondelete="SET NULL"))
    items_a: Mapped[str] = mapped_column(Text, nullable=False)   # qué entrega A (freeform)
    items_b: Mapped[str] = mapped_column(Text, nullable=False)   # qué entrega B
    value_a_clp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    value_b_clp: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="PROPOSED", nullable=False, index=True)
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
