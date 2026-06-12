# Deploy a producción — EliteCards

Guía para levantar EliteCards en un **VPS que ya corre otros sistemas** (ej. el
mismo Arsys donde vive miespejo) **sin chocar ni mezclarse con nada**.

El stack está dockerizado y hay un compose de producción **aislado**:
`docker-compose.prod.yml` + `backend/Dockerfile` + `frontend/Dockerfile`.

## Por qué NO se mezcla con los otros sistemas

`docker-compose.prod.yml` está diseñado para convivir:

| Riesgo | Cómo se evita |
|---|---|
| Choque de puertos (otro Postgres en 5432, Redis en 6379, web en 80) | **db, redis y backend NO publican puertos al host.** Viven solo en la red interna `elitecards-net`. |
| Pelear por el 80/443 con miespejo | El único puerto del host es el frontend, atado a **`127.0.0.1:18080`** (loopback). El reverse proxy que ya sirve miespejo le pasa tu subdominio. |
| Pisar la BD de otro sistema | La Postgres de EliteCards no es alcanzable desde fuera de su red; imposible conectarse a la equivocada. `DATABASE_URL` está fijo en el compose. |
| Nombres compartidos (contenedores, volúmenes, redes) | Todo lleva prefijo propio: proyecto `elitecards`, contenedores `elitecards-*`, volumen `elitecards_pgdata`, red `elitecards-net`. |

Verificado localmente con `docker compose config`: **un solo puerto** expuesto
(`127.0.0.1:18080`), el resto interno.

## 0. Prerrequisitos

- Docker + Docker Compose v2 en el VPS (miespejo ya lo tiene si corre con Docker)
- El dominio `elitecards.cl` con un **A record → 82.223.196.65** (apex; agregá
  también `www` si querés). Verificá con: `dig +short elitecards.cl`
- **El Caddy de miespejo** es el front-door (dueño de 80/443, corre como
  contenedor dentro del compose de miespejo). EliteCards se integra detrás de él
  vía una red Docker compartida `web` (ver §5). No se levanta un segundo proxy.

## 1. Chequear que el puerto esté libre (ANTES de levantar)

```bash
ss -tlnp | grep 18080      # no debe devolver nada
```

Si está ocupado, elegí otro puerto alto (ej. 18090) y ponelo en `WEB_PORT`
dentro de `.env.prod` (paso 2). Los puertos internos (5432/6379/8000) no
importan: no se publican.

## 2. Traer el código y configurar secrets

```bash
# en el VPS, en una carpeta separada de miespejo (ej. /opt/elitecards)
git clone -b feat/mega-system https://github.com/vladyrap/Sistema-Cartas.git elitecards
cd elitecards

cp .env.prod.example .env.prod
nano .env.prod        # completá los valores (ver tabla abajo)
```

`.env.prod` está en `.gitignore` — no se sube. **Generá los secrets en el VPS**,
no los pegues en ningún chat:

```bash
openssl rand -base64 24   # POSTGRES_PASSWORD
openssl rand -base64 48   # JWT_SECRET
```

**Obligatorio en `.env.prod`:**

| Variable | Qué poner |
|---|---|
| `POSTGRES_PASSWORD` | salida de `openssl rand -base64 24` |
| `JWT_SECRET` | salida de `openssl rand -base64 48` (32+ chars; el boot rechaza secrets débiles en prod) |
| `ALLOWED_ORIGINS` | tu URL, ej. `https://elitecards.cl` |
| `FRONTEND_URL` | idem — se usa en emails y back_urls de MercadoPago |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | el primer super-admin que crea el bootstrap |
| `WEB_PORT` | `18080` (o el que elegiste libre en el paso 1) |

**Opcionales** (todo degrada a mock/no-op si falta): `AI_BACKEND=anthropic` +
`ANTHROPIC_API_KEY` (IA real), `MP_BACKEND=real` + `MP_WEBHOOK_SECRET` (cobros
MercadoPago — el token va por gremio en la app, no acá), `RESEND_API_KEY`
(emails), `SENTRY_DSN` (errores).

## 3. Levantar el stack aislado

```bash
# Red compartida con el Caddy de miespejo (idempotente — si ya existe, no pasa nada)
docker network create web 2>/dev/null || true

docker compose --env-file .env.prod -f docker-compose.prod.yml up --build -d
docker compose -f docker-compose.prod.yml logs -f backend
# buscá en el log: "schema ensured" + "scheduler started"
```

El backend hace `create_all()` al arrancar (`AUTO_CREATE_SCHEMA=1`), así que la
Postgres vacía se inicializa sola con las 113 tablas. **No corras los
`scripts/migrate_*.py`** (son sintaxis SQLite, solo para dev).

## 4. Crear el primer admin + datos base

```bash
docker compose --env-file .env.prod -f docker-compose.prod.yml \
  run --rm backend python -m scripts.init_db
```

