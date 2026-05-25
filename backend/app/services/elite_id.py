"""Generación de Elite ID — credencial única tipo carta TCG."""
from __future__ import annotations

from datetime import datetime

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import PlayerProfile


def generate_next_elite_id(db: Session) -> tuple[str, int]:
    """Devuelve (elite_id_code, elite_id_number) siguiente disponible.

    Formato: "EC-{YYYY}-{NNNNNN}" con NNNNNN secuencial global.
    """
    max_n = db.scalar(select(func.max(PlayerProfile.elite_id_number))) or 0
    next_n = max_n + 1
    year = datetime.utcnow().year
    code = f"EC-{year}-{next_n:06d}"
    return code, next_n
