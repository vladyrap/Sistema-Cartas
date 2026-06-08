"""WebSocket + SSE + OBS overlay para torneos en vivo."""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, Request, WebSocket, WebSocketDisconnect, status
from fastapi.responses import HTMLResponse, StreamingResponse

from app.core.deps import DbDep
from app.core.security import decode_token
from app.models import Event, User
from app.services.realtime import event_channel, manager
from app.services import presence as presence_svc
from app.services import tournament as tour_svc

logger = logging.getLogger(__name__)

router = APIRouter()


def _decode_optional_token(token: str | None) -> int | None:
    """Devuelve user_id si el token es válido, sino None. No levanta."""
    if not token:
        return None
    try:
        data = decode_token(token)
        if data.get("type") != "access":
            return None
        return int(data["sub"])
    except (ValueError, KeyError):
        return None


# ============================== WebSocket de evento ==============================


@router.websocket("/ws/events/{event_id}")
async def ws_event(
    websocket: WebSocket,
    event_id: int,
    token: str | None = Query(default=None),
):
    """WebSocket para suscribirse a un canal de evento.

    Auth: token JWT opcional vía query string (?token=xxx). Si el evento es
    público (status != DRAFT), permitimos espectadores sin auth para que el
    OBS overlay y la vista pública anden sin login.

    Mensajes que el server emite (JSON):
      {type: round_started, ...}
      {type: match_reported, ...}
      {type: standings_updated, ...}
      {type: player_dropped, ...}
      {type: event_finalized, ...}

    Mensajes que el cliente puede mandar:
      {type: ping}  → server responde {type: pong, ts}
    """
    # No tenemos acceso a DbDep en WebSocket de la misma forma; abrimos sesión manual.
    from app.core.db import SessionLocal
    db = SessionLocal()
    try:
        ev = db.get(Event, event_id)
        if not ev:
            await websocket.close(code=4004, reason="Evento no encontrado")
            return
        # Auth opcional. Si el evento está en DRAFT, requerimos token válido.
        from app.models import EventStatus
        if ev.status == EventStatus.DRAFT:
            user_id = _decode_optional_token(token)
            if not user_id:
                await websocket.close(code=4001, reason="Auth requerida para evento DRAFT")
                return
    finally:
        db.close()

    channel = event_channel(event_id)
    await manager.connect(channel, websocket)
    try:
        # Hello inicial: snapshot ligero para que el cliente sepa el estado base.
        await websocket.send_text(json.dumps({
            "type": "hello",
            "event_id": event_id,
            "ts": datetime.now(timezone.utc).isoformat(),
        }))
        # Bucle de recepción: solo necesitamos ping/pong y detectar desconexión.
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=60)
            except asyncio.TimeoutError:
                # Heartbeat: si no llegó nada en 60s, mandamos ping del lado server.
                await websocket.send_text(json.dumps({"type": "server_ping"}))
                continue
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue
            if data.get("type") == "ping":
                await websocket.send_text(json.dumps({
                    "type": "pong",
                    "ts": datetime.now(timezone.utc).isoformat(),
                }))
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("ws_event error")
    finally:
        await manager.disconnect(channel, websocket)


# ============================== Server-Sent Events (fallback) ==============================


@router.get("/sse/events/{event_id}")
async def sse_event(event_id: int, request: Request):
    """SSE para clientes que no soportan WebSocket (corp proxies, etc.).
    Mismo protocolo de mensajes que el WS pero formato text/event-stream.

    Usa una cola por conexión que se llena desde el broadcaster. Como el
    manager actual broadcastea por WebSocket, expongo un puente: cada cliente
    SSE registra una asyncio.Queue, y publish_to_sse() la alimenta.
    """
    # Implementación con cola local — simple y suficiente para 1 worker.
    queue: asyncio.Queue[str] = asyncio.Queue(maxsize=200)
    _sse_queues.setdefault(event_id, set()).add(queue)

    async def event_gen():
        try:
            # Hello inicial.
            yield f"data: {json.dumps({'type': 'hello', 'event_id': event_id})}\n\n"
            while True:
                if await request.is_disconnected():
                    break
                try:
                    msg = await asyncio.wait_for(queue.get(), timeout=15)
                    yield f"data: {msg}\n\n"
                except asyncio.TimeoutError:
                    # keep-alive
                    yield ": keepalive\n\n"
        finally:
            qs = _sse_queues.get(event_id)
            if qs:
                qs.discard(queue)
                if not qs:
                    _sse_queues.pop(event_id, None)

    return StreamingResponse(event_gen(), media_type="text/event-stream")


