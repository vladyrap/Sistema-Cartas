# Integración de EliteCards en el VPS de miespejo (paso a paso)

Runbook autocontenido para levantar **elitecards.cl** en el mismo VPS Arsys
(`82.223.196.65`) donde ya corre **miespejo**, sin que se mezclen ni se pisen.

> Resumen del diseño: EliteCards corre en su propio `docker-compose.prod.yml`
> con su Postgres/Redis/backend **100% privados** en la red `elitecards-net`.
> El Caddy de miespejo (dueño de 80/443) reparte por dominio. El **único** punto
> de contacto entre los dos sistemas es: `Caddy(miespejo) → elitecards-frontend`,
> a través de una red Docker compartida llamada `web`. Las bases de datos nunca
> se ven entre sí.

```
internet :443
   │
   ▼
Caddy (miespejo) ──(red web)──► elitecards-frontend ──(red elitecards-net)──► backend ─► db / redis
   │                                                                            (todo privado)
   └─(red default miespejo)──► frontend/backend de miespejo (intactos)
```

---

## 0. Pre-requisito: DNS

En el panel DNS de `elitecards.cl`:

```
elitecards.cl.        A    82.223.196.65
www.elitecards.cl.    A    82.223.196.65
```

Caddy **no puede emitir el certificado HTTPS** hasta que esto resuelva. Verificá:

```bash
dig +short elitecards.cl      # debe devolver 82.223.196.65
```

---

## 1. Desplegar EliteCards (no toca miespejo)

```bash
# red compartida con el Caddy de miespejo (idempotente)
docker network create web 2>/dev/null || true

# traer el código a una carpeta separada de miespejo
cd /opt
git clone -b feat/mega-system https://github.com/vladyrap/Sistema-Cartas.git elitecards
cd elitecards

# generar secrets EN EL VPS (no los pegues en ningún chat)
openssl rand -base64 24        # → POSTGRES_PASSWORD
openssl rand -base64 48        # → JWT_SECRET

# completar config
cp .env.prod.example .env.prod
nano .env.prod
#   POSTGRES_PASSWORD=<el de arriba>
#   JWT_SECRET=<el de arriba>
#   ALLOWED_ORIGINS=https://elitecards.cl
#   FRONTEND_URL=https://elitecards.cl
#   ADMIN_EMAIL=admin@elitecards.cl
#   ADMIN_PASSWORD=<una pass fuerte>
#   WEB_PORT=18080

# levantar
docker compose --env-file .env.prod -f docker-compose.prod.yml up --build -d

# crear admin + datos base (idempotente, nunca borra)
docker compose --env-file .env.prod -f docker-compose.prod.yml run --rm backend python -m scripts.init_db

# chequeo local antes de exponer al mundo
curl -fsS http://127.0.0.1:18080/api/health/deep      # debe decir db: ok
```

Si `health/deep` da `db: ok`, EliteCards está corriendo y aislado. Todavía no es
accesible desde internet — eso lo habilita el paso 3.

---

## 2. Parche de miespejo (2 archivos)

> ⚠️ Esto toca el front-door de un sistema en vivo con pacientes. El paso 3
> valida antes de aplicar y usa recarga sin downtime. Aun así, hacelo en un
> horario de baja.

### a) `miespejo/infra/caddy/Caddyfile`

Agregá al final un **bloque nuevo** (separado del bloque `{$DOMAIN}` de miespejo,
que no se toca):

```
elitecards.cl, www.elitecards.cl {
    encode gzip zstd
    reverse_proxy elitecards-frontend:80
}
```

Caddy emite el certificado de elitecards.cl solo y maneja WebSocket
transparente — no hace falta config extra.

### b) `miespejo/docker-compose.prod.yml`

Al servicio `caddy`, agregale la clave `networks` (si no la tenía):

```yaml
  caddy:
    image: caddy:2.8-alpine
    # ...todo lo que ya tiene (environment, volumes, ports, depends_on)...
    networks:
      - default      # mantiene el acceso a frontend/backend de miespejo
      - web          # NUEVO: para alcanzar elitecards-frontend
```

Y al final del archivo, el bloque top-level de redes:

```yaml
networks:
  web:
    external: true
```

---

## 3. Aplicar SIN downtime

```bash
cd <dir-de-miespejo>

# 1) VALIDAR el Caddyfile editado. Si FALLA, corregí y NO sigas (miespejo no se entera):
docker compose -f docker-compose.prod.yml --env-file .env.prod exec caddy \
  caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile

# 2) conectar el Caddy a la red web EN VIVO (sin recrear el contenedor):
docker network connect web "$(docker compose -f docker-compose.prod.yml ps -q caddy)"

# 3) recargar config (zero-downtime — NO reinicia Caddy; si la config nueva fallara,
#    Caddy mantiene la anterior corriendo):
docker compose -f docker-compose.prod.yml --env-file .env.prod exec caddy \
  caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

El cambio del compose (paso 2b) deja la red `web` **persistente**: la próxima vez
que recrees miespejo, el Caddy se vuelve a unir solo. El `network connect` lo
aplica ya, sin esperar esa recreación.

> Alternativa con blip de ~3s (más simple, recrea solo el caddy):
> `docker compose -f docker-compose.prod.yml --env-file .env.prod up -d caddy`

---

## 4. Verificar

```bash
curl -fsS https://elitecards.cl/api/health          # desde cualquier lado
curl -fsS https://elitecards.cl/api/health/deep      # db: ok
```

Después: entrá a `https://elitecards.cl`, login con el admin del paso 1, creá un
evento de prueba y verificá el flujo de inscripción. miespejo debe seguir
funcionando igual en su propio dominio.

---

## 5. Rollback (si algo sale mal)

**Sacar elitecards.cl del Caddy de miespejo** (deja miespejo intacto):

```bash
cd <dir-de-miespejo>
# borrá el bloque elitecards.cl del Caddyfile, después:
docker compose -f docker-compose.prod.yml --env-file .env.prod exec caddy \
  caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
# (opcional) desconectar de la red web:
docker network disconnect web "$(docker compose -f docker-compose.prod.yml ps -q caddy)"
# y revertir el cambio de networks en docker-compose.prod.yml
```

**Bajar EliteCards** (conserva la BD):

```bash
cd /opt/elitecards
docker compose -f docker-compose.prod.yml down          # NO borra datos
# docker compose -f docker-compose.prod.yml down -v      # ⚠️ borra la BD
```

---

## 6. Operación día a día

| Acción | Comando (en `/opt/elitecards`) |
|---|---|
| Ver logs | `docker compose -f docker-compose.prod.yml logs -f backend` |
| Actualizar código | `git pull && docker compose --env-file .env.prod -f docker-compose.prod.yml up --build -d` |
| Reiniciar | `docker compose --env-file .env.prod -f docker-compose.prod.yml restart` |
| Backup BD | `docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T db pg_dump -U elitecards elitecards | gzip > backup-$(date +%F).sql.gz` |

Backup automático en cron del host:

```cron
0 4 * * *  cd /opt/elitecards && docker compose --env-file .env.prod -f docker-compose.prod.yml exec -T db pg_dump -U elitecards elitecards | gzip > /backups/elitecards-$(date +\%F).sql.gz
```

> Notas: el scheduler (18 jobs) y los WebSockets corren in-process en el backend
> — con 1 réplica está bien. Para IA real, MercadoPago real, emails o Sentry,
> completá las variables opcionales de `.env.prod` (ver `.env.prod.example`).
