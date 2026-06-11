"""Servicio de tiempo real: ConnectionManager para WebSockets agrupados por canal.

Canal = string opaco (típicamente "event:{event_id}", "guild:{guild_id}").
Cada canal mantiene un set de WebSocket activos. Los handlers del backend
(tour_svc, event_svc) llaman broadcast() tras mutaciones para notificar a
todos los suscriptores.

El ConnectionManager es proceso-local. En multi-worker producción habría que
respaldarlo con Redis pub/sub — `redis` ya está en requirements.txt para eso.
Para una tienda como Calmar (1 worker uvicorn), proceso-local alcanza.
"""
from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from fastapi import WebSocket

logger = logging.getLogger(__name__)


@dataclass
class ConnectionManager:
    channels: dict[str, set[WebSocket]] = field(default_factory=dict)
    _lock: asyncio.Lock = field(default_factory=asyncio.Lock)

    async def connect(self, channel: str, ws: WebSocket) -> None:
        await ws.accept()
        async with self._lock:
            self.channels.setdefault(channel, set()).add(ws)
        logger.info("ws_connected channel=%s total=%d", channel, len(self.channels[channel]))

    async def disconnect(self, channel: str, ws: WebSocket) -> None:
        async with self._lock:
            conns = self.channels.get(channel)
            if conns:
                conns.discard(ws)
                if not conns:
                    self.channels.pop(channel, None)
        logger.info("ws_disconnected channel=%s", channel)

    async def broadcast(self, channel: str, message: dict[str, Any]) -> int:
        """Envía a todos los suscriptores del canal. Devuelve cantidad entregada.
        Si alguna conexión está rota, la elimina sin levantar excepción."""
        payload = json.dumps({**message, "ts": datetime.now(timezone.utc).isoformat()})
        async with self._lock:
            conns = list(self.channels.get(channel, ()))
        if not conns:
            return 0
        delivered = 0
        for ws in conns:
            try:
                await ws.send_text(payload)
                delivered += 1
            except Exception:
                # Conexión muerta — limpiar.
                try:
                    await self.disconnect(channel, ws)
                except Exception:
                    pass
        return delivered

    def broadcast_sync(self, channel: str, message: dict[str, Any]) -> None:
        """Wrapper sync para llamar desde código sync (servicios).
        Se programa en el event loop activo si lo hay, sino se descarta.

        Esto permite que tour_svc.report_match() (sync) emita eventos sin
        cambiar su firma a async.
        """
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            # Sin event loop activo (test sync, scripts) — no se emite.
            return
        loop.create_task(self.broadcast(channel, message))


# Singleton compartido entre routers y servicios.
manager = ConnectionManager()


# ============================== Helpers de canal ==============================


def event_channel(event_id: int) -> str:
    return f"event:{event_id}"


def guild_channel(guild_id: int) -> str:
    return f"guild:{guild_id}"


def player_channel(player_id: int) -> str:
    return f"player:{player_id}"


# ============================== Helpers tipados de mensaje ==============================


def emit_round_started(event_id: int, round_number: int, pairing_count: int) -> None:
    manager.broadcast_sync(event_channel(event_id), {
        "type": "round_started",
        "event_id": event_id,
        "round_number": round_number,
        "pairings": pairing_count,
    })


def emit_match_reported(
    event_id: int, match_id: int, round_number: int,
    winner_id: int | None, is_draw: bool, games_a: int, games_b: int,
) -> None:
    manager.broadcast_sync(event_channel(event_id), {
        "type": "match_reported",
        "event_id": event_id,
        "match_id": match_id,
        "round_number": round_number,
        "winner_id": winner_id,
        "is_draw": is_draw,
        "games_a": games_a,
        "games_b": games_b,
    })


def emit_standings_updated(event_id: int) -> None:
    """Señal liviana — el cliente debe pedir GET /events/{id}/standings."""
    manager.broadcast_sync(event_channel(event_id), {
        "type": "standings_updated",
        "event_id": event_id,
    })


def emit_player_dropped(event_id: int, player_id: int, alias: str | None = None) -> None:
    manager.broadcast_sync(event_channel(event_id), {
        "type": "player_dropped",
        "event_id": event_id,
        "player_id": player_id,
        "alias": alias,
    })


def emit_pairing_swapped(event_id: int, round_number: int) -> None:
    """Admin movió jugadores entre mesas — clientes deben refrescar pairings."""
    manager.broadcast_sync(event_channel(event_id), {
        "type": "pairing_swapped",
        "event_id": event_id,
        "round_number": round_number,
    })


def emit_timer_event(event_id: int, round_number: int, action: str, remaining_seconds: int | None = None) -> None:
    """action: started | paused | resumed | extended | finished"""
    manager.broadcast_sync(event_channel(event_id), {
        "type": "timer_event",
        "event_id": event_id,
        "round_number": round_number,
        "action": action,
        "remaining_seconds": remaining_seconds,
    })


def emit_event_finalized(event_id: int, top_player_id: int | None = None) -> None:
    manager.broadcast_sync(event_channel(event_id), {
        "type": "event_finalized",
        "event_id": event_id,
        "top_player_id": top_player_id,
    })
