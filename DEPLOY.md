# Deploy a producción — EliteCards

Guía mínima para llevar EliteCards a un servidor real con **Postgres**.
El stack ya está dockerizado (`docker-compose.yml` + `backend/Dockerfile` +
`frontend/Dockerfile`).

## 0. Prerrequisitos

- Docker + Docker Compose en el servidor (VPS, etc.)
- Un dominio apuntando al servidor (para HTTPS con un reverse proxy tipo
  Caddy/Nginx/Traefik delante — opcional pero recomendado)

## 1. Variables de entorno

Copiá `backend/.env.example` y completá lo crítico. **Lo mínimo obligatorio
para prod:**

| Variable | Por qué |
|---|---|
| `DATABASE_URL` | `postgresql+psycopg2://user:pass@db:5432/elitecards` |
| `JWT_SECRET` | 32+ chars aleatorios. El boot **rechaza** secrets débiles en prod |
| `ENV` | `prod` (activa validaciones estrictas) |
| `ALLOWED_ORIGINS` | tu dominio frontend, ej `https://elitecards.cl` |
| `FRONTEND_URL` | idem — se usa en links de email y back_urls de MercadoPago |

**Opcionales según features que quieras activar** (todo degrada a mock/no-op si
falta): `ANTHROPIC_API_KEY` + `AI_BACKEND=anthropic` (storylines, Content
Engine, OCR, resúmenes), `MP_BACKEND=real` + token MP por gremio (cobros
reales), `RESEND_API_KEY` (emails), `SENTRY_DSN` (error tracking),
`REDIS_URL` (cache compartida multi-worker).

> El token MercadoPago **no es global**: cada gremio guarda el suyo en
> `guilds.mp_access_token` (cada tienda cobra a su nombre). `MP_WEBHOOK_SECRET`
> sí es global, del panel MP, para validar la firma del webhook.

## 2. Esquema de base de datos

**No hace falta correr las 34 migraciones manuales** (`scripts/migrate_*.py`).
Esas usan sintaxis SQLite y solo servían para evolucionar la base de dev sin
perder datos. En un deploy fresco hay dos caminos, ambos idempotentes:

- **Automático** (default): el backend hace `create_all()` al arrancar
  (`AUTO_CREATE_SCHEMA=1`). Levantás el contenedor y las tablas se crean solas.
- **Explícito** (recomendado para control): correr una vez el bootstrap, que
  además crea el gremio raíz, los games base y el primer SUPER_ADMIN:

```bash
docker compose run --rm \
  -e ADMIN_EMAIL=admin@tutienda.cl \
  -e ADMIN_PASSWORD='una-pass-fuerte' \
  backend python -m scripts.init_db
```

`init_db` **nunca borra datos** — es seguro re-correrlo.

## 3. Levantar

```bash
# editá docker-compose.yml: cambiá POSTGRES_PASSWORD y el JWT_SECRET del backend
docker compose up --build -d
docker compose logs -f backend   # verificar "schema ensured" + "scheduler started"
```

Servicios: Postgres (5432), Redis (6379), backend (8000), frontend (80).

## 4. Verificación post-deploy

```bash
curl -fsS http://localhost:8000/health          # liveness simple
curl -fsS http://localhost:8000/health/deep      # DB + Redis + scheduler + FTS/ILIKE
```

`/health/deep` debe devolver `db: ok`. En Postgres el search usa ILIKE
(el FTS5 es solo SQLite) — el `search` reporta el modo activo.

Smoke funcional: entrá al frontend, logueate con el admin creado en el paso 2,
creá un evento de prueba y verificá que el flujo de inscripción funciona.

## 5. Backups

`scripts/backup_postgres.sh` hace `pg_dump`. Programalo en cron del host:

```cron
0 4 * * *  cd /ruta/elitecards && docker compose exec -T db pg_dump -U elitecards elitecards | gzip > /backups/elitecards-$(date +\%F).sql.gz
```

## 6. Notas de operación

- **Scheduler**: corre dentro del proceso del backend (18 jobs: FX, decay,
  cleanups, content runner, etc.). Con **1 sola réplica del backend** está bien.
  Si escalás a N réplicas, poné `SCHEDULER_DISABLED=1` en todas menos una para
  no duplicar jobs.
- **WebSockets** (spectator live): el `ConnectionManager` es in-process. Con 1
  worker alcanza; multi-worker necesitaría respaldarlo con Redis pub/sub.
- **Migraciones futuras**: este proyecto usa `create_all` + scripts manuales, no
  Alembic. Para cambios de schema en una base con datos, escribí un
  `ALTER TABLE` idempotente (mirá los `scripts/migrate_*.py` como patrón) y
  corré con la sintaxis del motor destino.
