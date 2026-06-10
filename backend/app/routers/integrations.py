"""Endpoints para configurar y testear integraciones del Gremio (Telegram, Discord).

Solo GUILD_ADMIN/SUPER_ADMIN puede modificar las credenciales o disparar un test.
"""
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel

from app.core.deps import DbDep, GuildAdminDep
from app.models import Guild
from app.services import notify_external

router = APIRouter()


class IntegrationsIn(BaseModel):
    telegram_bot_token: str | None = None
    telegram_chat_id: str | None = None
    discord_webhook_url: str | None = None


class IntegrationsOut(BaseModel):
    telegram_configured: bool
    telegram_chat_id_masked: str | None = None
    discord_configured: bool
    discord_webhook_masked: str | None = None


def _mask(s: str | None, keep: int = 6) -> str | None:
    if not s:
        return None
    if len(s) <= keep:
        return "•" * len(s)
    return s[:keep] + "•" * (len(s) - keep)


@router.get("/status", response_model=IntegrationsOut)
def get_status(guild: GuildAdminDep) -> IntegrationsOut:
    return IntegrationsOut(
        telegram_configured=bool(guild.telegram_bot_token and guild.telegram_chat_id),
        telegram_chat_id_masked=_mask(guild.telegram_chat_id, 4),
        discord_configured=bool(guild.discord_webhook_url),
        discord_webhook_masked=_mask(guild.discord_webhook_url, 35),
    )


@router.put("/", response_model=IntegrationsOut)
def update(payload: IntegrationsIn, guild: GuildAdminDep, db: DbDep) -> IntegrationsOut:
    # None = no tocar; "" = borrar; cualquier otro = setear
    if payload.telegram_bot_token is not None:
        guild.telegram_bot_token = payload.telegram_bot_token.strip() or None
    if payload.telegram_chat_id is not None:
        guild.telegram_chat_id = payload.telegram_chat_id.strip() or None
    if payload.discord_webhook_url is not None:
        url = payload.discord_webhook_url.strip()
        if url and not url.startswith("https://discord.com/api/webhooks/") and not url.startswith("https://discordapp.com/api/webhooks/"):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Discord webhook debe empezar con https://discord.com/api/webhooks/")
        guild.discord_webhook_url = url or None
    db.commit()
    return get_status(guild)


class TestOut(BaseModel):
    telegram: bool
    discord: bool


@router.post("/test", response_model=TestOut)
def send_test(guild: GuildAdminDep, db: DbDep) -> TestOut:
    """Manda un mensaje de prueba a los canales configurados."""
    msg = f"🧪 Test desde EliteCards · Gremio: {guild.name}"
    result = notify_external.send_to_guild(db, guild, msg)
    return TestOut(**result)
