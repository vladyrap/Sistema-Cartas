from __future__ import annotations

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from app.models.base import Base, TimestampMixin


class HallOfFameEntry(Base, TimestampMixin):
    """Una entrada de Hall of Fame por temporada y categoría.

    Categorías sugeridas (string libre, validado en service):
      - "season_champion": campeón general de la temporada
      - "top_8": top 8 de la temporada
      - "best_rookie": mejor novato
      - "highest_attendance": mayor asistencia
      - "best_mentor": mejor mentor
      - "best_collector": mejor coleccionista
      - "game_champion_<game_code>": campeón por juego
    """

    __tablename__ = "hall_of_fame_entries"

    id: Mapped[int] = mapped_column(primary_key=True)
    season_id: Mapped[int] = mapped_column(ForeignKey("seasons.id"), nullable=False, index=True)
    player_id: Mapped[int] = mapped_column(
        ForeignKey("player_profiles.id"), nullable=False, index=True
    )
    category: Mapped[str] = mapped_column(String(60), nullable=False)
    note: Mapped[str | None] = mapped_column(String(500))
