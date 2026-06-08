"""Presence multiplayer: cursors + reactions broadcast por canal.

Wrapper sobre realtime.manager — agrega tipos de mensaje específicos para
cursor moves y reactions. El frontend manda mensajes {type: 'cursor', x, y}
y nosotros los reenviamos a TODOS los demás del canal (no a quien lo emitió).

Cada conexión obtiene un `presence_id` único (UUID) que va con cada mensaje
para que el receptor sepa qué cursor es cuál.
"""
from __future__ import annotations

import asyncio
import json
import logging
import uuid
from datetime import datetime, timezone

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class PresenceChannel:
    """Por canal: dict de presence_id → (websocket, metadata).
    Metadata incluye color_hue (0-360), alias, last_x, last_y, ts."""

    def __init__(self) -> None:
        self.peers: dict[str, dict] = {}
        self._lock = asyncio.Lock()

    async def add(self, ws: WebSocket, *, alias: str | None, hue: int, user_id: int | None) -> str:
        presence_id = uuid.uuid4().hex[:10]
        async with self._lock:
            self.peers[presence_id] = {
                "ws": ws, "alias": alias or "Anónimo", "hue": hue,
                "user_id": user_id, "x": 0, "y": 0,
                "joined_at": datetime.now(timezone.utc).isoformat(),
            }
        await self._broadcast_others(presence_id, {
            "type": "presence_join",
            "presence_id": presence_id,
            "alias": alias or "Anónimo",
            "hue": hue,
        })
        # Welcome al recién llegado con todos los peers actuales.
        await ws.send_text(json.dumps({
            "type": "presence_snapshot",
            "self_id": presence_id,
            "peers": [
                {"id": pid, "alias": p["alias"], "hue": p["hue"], "x": p["x"], "y": p["y"]}
                for pid, p in self.peers.items() if pid != presence_id
            ],
        }))
        return presence_id

    async def remove(self, presence_id: str) -> None:
        async with self._lock:
            self.peers.pop(presence_id, None)
        await self._broadcast_others(presence_id, {
            "type": "presence_leave",
            "presence_id": presence_id,
        })

    async def handle_message(self, presence_id: str, msg: dict) -> None:
        mtype = msg.get("type")
        if mtype == "cursor":
            peer = self.peers.get(presence_id)
            if peer:
                peer["x"] = msg.get("x", 0)
                peer["y"] = msg.get("y", 0)
            await self._broadcast_others(presence_id, {
                "type": "cursor",
                "presence_id": presence_id,
                "x": msg.get("x", 0),
                "y": msg.get("y", 0),
                "scope": msg.get("scope"),  # opcional: "bracket"|"standings"|"page"
            })
        elif mtype == "reaction":
            await self._broadcast_others(presence_id, {
                "type": "reaction",
                "presence_id": presence_id,
                "emoji": msg.get("emoji", "✨")[:8],
                "x": msg.get("x", 50),
                "y": msg.get("y", 50),
            })

    async def _broadcast_others(self, sender_id: str, message: dict) -> None:
        payload = json.dumps({**message, "ts": datetime.now(timezone.utc).isoformat()})
        targets = list(self.peers.items())
        for pid, peer in targets:
            if pid == sender_id:
                continue
            try:
                await peer["ws"].send_text(payload)
            except Exception:
                pass


# Singleton por canal (clave: nombre del canal — usamos event:{id}).
_channels: dict[str, PresenceChannel] = {}


def get_channel(name: str) -> PresenceChannel:
    if name not in _channels:
        _channels[name] = PresenceChannel()
    return _channels[name]


def color_hue_for_user(user_id: int | None) -> int:
    """Hash determinístico → hue 0-359."""
    if user_id is None:
        return (int(uuid.uuid4().hex[:6], 16)) % 360
    return (user_id * 137 + 41) % 360
