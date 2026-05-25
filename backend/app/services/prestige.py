"""Cálculo de Prestigio al cierre de temporada.

Reglas (cumulativas — un jugador acumula todo lo que aplique):
  - Participar en la temporada (tener SeasonProgress): 50
  - Llegar a Nivel 10: +100
  - Llegar a Nivel 20: +200
  - Llegar a Nivel 30: +400
  - Top 8 de temporada: +300
  - Campeón de temporada (final_position == 1): +700

Importante: estos puntos son adicionales a las medallas/títulos. El Prestigio
no se reinicia jamás.
"""
from __future__ import annotations

from sqlalchemy.orm import Session

from app.models import PrestigeTransaction, SeasonProgress

PRESTIGE_RULES = {
    "season_participation": 50,
    "reached_level_10": 100,
    "reached_level_20": 200,
    "reached_level_30": 400,
    "top_8_season": 300,
    "season_champion": 700,
}


def compute_prestige_for_progress(
    progress: SeasonProgress, final_position: int | None
) -> list[tuple[str, int]]:
    """Devuelve [(reason_code, amount)] aplicables a un jugador al cierre de temporada.

    No persiste nada. Es función pura sobre el SeasonProgress + posición final.
    """
    out: list[tuple[str, int]] = []
    out.append(("season_participation", PRESTIGE_RULES["season_participation"]))

    if progress.level >= 10:
        out.append(("reached_level_10", PRESTIGE_RULES["reached_level_10"]))
    if progress.level >= 20:
        out.append(("reached_level_20", PRESTIGE_RULES["reached_level_20"]))
    if progress.level >= 30:
        out.append(("reached_level_30", PRESTIGE_RULES["reached_level_30"]))

    if final_position is not None:
        if 1 <= final_position <= 8:
            out.append(("top_8_season", PRESTIGE_RULES["top_8_season"]))
        if final_position == 1:
            out.append(("season_champion", PRESTIGE_RULES["season_champion"]))

    return out


def award_prestige(
    db: Session,
    *,
    player_id: int,
    season_id: int,
    reason_code: str,
    amount: int,
    reason: str | None = None,
) -> PrestigeTransaction:
    tx = PrestigeTransaction(
        player_id=player_id,
        season_id=season_id,
        amount=amount,
        reason=reason or reason_code.replace("_", " ").capitalize(),
        reason_code=reason_code,
    )
    db.add(tx)
    db.flush()
    return tx
