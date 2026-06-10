"""Notificaciones externas — Telegram y Discord, por Gremio.

Cada Gremio puede configurar:
  - telegram_bot_token + telegram_chat_id → mensajes a un grupo/canal
  - discord_webhook_url → mensajes a un canal vía webhook (sin bot)

Si las credenciales no están configuradas, las funciones devuelven `False`
silenciosamente — no es error, es "este Gremio no tiene esa integración".

Uso típico:
    notify_external.send_to_guild(db, guild, "Nuevo evento abierto: ...")
"""
from __future__ import annotations

import logging
from typing import Any

import httpx
from sqlalchemy.orm import Session

from app.models import Guild

log = logging.getLogger("notify_external")

TIMEOUT = 5.0


# ─────────────────────────  Telegram  ─────────────────────────


def send_telegram(bot_token: str, chat_id: str, text: str, parse_mode: str = "HTML") -> bool:
    """Envía un mensaje a un chat de Telegram vía Bot API.

    Devuelve True si OK, False si falló. Nunca levanta excepción.
    """
    if not bot_token or not chat_id or not text:
        return False
    url = f"https://api.telegram.org/bot{bot_token}/sendMessage"
    payload = {
        "chat_id": chat_id,
        "text": text[:4090],  # Telegram límite 4096
        "parse_mode": parse_mode,
        "disable_web_page_preview": True,
    }
    try:
        with httpx.Client(timeout=TIMEOUT) as cli:
            r = cli.post(url, json=payload)
        if r.status_code == 200 and r.json().get("ok"):
            return True
        log.warning("Telegram error %s: %s", r.status_code, r.text[:200])
    except httpx.RequestError as e:
        log.warning("Telegram request failed: %s", e)
    return False


# ─────────────────────────  Discord webhook  ─────────────────────────


def send_discord_webhook(webhook_url: str, content: str | None = None, *, embed: dict | None = None) -> bool:
    """Envía un mensaje a Discord vía webhook. content y/o embed."""
    if not webhook_url:
        return False
    if not content and not embed:
        return False
    payload: dict[str, Any] = {}
    if content:
        payload["content"] = content[:1990]
    if embed:
        payload["embeds"] = [embed]
    try:
        with httpx.Client(timeout=TIMEOUT) as cli:
            r = cli.post(webhook_url, json=payload)
        if r.status_code in (200, 204):
            return True
        log.warning("Discord webhook error %s: %s", r.status_code, r.text[:200])
    except httpx.RequestError as e:
        log.warning("Discord webhook request failed: %s", e)
    return False


# ─────────────────────────  Combinado por Gremio  ─────────────────────────


def send_to_guild(
    db: Session,
    guild_or_id: Guild | int,
    text: str,
    *,
    discord_embed: dict | None = None,
) -> dict:
    """Envía el mismo mensaje a Telegram + Discord del Gremio.

    Devuelve {telegram: bool, discord: bool} con el resultado de cada canal.
    """
    if isinstance(guild_or_id, int):
        guild = db.get(Guild, guild_or_id)
    else:
        guild = guild_or_id
    if not guild:
        return {"telegram": False, "discord": False}

    result = {"telegram": False, "discord": False}
    if guild.telegram_bot_token and guild.telegram_chat_id:
        # Telegram parse_mode HTML — escapamos lo mínimo
        safe = (text or "").replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        result["telegram"] = send_telegram(
            guild.telegram_bot_token, guild.telegram_chat_id, safe,
        )
    if guild.discord_webhook_url:
        result["discord"] = send_discord_webhook(
            guild.discord_webhook_url, content=text, embed=discord_embed,
        )
    return result
