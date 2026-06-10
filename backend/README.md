# EliteCards · Backend

FastAPI + SQLAlchemy 2 + (SQLite dev / PostgreSQL prod) + Redis + APScheduler.

## Setup local rápido

```bash
cd backend
python -m venv .venv
. .venv/Scripts/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Editá .env: al menos JWT_SECRET (>=32 chars), DATABASE_URL, ALLOWED_ORIGINS.
python -m scripts.seed                 # seed inicial
uvicorn app.main:app --reload          # http://localhost:8000
```

API docs: http://localhost:8000/docs

## Variables de entorno críticas

| Var | Default | Descripción |
|---|---|---|
| `DATABASE_URL` | sqlite:///./elitecards.db | Postgres en prod (`postgresql+psycopg2://...`) |
| `REDIS_URL` | redis://localhost:6379/0 | Cache. Opcional en dev |
| `JWT_SECRET` | (FALLA en prod si default) | 64+ chars random. `python -c "import secrets;print(secrets.token_urlsafe(48))"` |
| `ENV` | dev | `prod` activa HTTPS redirect + HSTS + valida config |
| `ALLOWED_ORIGINS` | localhost:5173 | CSV de orígenes CORS. En prod sin `localhost` |
| `SENTRY_DSN` | — | Vacío = sin error tracking |
| `MP_WEBHOOK_SECRET` | — | Validar firma webhook MercadoPago |
| `RESEND_API_KEY` | — | Email transaccional (recomendado) |
| `DISCORD_CLIENT_ID/SECRET` | — | OAuth login con Discord |
| `POKEMON_TCG_API_KEY` | — | Opcional, mejor rate limit |
| `APITCG_API_KEY` | — | One Piece / Union Arena / Digimon |
| `USD_CLP_RATE` | 950 | Fallback. Live via open.er-api.com |

Lista completa en `.env.example`.

## Migraciones

Sin Alembic activo. Scripts manuales idempotentes en `scripts/migrate_*.py`:

```bash
python -m scripts.migrate_payment_events
python -m scripts.migrate_features_v2      # daily_spins, daily_cards, bounty_kills
python -m scripts.migrate_features_v3      # pack_openings, wordle, card_swipes
python -m scripts.migrate_integrations     # discord/telegram cols
python -m scripts.migrate_robustness       # revoked_tokens, login_attempts
```

## Health checks

- `GET /health` — liveness (proceso vivo)
- `GET /health/deep` — readiness (DB + Redis + scheduler + FTS). 503 si algo degradado
- `GET /fx` — tipo de cambio USD→CLP actual

## Endpoints principales por dominio

| Dominio | Prefix | Highlights |
|---|---|---|
| Auth | `/api/auth` | login (con account lockout), register (con HIBP check), logout (revoca JWT), refresh |
| Discord | `/api/discord` | OAuth `login` → `callback`, `disconnect` |
| Multi-tenant | `/api/guilds` | switching, `me` (mis Gremios) |
| Eventos | `/api/events` | torneos suizos, pairings, brackets |
| Pagos | `/api/payments` | MercadoPago. Webhook idempotente vía `payment_events` |
| Scanner | `/api/scanner` | 6 TCGs: magic, pokemon, yugioh, onepiece, union, digimon |
| Integrations | `/api/integrations` | Telegram + Discord webhook por Gremio |
| Features locas | `/api/{spinner,pack,wordle,tinder,ceiling,smack-talk,bounty,wrapped,card-of-day}` | — |

## Seguridad

- **JWT con `jti`** revocable. Logout server-side via `revoked_tokens`.
- **Account lockout** anti brute-force: 5 fails en 15min → bloqueado 30min.
- **Password policy**: mínimo 8 chars, letras+números, no comunes, no tu alias/email. Check HIBP k-anonymity (rechaza pwd con 100+ apariciones públicas).
- **Audit log** de acciones admin en `admin_action_log`.
- **Rate limits** por endpoint vía slowapi.
- **HTTPS redirect + HSTS + security headers** en prod.

## Observabilidad

- **Structured JSON logs** con `request_id` + `user_id` en cada line (`ENV=prod`).
- **Header `X-Request-Id`** en cada response para correlación.
- **Sentry** opcional (set `SENTRY_DSN`).
- **`/fx`** muestra rate FX actual + última actualización.

## Robustez HTTP externa

`app/services/http_client.py` envuelve httpx con:
- Retry exponential backoff (0.4s → 0.8s → 1.6s) en 5xx, timeout, connect error.
- Circuit breaker por host: 5 fails consecutivos → abierto 30s.

Usado por: Scryfall, Pokémon TCG, YGOPRODeck, apitcg.com, Telegram, Resend, Discord.

## Tests

```bash
pytest -v                       # 4 suites: progression, season, exp, multitenant
pytest --cov=app                # con coverage
```

E2E con Playwright en `/frontend/e2e/`.

## CI

`.github/workflows/ci.yml` corre en cada push/PR:
1. `backend` — `pytest -v`
2. `frontend` — `npm run build`
3. `security` — `pip-audit` (HIGH/CRITICAL gates) + `npm audit` (HIGH gate)

## Deploy

```bash
# 1. Smoke test post-deploy
BASE_URL=https://api.tu-dominio.com bash scripts/smoke_test.sh

# 2. Backups Postgres (cron en VPS, ver scripts/BACKUP_README.md)
30 3 * * * DATABASE_URL='postgresql://...' /opt/elitecards/scripts/pg_backup.sh
```

## Troubleshooting

| Síntoma | Causa probable |
|---|---|
| Boot falla con `JWT_SECRET es débil` | Generar uno nuevo: `python -c "import secrets;print(secrets.token_urlsafe(48))"` |
| Boot falla con `DATABASE_URL=sqlite en producción` | Migrar a Postgres antes de subir |
| 422 con `loc=["query","current"]` en POST | Quitar `from __future__ import annotations` del router (rompe FastAPI Depends con slowapi) |
| Webhook MP llega dos veces | Tabla `payment_events.idempotency_key` UNIQUE lo previene; revisar logs |
| Cuenta bloqueada 30min | 5 logins fallidos en 15min. Ver `login_attempts`. Limpiar manualmente si fue test |
| Scryfall timeout | Circuit breaker probablemente abrió. `GET /health/deep` muestra estado. Espera 30s |