_sse_queues: dict[int, set[asyncio.Queue]] = {}


def _publish_to_sse(event_id: int, message: dict) -> None:
    """Alimenta las colas SSE de un evento. Llamado por el bridge."""
    qs = _sse_queues.get(event_id)
    if not qs:
        return
    payload = json.dumps({**message, "ts": datetime.now(timezone.utc).isoformat()})
    for q in qs:
        try:
            q.put_nowait(payload)
        except asyncio.QueueFull:
            pass


# Bridge: monkey-patch manager.broadcast_sync para que también alimente SSE.
_original_broadcast_sync = manager.broadcast_sync


def _patched_broadcast_sync(channel: str, message: dict) -> None:
    _original_broadcast_sync(channel, message)
    if channel.startswith("event:"):
        try:
            event_id = int(channel.split(":", 1)[1])
            _publish_to_sse(event_id, message)
        except (ValueError, IndexError):
            pass


manager.broadcast_sync = _patched_broadcast_sync


# ============================== OBS overlay (HTML público) ==============================


_OVERLAY_HTML = """<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<title>EliteCards · Live Overlay · Evento #{event_id}</title>
<style>
  :root {{
    --bg: rgba(15, 15, 25, 0.92);
    --accent: #7c3aed;
    --gold: #fbbf24;
    --silver: #cbd5e1;
    --bronze: #f97316;
  }}
  html, body {{ margin: 0; padding: 0; font-family: 'Inter', system-ui, sans-serif;
                background: transparent; color: #fff; }}
  #app {{ position: fixed; bottom: 32px; left: 32px; width: 480px;
           background: var(--bg); border-radius: 14px; padding: 18px 22px;
           box-shadow: 0 20px 60px rgba(0,0,0,0.5);
           border: 1px solid rgba(124,58,237,0.35);
           backdrop-filter: blur(8px); }}
  #app h2 {{ font-size: 13px; font-weight: 700; letter-spacing: 1px;
              text-transform: uppercase; margin: 0 0 10px;
              color: var(--accent); display: flex; align-items: center; gap: 8px; }}
  #app h2::before {{ content: ''; width: 8px; height: 8px; border-radius: 50%;
                       background: #ef4444; animation: pulse 1.6s ease-in-out infinite; }}
  @keyframes pulse {{ 0%, 100% {{ opacity: 1; }} 50% {{ opacity: 0.3; }} }}
  .meta {{ font-size: 11px; color: #94a3b8; margin-bottom: 12px; }}
  table {{ width: 100%; border-collapse: collapse; }}
  th, td {{ font-size: 14px; padding: 6px 4px; text-align: left;
            border-bottom: 1px solid rgba(255,255,255,0.06); }}
  th {{ font-size: 10px; text-transform: uppercase; letter-spacing: 1px;
        color: #64748b; font-weight: 600; padding-bottom: 8px; }}
  td:first-child {{ font-weight: 700; width: 28px; text-align: center; }}
  tr.rank-1 td:first-child {{ color: var(--gold); }}
  tr.rank-2 td:first-child {{ color: var(--silver); }}
  tr.rank-3 td:first-child {{ color: var(--bronze); }}
  td.points {{ text-align: right; font-variant-numeric: tabular-nums;
                font-weight: 700; color: var(--accent); }}
  .small {{ font-size: 10px; color: #64748b; }}
  #status {{ position: fixed; top: 8px; right: 12px; font-size: 10px;
              color: #64748b; }}
</style>
</head>
<body>
<div id="status">connecting…</div>
<div id="app">
  <h2><span>LIVE · Evento #{event_id}</span></h2>
  <div class="meta" id="meta">Cargando standings…</div>
  <table>
    <thead><tr><th>#</th><th>Alias</th><th>R</th><th>OMW%</th><th>MP</th></tr></thead>
    <tbody id="rows"></tbody>
  </table>
</div>
<script>
const eventId = {event_id};
const apiBase = location.origin;
const $status = document.getElementById('status');
const $rows = document.getElementById('rows');
const $meta = document.getElementById('meta');

async function refresh() {{
  try {{
    const r = await fetch(`${{apiBase}}/api/events/${{eventId}}/standings`);
    const s = await r.json();
    const top = s.slice(0, 8);
    $rows.innerHTML = top.map(p => `
      <tr class="rank-${{p.rank}}">
        <td>${{p.rank}}</td>
        <td>${{p.alias}}<div class="small">${{p.elite_id_code}}</div></td>
        <td>${{p.rounds_won}}-${{p.rounds_lost}}${{p.rounds_draw ? '-'+p.rounds_draw : ''}}</td>
        <td>${{(p.omw*100).toFixed(0)}}%</td>
        <td class="points">${{p.match_points}}</td>
      </tr>
    `).join('');
    $meta.textContent = `${{s.length}} jugadores · actualizado ${{new Date().toLocaleTimeString()}}`;
  }} catch (e) {{ $meta.textContent = 'Error cargando standings'; }}
}}

let ws;
function connect() {{
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${{proto}}://${{location.host}}/api/rt/ws/events/${{eventId}}`);
  ws.onopen  = () => {{ $status.textContent = '● live'; $status.style.color = '#10b981'; refresh(); }};
  ws.onclose = () => {{ $status.textContent = '○ reconnecting'; $status.style.color = '#f59e0b';
                       setTimeout(connect, 2000); }};
  ws.onerror = () => {{ $status.textContent = '○ error'; $status.style.color = '#ef4444'; }};
  ws.onmessage = (m) => {{
    try {{
      const data = JSON.parse(m.data);
      // Cualquier evento de cambio relevante refresca standings.
      if (['match_reported','standings_updated','round_started','player_dropped','event_finalized'].includes(data.type)) {{
        refresh();
      }}
    }} catch (e) {{}}
  }};
}}
connect();
refresh();
setInterval(refresh, 30000); // safety net
</script>
</body>
</html>"""


