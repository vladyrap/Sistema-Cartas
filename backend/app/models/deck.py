"""Decks que el jugador registra para llevar a eventos.

Cada deck pertenece a un Game y opcionalmente a un GameFormat (para validar
legalidad). Cuando se asocia a una EventRegistration y el evento está OPEN o
en curso, el deck queda `is_locked` para auditoría.
"""
from __future__ import annotations

from sqlalchemy import Boolean, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class PlayerDeck(Base, TimestampMixin):
    __tablename__ = "player_decks"

    id: Mapped[int] = mapped_column(primary_key=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id", ondelete="CASCADE"), nullable=False, index=True
    )
    game_id: Mapped[int] = mapped_column(ForeignKey("games.id"), nullable=False, index=True)
    # Formato bajo el que se construyó el deck. Opcional — un deck "casual"
    # puede no apuntar a ningún formato. Si apunta, se valida contra él.
    format_id: Mapped[int | None] = mapped_column(
        ForeignKey("game_formats.id", ondelete="SET NULL"), index=True
    )

    name: Mapped[str] = mapped_column(String(120), nullable=False)
    archetype: Mapped[str | None] = mapped_column(String(80))
    list_text: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)

    # Carta líder (One Piece, Hololive Oshi). Nombre canónico.
    leader_card: Mapped[str | None] = mapped_column(String(160))

    # Counts cachados del último parseo. Permite listar decks sin re-parsear.
    main_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    side_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    extra_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    # Estado de validación contra el formato (última vez que se validó).
    is_legal: Mapped[bool | None] = mapped_column(Boolean)
    validation_notes: Mapped[str | None] = mapped_column(Text)

    # Visibilidad: si is_public=True, el deck aparece en el perfil público del
    # jugador y en standings (útil para top 8 de torneos).
    is_public: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Locked: ya se asoció a un EventRegistration y el evento empezó.
    # Mientras esté locked no se permite editar list_text/leader.
    is_locked: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
