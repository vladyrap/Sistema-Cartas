"""FastAPI app entrypoint."""
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.middleware.httpsredirect import HTTPSRedirectMiddleware
from starlette.middleware.trustedhost import TrustedHostMiddleware

from app.core.config import settings
from app.core.logging_config import configure_logging, request_id_ctx, user_id_ctx
from app.core.rate_limit import limiter

# Configurar logging ANTES de instanciar la app. JSON en prod, texto en dev.
configure_logging(level="INFO", json=settings.is_prod)

# Sentry — init lo más temprano posible para capturar errores de boot también.
# Solo activa si SENTRY_DSN está configurado.
if settings.sentry_dsn:
    import sentry_sdk
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.env,
        traces_sample_rate=settings.sentry_traces_sample_rate,
        send_default_pii=False,
    )
    logging.getLogger(__name__).info("Sentry inicializado (env=%s)", settings.env)
from app.routers import (
    activity, admin, admin_crud, ai, announcements, auth, bounty,
    bounty_contracts, brain_io, card_drama, card_of_day, cardgrave, catalog,
    ceiling, checkin, constellation, cosmos, deck_dna, deck_roulette, decks,
    battle_pass as battle_pass_router,
    coming_soon as coming_soon_router,
    competitive as competitive_router,
    content_engine as content_engine_router,
    growth as growth_router,
    meta_competitive as meta_competitive_router,
    devotion, discord as discord_router, documentary, events, gamification,
    guilds, integrations, notifications, pack_opening, payments, players,
    polls, quantum, quests, rankings, ratings, realtime, referrals,
    reservations, scanner, sealed, search as search_router, seasons,
    smack_talk, spinner, streaks, tcg as tcg_router, tcg_news as tcg_news_router, timelapse, tinder,
    tornado, tournament_admin, tournament_flow, tournament_pro,
    tournament_universe as tour_universe_router, uploads,
    voice, wishlist, wordle, wrapped,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Boot/shutdown hooks: schema, FTS index, scheduler, etc."""
    logger = logging.getLogger("app.lifespan")

    # Schema: crea las tablas que falten (idempotente, NUNCA borra). Hace que
    # un deploy fresco contra Postgres vacía "just work" sin correr migraciones
    # manuales a mano. Para schema versionado, usar scripts/init_db.py.
    if os.environ.get("AUTO_CREATE_SCHEMA", "1") == "1":
        try:
            from app.core.db import engine
            from app.models import Base
            Base.metadata.create_all(bind=engine)
            logger.info("schema ensured (create_all)")
        except Exception:
            logger.exception("create_all on boot failed")

    # Search FTS5: instalar triggers + rebuild si es la primera vez.
    try:
        from app.services import search as search_svc
        search_svc.install_triggers()
        # Lazy init: solo rebuild si está vacío.
        from sqlalchemy import text
        from app.core.db import engine
        with engine.connect() as conn:
            try:
                count = conn.execute(text("SELECT count(*) FROM search_index")).scalar() or 0
            except Exception:
                count = 0
        if count == 0:
            search_svc.rebuild_index()
            logger.info("FTS index rebuilt on boot")
    except Exception:
        logger.exception("FTS boot failed (not fatal)")

    # FX rate inicial — best effort, no fatal si falla.
    try:
        from app.services import fx
        fx.refresh()
    except Exception:
        logger.exception("FX initial refresh failed (not fatal)")

    # Scheduler.
    try:
        from app.services import scheduler as sched_svc
        sched_svc.start()
    except Exception:
        logger.exception("scheduler start failed (not fatal)")

    yield

    # Shutdown.
    try:
        from app.services import scheduler as sched_svc
        sched_svc.stop()
    except Exception:
        pass


class RequestIdMiddleware(BaseHTTPMiddleware):
    """Inyecta X-Request-Id (genera uno si no viene) y mide latencia.

    El request_id queda en contextvars para que TODOS los logs de ese request
    salgan con el mismo id, sin tener que pasarlo manualmente por todos lados.
    """

    async def dispatch(self, request: Request, call_next):
        req_id = request.headers.get("x-request-id") or uuid.uuid4().hex[:16]
        token_req = request_id_ctx.set(req_id)
        token_user = user_id_ctx.set(None)
        request.state.request_id = req_id

        start = time.perf_counter()
        try:
            response = await call_next(request)
        finally:
            elapsed_ms = (time.perf_counter() - start) * 1000
            logging.getLogger("http").info(
                "request_completed",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "status": getattr(locals().get("response", None), "status_code", 0),
                    "latency_ms": round(elapsed_ms, 2),
                },
            )
            request_id_ctx.reset(token_req)
            user_id_ctx.reset(token_user)

        response.headers["X-Request-Id"] = req_id
        return response


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
    description="""
**EliteCards** — Plataforma TCG + RPG competitiva por temporadas.

## Conceptos clave
- **Gremio** — tenant del sistema (cada tienda/sociedad). Recursos (eventos, productos, etc.) están scopeados a un Gremio vía el header `X-Guild-Id`.
- **Elite ID** — credencial digital del jugador (formato `EC-YYYY-NNNNNN`).
- **Temporada** — ciclo competitivo. Al cerrar una, los rangos altos (Maestro/Campeón) empiezan la siguiente como Duelista N10; el resto vuelve a Iniciado N1.
- **Glicko-2** — sistema de rating por (player, game). El rating se actualiza en eventos COMPETITIVE / ELITE_CHALLENGE / FINAL_ELITE.

## Auth
- POST `/auth/login` → `access_token` (15min) + `refresh_token` (7d).
- Header: `Authorization: Bearer <access_token>`.
- POST `/auth/logout` revoca el token server-side (queda en `revoked_tokens`).
- 5 fallos de login en 15min → cuenta bloqueada 30min.

## Multi-tenant
- Endpoints scope-aware leen `X-Guild-Id`. Sin él, fallan con 400 (o, en algunos, asumen "default").
- `GET /guilds/me` devuelve los Gremios donde el usuario es miembro.

## Rate limits
- Login: 10/min · Register: 5/h · Forgot/reset: 5–10/h · Webhooks externos: 30/min.
- Errores 429 incluyen header `Retry-After`.

## Robustez
- Cada request tiene un `X-Request-Id` (en headers de respuesta) para correlación de logs.
- `GET /health/deep` para readiness (DB + Redis + scheduler + FTS).
- APIs externas (Scryfall, Telegram, etc.) tienen retry con exponential backoff + circuit breaker.

## Repositorio
- README backend: `/backend/README.md`
- `.env.example` lista todas las vars necesarias.
""",
    version="0.1.0",
    contact={"name": "EliteCards", "url": "https://elitecards.cl"},
    lifespan=lifespan,
    openapi_tags=[
        {"name": "auth", "description": "Registro, login, refresh, logout, verify email, reset password."},
        {"name": "guilds", "description": "Multi-tenancy: crear, listar, configurar Gremios."},
        {"name": "players", "description": "Perfiles de jugadores, públicos y privados."},
        {"name": "seasons", "description": "Temporadas competitivas. Solo SUPER_ADMIN puede crearlas."},
        {"name": "events", "description": "Torneos suizos, brackets, pairings."},
        {"name": "rankings", "description": "Ranking de la temporada activa por Gremio."},
        {"name": "catalog", "description": "Productos del Gremio (sobres, decks, singles, accesorios)."},
        {"name": "reservations", "description": "Reservas + pagos vía MercadoPago."},
        {"name": "payments", "description": "Webhooks MP. Idempotency via `payment_events`."},
        {"name": "ai", "description": "Deck analyzer + weekly summary con Claude."},
        {"name": "scanner", "description": "Lookup de cartas en Scryfall, Pokémon TCG, YGOPRODeck, apitcg.com."},
        {"name": "integrations", "description": "Telegram + Discord webhook por Gremio."},
        {"name": "discord", "description": "OAuth login con Discord."},
        {"name": "admin", "description": "Endpoints administrativos. Requieren ADMIN o GUILD_ADMIN."},
    ],
)

# Orden de middlewares: ejecutan inverso al orden de add_middleware.
# 1) Request ID (último en add, primer en correr — wrappea TODO incluyendo errores).
app.add_middleware(RequestIdMiddleware)
# 2) Security headers
app.add_middleware(SecurityHeadersMiddleware)

# 2) En prod: restringir Host (HTTPS lo fuerza el reverse proxy).
if settings.is_prod:
    # El redirect HTTP->HTTPS lo hace Caddy en el borde. Activarlo TAMBIÉN a
    # nivel app, detrás de un proxy TLS, genera un bucle infinito (uvicorn ve la
    # request como http vía nginx). Por eso es opt-in y default OFF; solo
    # actívalo (FORCE_HTTPS_REDIRECT=1) si exponés el backend directo sin proxy.
    if os.environ.get("FORCE_HTTPS_REDIRECT", "0") == "1":
        app.add_middleware(HTTPSRedirectMiddleware)
    # Trusted hosts: loopback (healthcheck Docker + proxy interno nginx) SIEMPRE,
    # más los dominios derivados de cors_origins (esquema/puerto descartados).
    trusted_hosts = ["localhost", "127.0.0.1"]
    for o in settings.cors_origins:
        host = o.replace("https://", "").replace("http://", "").split(":")[0].split("/")[0]
        if host and host not in trusted_hosts:
            trusted_hosts.append(host)
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
    """Liveness — solo verifica que el proceso está vivo. Para uptime checks."""
    return {"status": "ok", "env": settings.env}


@app.get("/fx")
def fx_status() -> dict:
    """Estado del tipo de cambio USD→CLP."""
    from app.services import fx
    return fx.get_fx_status()


@app.get("/health/deep")
def health_deep() -> JSONResponse:
    """Readiness — pingea cada dependencia. 200 si todo OK, 503 si algo falla.

    Útil para load balancers y monitores de uptime que necesitan saber si la
    app puede SERVIR tráfico, no solo si el proceso responde.
    """
    checks: dict[str, dict] = {}
    overall_ok = True

    # DB
    try:
        from sqlalchemy import text
        from app.core.db import engine
        with engine.connect() as conn:
            conn.execute(text("SELECT 1")).scalar()
        checks["db"] = {"ok": True}
    except Exception as e:
        checks["db"] = {"ok": False, "error": str(e)[:200]}
        overall_ok = False

    # Redis (best-effort: si no se usa, no falla)
    try:
        import redis
        r = redis.from_url(settings.redis_url, socket_connect_timeout=2)
        r.ping()
        checks["redis"] = {"ok": True}
    except Exception as e:
        # Redis es opcional en dev — solo failea overall si estamos en prod
        checks["redis"] = {"ok": False, "error": str(e)[:200]}
        if settings.is_prod:
            overall_ok = False

    # Scheduler corriendo
    try:
        from app.services import scheduler as sched_svc
        running = bool(getattr(sched_svc, "_scheduler", None) and sched_svc._scheduler.running)
        checks["scheduler"] = {"ok": running}
        if not running and settings.is_prod:
            overall_ok = False
    except Exception as e:
        checks["scheduler"] = {"ok": False, "error": str(e)[:200]}

    # FTS index existe
    try:
        from sqlalchemy import text
        from app.core.db import engine
        with engine.connect() as conn:
            count = conn.execute(text("SELECT count(*) FROM search_index")).scalar() or 0
        checks["fts"] = {"ok": True, "rows": count}
    except Exception as e:
        checks["fts"] = {"ok": False, "error": str(e)[:200]}

    payload = {
        "status": "ok" if overall_ok else "degraded",
        "env": settings.env,
        "checks": checks,
    }
    return JSONResponse(payload, status_code=200 if overall_ok else 503)


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
app.include_router(payments.router, prefix="/api/payments", tags=["payments"])
app.include_router(spinner.router, prefix="/api/spinner", tags=["spinner"])
app.include_router(card_of_day.router, prefix="/api/card-of-day", tags=["card-of-day"])
app.include_router(bounty.router, prefix="/api/bounty", tags=["bounty"])
app.include_router(scanner.router, prefix="/api/scanner", tags=["scanner"])
app.include_router(wrapped.router, prefix="/api/wrapped", tags=["wrapped"])
app.include_router(tinder.router, prefix="/api/tinder", tags=["tinder"])
app.include_router(pack_opening.router, prefix="/api/pack", tags=["pack"])
app.include_router(wordle.router, prefix="/api/wordle", tags=["wordle"])
app.include_router(ceiling.router, prefix="/api/ceiling", tags=["ceiling"])
app.include_router(smack_talk.router, prefix="/api/smack-talk", tags=["smack-talk"])
app.include_router(integrations.router, prefix="/api/integrations", tags=["integrations"])
app.include_router(discord_router.router, prefix="/api/discord", tags=["discord"])
app.include_router(cardgrave.router, prefix="/api/cardgrave", tags=["cardgrave"])
app.include_router(timelapse.router, prefix="/api", tags=["timelapse"])
app.include_router(tornado.router, prefix="/api/tornado", tags=["tornado"])
app.include_router(bounty_contracts.router, prefix="/api/bounty-contracts", tags=["bounty-contracts"])
app.include_router(deck_roulette.router, prefix="/api/deck-roulette", tags=["deck-roulette"])
app.include_router(deck_dna.router, prefix="/api/decks", tags=["deck-dna"])
app.include_router(card_drama.router, prefix="/api/card-drama", tags=["card-drama"])
app.include_router(devotion.router, prefix="/api/devotion", tags=["devotion"])
app.include_router(sealed.router, prefix="/api/sealed", tags=["sealed"])
app.include_router(voice.router, prefix="/api/voice", tags=["voice"])
app.include_router(constellation.router, prefix="/api/constellation", tags=["constellation"])
app.include_router(documentary.router, prefix="/api", tags=["documentary"])
app.include_router(quantum.router, prefix="/api/quantum", tags=["quantum"])
app.include_router(quests.router, prefix="/api/quests", tags=["quests"])
app.include_router(brain_io.router, prefix="/api/brain", tags=["brain-io"])
app.include_router(tournament_pro.router, prefix="/api/tour-pro", tags=["tournament-pro"])
app.include_router(tournament_flow.router, prefix="/api/tour-flow", tags=["tournament-flow"])
app.include_router(tournament_admin.router, prefix="/api/tour-admin", tags=["tournament-admin"])
app.include_router(tour_universe_router.router, prefix="/api/tour-univ", tags=["tournament-universe"])
app.include_router(competitive_router.router, prefix="/api/competitive", tags=["competitive"])
app.include_router(battle_pass_router.router, prefix="/api/battle-pass", tags=["battle-pass"])
app.include_router(meta_competitive_router.router, prefix="/api/meta", tags=["meta-competitive"])
app.include_router(growth_router.router, prefix="/api/growth", tags=["growth"])
app.include_router(content_engine_router.router, prefix="/api/content", tags=["content-engine"])
app.include_router(tcg_news_router.router, prefix="/api/news", tags=["news"])
app.include_router(coming_soon_router.router, prefix="/api/coming-soon", tags=["coming-soon"])
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
app.include_router(ai.router, prefix="/api/ai", tags=["ai"])
app.include_router(guilds.router, prefix="/api/guilds", tags=["guilds"])
app.include_router(guilds.super_router, prefix="/api/super-admin", tags=["super-admin"])
app.include_router(admin.router, prefix="/api/admin", tags=["admin"])
app.include_router(admin_crud.router, prefix="/api/admin", tags=["admin"])
app.include_router(realtime.router, prefix="/api/rt", tags=["realtime"])
app.include_router(tcg_router.router, prefix="/api/tcg", tags=["tcg"])
app.include_router(ratings.router, prefix="/api/ratings", tags=["ratings"])
app.include_router(ratings.bracket_router, prefix="/api", tags=["bracket"])
app.include_router(search_router.router, prefix="/api", tags=["search"])
app.include_router(search_router.admin_router, prefix="/api/admin", tags=["admin"])
app.include_router(cosmos.router, prefix="/api/cosmos", tags=["cosmos"])
