"""FastAPI app entrypoint."""
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app.core.config import settings
from app.routers import activity, admin, admin_crud, auth, catalog, events, gamification, guilds, notifications, players, rankings, reservations, seasons

app = FastAPI(
    title="EliteCards API",
    description="Plataforma TCG + RPG competitiva. Ruta del Campeón.",
    version="0.1.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


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
app.include_router(guilds.router, prefix="/api/guilds", tags=["guilds"])
app.include_router(guilds.super_router, prefix="/api/super-admin", tags=["super-admin"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(admin_crud.router, prefix="/api/admin", tags=["admin"])
