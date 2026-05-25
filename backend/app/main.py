"""FastAPI app entrypoint."""
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.core.config import settings
from app.core.rate_limit import limiter
from app.routers import activity, admin, admin_crud, announcements, auth, catalog, checkin, decks, events, gamification, guilds, notifications, players, polls, rankings, referrals, reservations, seasons, streaks, uploads, wishlist


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Inyecta headers de seguridad estándar.

    Notas:
    - CSP es laxa para APIs (no servimos HTML aquí). El front (Vite/Vercel/etc)
      debe definir el suyo propio.
    - HSTS solo tiene sentido detrás de HTTPS; FastAPI lo manda igual y el
      browser solo lo respeta sobre TLS.
    """

    async def dispatch(self, request: Request, call_next):
        response: Response = await call_next(request)
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
        response.headers["Permissions-Policy"] = "interest-cohort=()"
        if settings.is_prod:
            response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        return response


app = FastAPI(
    title="EliteCards API",
    description="Plataforma TCG + RPG competitiva. Ruta del Campeón.",
    version="0.1.0",
)

# Orden de middlewares: ejecutan inverso al orden de add_middleware.
# 1) Security headers (último en add, primer en correr — wrappea todo).
app.add_middleware(SecurityHeadersMiddleware)

# 2) En prod: forzar HTTPS + restringir Host.
if settings.is_prod:
    app.add_middleware(HTTPSRedirectMiddleware)
    # Trusted hosts: derivado de cors_origins, descartando esquema/puerto.
    trusted_hosts = []
    for o in settings.cors_origins:
        host = o.replace("https://", "").replace("http://", "").split(":")[0].split("/")[0]
        if host:
            trusted_hosts.append(host)
    if trusted_hosts:
        app.add_middleware(TrustedHostMiddleware, allowed_hosts=trusted_hosts)

# 3) CORS (el más cerca de la app, corre justo antes del handler).
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Rate limiter (slowapi se monta como state + exception handler)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "env": settings.env}


UPLOADS_DIR = Path(__file__).resolve().parent.parent / "uploads"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOADS_DIR)), name="uploads")


app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(players.router, prefix="/api/players", tags=["players"])
app.include_router(seasons.router, prefix="/api/seasons", tags=["seasons"])
app.include_router(rankings.router, prefix="/api/rankings", tags=["rankings"])
app.include_router(events.router, prefix="/api/events", tags=["events"])
app.include_router(events.games_router, prefix="/api/games", tags=["games"])
app.include_router(catalog.router, prefix="/api/catalog", tags=["catalog"])
app.include_router(reservations.router, prefix="/api/reservations", tags=["reservations"])
app.include_router(reservations.admin_router, prefix="/api/admin/reservations", tags=["admin"])
app.include_router(gamification.router, prefix="/api", tags=["gamification"])
app.include_router(gamification.admin_router, prefix="/api/admin/gamification", tags=["admin"])
app.include_router(notifications.router, prefix="/api/notifications", tags=["notifications"])
app.include_router(activity.router, prefix="/api/activity", tags=["activity"])
app.include_router(streaks.router, prefix="/api/streaks", tags=["streaks"])
app.include_router(uploads.router, prefix="/api/uploads", tags=["uploads"])
app.include_router(checkin.router, prefix="/api/checkin", tags=["checkin"])
app.include_router(announcements.router, prefix="/api/announcements", tags=["announcements"])
app.include_router(wishlist.router, prefix="/api/wishlist", tags=["wishlist"])
app.include_router(referrals.router, prefix="/api/referrals", tags=["referrals"])
app.include_router(decks.router, prefix="/api/decks", tags=["decks"])
app.include_router(polls.router, prefix="/api/polls", tags=["polls"])
app.include_router(guilds.router, prefix="/api/guilds", tags=["guilds"])
app.include_router(guilds.super_router, prefix="/api/super-admin", tags=["super-admin"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(admin_crud.router, prefix="/api/admin", tags=["admin"])