`init_db` es idempotente y **nunca borra**: crea el gremio raíz, los games base
y el SUPER_ADMIN desde `ADMIN_EMAIL`/`ADMIN_PASSWORD`. Seguro re-correrlo.

## 5. Integrar detrás del Caddy de miespejo (HTTPS)

El Caddy de miespejo (dueño de 80/443, contenedor dentro del compose de
miespejo) es quien reparte por dominio. EliteCards se conecta a él por la red
`web` y le agregás un site block. **Caddy emite el certificado de elitecards.cl
solo** (necesita el A record del §0 ya propagado) y maneja WebSocket
transparente — no hace falta config extra.

> ⚠️ Esto toca el front-door de miespejo (sistema en vivo). Validá SIEMPRE el
> Caddyfile antes de aplicar, y usá el camino sin downtime de abajo.

**Paso 1 — agregar el site block** en `miespejo/infra/caddy/Caddyfile`
(al final, como bloque nuevo aparte del de miespejo):

```
elitecards.cl, www.elitecards.cl {
    encode gzip zstd
    reverse_proxy elitecards-frontend:80
}
```

**Paso 2 — sumar el Caddy de miespejo a la red `web`.** En
`miespejo/docker-compose.prod.yml`, al servicio `caddy` agregале:

```yaml
  caddy:
    # ...lo que ya tiene...
    networks:
      - default      # mantiene el acceso a frontend/backend de miespejo
      - web          # nuevo: para alcanzar elitecards-frontend
```

y al final del archivo, el bloque top-level de redes:

```yaml
networks:
  web:
    external: true
```

**Paso 3 — aplicar SIN downtime** (recargar config + conectar la red en caliente,
sin recrear el contenedor):

```bash
cd <dir-de-miespejo>
# validar el Caddyfile editado ANTES de tocar nada (si falla, NO sigas):
docker compose -f docker-compose.prod.yml --env-file .env.prod exec caddy \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

# conectar el Caddy en vivo a la red web (sin recrear):
docker network connect web "$(docker compose -f docker-compose.prod.yml ps -q caddy)"

# recargar la config (zero-downtime, NO reinicia Caddy):
docker compose -f docker-compose.prod.yml --env-file .env.prod exec caddy \
  caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

El cambio en el compose (paso 2) deja la red `web` **persistente**: la próxima
vez que recrees miespejo, el Caddy vuelve a unirse solo. El `network connect` lo
aplica ya mismo sin esperar a esa recreación.

> Camino alternativo con blip de ~3s (más simple, recrea solo el caddy):
> `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d caddy`
> — hacelo en un horario de baja si lo preferís.

## 6. Verificación post-deploy

```bash
# desde el VPS, contra el contenedor
curl -fsS http://127.0.0.1:18080/api/health        # liveness
curl -fsS http://127.0.0.1:18080/api/health/deep    # DB + Redis + scheduler + search

# desde tu máquina, contra el dominio
curl -fsS https://elitecards.cl/api/health
```

`/api/health/deep` debe devolver `db: ok`. En Postgres el search usa ILIKE
(FTS5 es solo SQLite). Después: entrá al frontend, logueate con el admin del
paso 4, creá un evento de prueba y verificá la inscripción.

## 7. Backups

`scripts/backup_postgres.sh` hace `pg_dump`. En cron del host:

```cron
0 4 * * *  cd /opt/elitecards && docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T db pg_dump -U elitecards elitecards | gzip > /backups/elitecards-$(date +\%F).sql.gz
```

## 8. Operación

- **Parar** (conserva la BD): `docker compose -f docker-compose.prod.yml down`
- **Actualizar código**: `git pull && docker compose --env-file .env.prod -f docker-compose.prod.yml up --build -d`
- **Borrar la BD** (¡cuidado!): `docker compose -f docker-compose.prod.yml down -v`
- **Scheduler**: 18 jobs in-process. Con 1 réplica del backend está bien. Si
  escalás, `SCHEDULER_DISABLED=1` en todas menos una.
- **WebSockets**: `ConnectionManager` in-process. Con 1 worker alcanza.
- **Migraciones futuras**: `create_all` + scripts manuales idempotentes, no
  Alembic. Para cambios de schema con datos, `ALTER TABLE` idempotente con la
  sintaxis de Postgres.

---

### Nota: `docker-compose.yml` vs `docker-compose.prod.yml`

- `docker-compose.yml` → **dev local**. Publica 5432/6379/8000/80 para que
  puedas pegarle a la BD desde tu máquina. **NO usar en el VPS.**
- `docker-compose.prod.yml` → **producción aislada**. db/redis/backend solo en
  la red privada `elitecards-net`. El frontend está en `elitecards-net` + `web`
  (para que lo alcance el Caddy de miespejo) y además publica `127.0.0.1:18080`
  solo para debug. Es el que usás en el VPS.
