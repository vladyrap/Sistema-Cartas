"""Discord OAuth2 login.

Flow:
  1. Frontend redirige al usuario a `/api/discord/login` que devuelve la URL
     de autorización de Discord.
  2. Usuario autoriza en Discord → Discord redirige a `discord_redirect_uri`
     (configurado en .env y en Discord Developer Portal) con `?code=...`.
  3. Frontend hace `POST /api/discord/callback` mandando ese `code`.
  4. Backend intercambia code → access_token → identidad Discord →
     resuelve/crea User → emite tu JWT propio.

Requiere:
  - DISCORD_CLIENT_ID + DISCORD_CLIENT_SECRET (Discord Developer Portal)
  - DISCORD_REDIRECT_URI registrado en el portal y en .env
"""
import logging
import secrets

import httpx
from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import DbDep, UserDep
from app.core.security import create_access_token, create_refresh_token, hash_password
from app.models import PlayerProfile, User, UserRole
from app.schemas.common import TokenResponse
from app.services.elite_id import generate_next_elite_id

log = logging.getLogger("discord_oauth")
router = APIRouter()

AUTH_URL = "https://discord.com/oauth2/authorize"
TOKEN_URL = "https://discord.com/api/oauth2/token"
USER_URL = "https://discord.com/api/users/@me"
SCOPES = "identify email"


class LoginUrlOut(BaseModel):
    url: str
    state: str


@router.get("/login", response_model=LoginUrlOut)
def login() -> LoginUrlOut:
    """Devuelve la URL de autorización de Discord. El frontend redirige."""
    if not settings.discord_client_id or not settings.discord_redirect_uri:
        raise HTTPException(
            status.HTTP_503_SERVICE_UNAVAILABLE,
            "Discord OAuth no está configurado en el server",
        )
    state = secrets.token_urlsafe(24)
    params = (
        f"client_id={settings.discord_client_id}"
        f"&redirect_uri={settings.discord_redirect_uri}"
        f"&response_type=code"
        f"&scope={SCOPES.replace(' ', '%20')}"
        f"&state={state}"
        f"&prompt=consent"
    )
    return LoginUrlOut(url=f"{AUTH_URL}?{params}", state=state)


class CallbackIn(BaseModel):
    code: str


@router.post("/callback", response_model=TokenResponse)
def callback(payload: CallbackIn, db: DbDep) -> TokenResponse:
    """Intercambia code → token, resuelve User, emite JWT propio."""
    if not (settings.discord_client_id and settings.discord_client_secret and settings.discord_redirect_uri):
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Discord OAuth no configurado")

    # 1. code → access_token (POST x-www-form-urlencoded)
    try:
        with httpx.Client(timeout=10.0) as cli:
            r = cli.post(
                TOKEN_URL,
                data={
                    "client_id": settings.discord_client_id,
                    "client_secret": settings.discord_client_secret,
                    "grant_type": "authorization_code",
                    "code": payload.code,
                    "redirect_uri": settings.discord_redirect_uri,
                },
                headers={"Content-Type": "application/x-www-form-urlencoded"},
            )
    except httpx.RequestError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Discord no responde")

    if r.status_code != 200:
        log.warning("Discord token exchange falló %s: %s", r.status_code, r.text[:200])
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Code inválido o expirado")

    access_token = r.json().get("access_token")
    if not access_token:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin access_token de Discord")

    # 2. identidad
    try:
        with httpx.Client(timeout=10.0) as cli:
            r2 = cli.get(USER_URL, headers={"Authorization": f"Bearer {access_token}"})
    except httpx.RequestError:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Discord no responde")
    if r2.status_code != 200:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "No se pudo obtener identidad Discord")

    d = r2.json()
    discord_id = str(d.get("id") or "")
    discord_email = (d.get("email") or "").lower()
    discord_username = d.get("global_name") or d.get("username") or "user"
    avatar_hash = d.get("avatar")
    if not discord_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Discord no devolvió id")

    # 3. Resolver User
    # Prioridad: (a) ya hay un user con discord_id; (b) coincide por email;
    # (c) crear uno nuevo (registro silencioso).
    user = db.scalar(select(User).where(User.discord_id == discord_id))
    if not user and discord_email:
        user = db.scalar(select(User).where(User.email == discord_email))
        if user:
            user.discord_id = discord_id
    if not user:
        if not discord_email:
            raise HTTPException(
                status.HTTP_400_BAD_REQUEST,
                "Tu cuenta de Discord no tiene email visible. Verificá el email en Discord o registrate manualmente.",
            )
        # Crear cuenta nueva
        user = User(
            email=discord_email,
            password_hash=hash_password(secrets.token_urlsafe(32)),  # password random; el user usará Discord
            role=UserRole.PLAYER,
            discord_id=discord_id,
            email_verified_at=__import__("datetime").datetime.utcnow().replace(tzinfo=__import__("datetime").timezone.utc),
        )
        db.add(user)
        db.flush()
        # Profile con alias = nombre Discord
        code, num = generate_next_elite_id(db)
        alias = discord_username[:30]
        # Evitar colisión de alias
        if db.scalar(select(PlayerProfile).where(PlayerProfile.alias == alias)):
            alias = f"{alias[:24]}-{num}"
        db.add(PlayerProfile(
            user_id=user.id, alias=alias, elite_id_code=code, elite_id_number=num,
        ))

    # Update Discord meta
    user.discord_username = discord_username[:80]
    user.discord_avatar = avatar_hash
    db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id, extra_claims={"role": user.role.value}),
        refresh_token=create_refresh_token(user.id),
    )


class DiscordStatusOut(BaseModel):
    connected: bool
    discord_id: str | None = None
    discord_username: str | None = None
    avatar_url: str | None = None


@router.get("/me", response_model=DiscordStatusOut)
def my_discord(current: UserDep) -> DiscordStatusOut:
    avatar_url = None
    if current.discord_id and current.discord_avatar:
        avatar_url = f"https://cdn.discordapp.com/avatars/{current.discord_id}/{current.discord_avatar}.png?size=128"
    return DiscordStatusOut(
        connected=bool(current.discord_id),
        discord_id=current.discord_id,
        discord_username=current.discord_username,
        avatar_url=avatar_url,
    )


@router.post("/disconnect", status_code=204)
def disconnect(current: UserDep, db: DbDep) -> None:
    current.discord_id = None
    current.discord_username = None
    current.discord_avatar = None
    db.commit()
