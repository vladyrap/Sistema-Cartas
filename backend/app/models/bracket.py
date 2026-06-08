"""Bracket de eliminación directa después de Swiss (top 8 / 16 / 32).

`BracketNode` representa un emparejamiento individual en el árbol. Cada nodo
apunta a su nodo padre (el ganador avanza). Niveles cuentan desde la final
hacia atrás: level 0 = final, level 1 = semifinal, level 2 = cuartos, etc.

Convención de slot: dentro de un nivel, slot 0..2^level - 1 ordena los nodos
de izquierda a derecha para renderizado.
"""
from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class EventBracket(Base, TimestampMixin):
    __tablename__ = "event_brackets"
    __table_args__ = (
        UniqueConstraint("event_id", name="uq_event_bracket"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    event_id: Mapped[int] = mapped_column(
        ForeignKey("events.id", ondelete="CASCADE"), nullable=False, unique=True
    )
    # Tamaño inicial: 8, 16 o 32.
    size: Mapped[int] = mapped_column(Integer, nullable=False, default=8)
    # True cuando el ganador del root quedó decidido.
    is_complete: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)


class BracketNode(Base, TimestampMixin):
    __tablename__ = "bracket_nodes"
    __table_args__ = (
        UniqueConstraint("bracket_id", "level", "slot", name="uq_bracket_node_pos"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    bracket_id: Mapped[int] = mapped_column(
        ForeignKey("event_brackets.id", ondelete="CASCADE"), nullable=False, index=True
    )
    # Nivel: 0 = final, 1 = semifinal, 2 = cuartos, 3 = octavos...
    level: Mapped[int] = mapped_column(Integer, nullable=False)
    # Slot dentro del nivel (0..2^level - 1).
    slot: Mapped[int] = mapped_column(Integer, nullable=False)

    # Jugadores en este nodo (vienen de seeds o de nivel anterior).
    player_a_id: Mapped[int | None] = mapped_column(ForeignKey("player_profiles.id"))
    player_b_id: Mapped[int | None] = mapped_column(ForeignKey("player_profiles.id"))
    winner_id: Mapped[int | None] = mapped_column(ForeignKey("player_profiles.id"))

    # Seeds del Swiss (rank en standings). null en nodos no hoja.
    seed_a: Mapped[int | None] = mapped_column(Integer)
    seed_b: Mapped[int | None] = mapped_column(Integer)

    games_a: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    games_b: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