# ============================== Presence (cursors + reactions) ==============================


@router.websocket("/ws/presence/events/{event_id}")
async def ws_presence(
    websocket: WebSocket,
    event_id: int,
    token: str | None = Query(default=None),
    alias: str | None = Query(default=None),
):
    """Presence channel para cursor positions + reactions."""
    await websocket.accept()

    user_id = _decode_optional_token(token)
    alias_resolved = alias or "Anónimo"
    if user_id and not alias:
        from app.core.db import SessionLocal
        from sqlalchemy import select as _s
        from app.models import PlayerProfile as _PP, User as _U
        db = SessionLocal()
        try:
            u = db.get(_U, user_id)
            if u and u.profile:
                alias_resolved = u.profile.alias
        finally:
            db.close()

    hue = presence_svc.color_hue_for_user(user_id)
    channel = presence_svc.get_channel(f"event:{event_id}")
    presence_id = await channel.add(websocket, alias=alias_resolved, hue=hue, user_id=user_id)
    try:
        while True:
            try:
                raw = await asyncio.wait_for(websocket.receive_text(), timeout=30)
            except asyncio.TimeoutError:
                # Heartbeat
                await websocket.send_text(json.dumps({"type": "server_ping"}))
                continue
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                continue
            await channel.handle_message(presence_id, data)
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("ws_presence error")
    finally:
        await channel.remove(presence_id)


@router.get("/overlay/events/{event_id}", response_class=HTMLResponse)
async def obs_overlay(event_id: int) -> str:
    """HTML autocontenido para OBS Browser Source. Auto-reconecta al WS y
    cae a polling cada 30s como red de seguridad."""
    return _OVERLAY_HTML.replace("{event_id}", str(event_id))
