"""Audit log helper — registra acciones de admins (global o Maestros del Gremio).

La fila queda en `admin_action_log` con `guild_id` cuando aplica, para poder
filtrar el feed por Gremio en `/guilds/{id}/activity`.
"""
from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import AdminActionLog


def log(
    db: Session,
    *,
    admin_id: int,
    action: str,
    guild_id: int | None = None,
    target_kind: str | None = None,
    target_id: int | None = None,
    payload: dict[str, Any] | str | None = None,
) -> AdminActionLog:
    """Inserta una entrada de auditoría. NO hace commit (lo hace el caller)."""
    if isinstance(payload, dict):
        payload_str: str | None = json.dumps(payload, ensure_ascii=False, default=str)
    else:
        payload_str = payload
    entry = AdminActionLog(
        admin_id=admin_id,
        guild_id=guild_id,
        action=action,
        target_kind=target_kind,
        target_id=target_id,
        payload=payload_str,
    )
    db.add(entry)
    db.flush()
    return entry
