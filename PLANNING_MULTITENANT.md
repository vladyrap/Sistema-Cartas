# EliteCards — Plan de migración a Multi-Tenant ("Gremios de Aventureros")

> Cada **tienda TCG** es un **Gremio de Aventureros** dentro de EliteCards.
> Un jugador puede pertenecer a varios Gremios y cada Gremio tiene su propio
> ranking, temporada, eventos, productos, misiones y Hall of Fame.

## Decisiones tomadas

| Decisión | Valor |
|---|---|
| Membresía | Multi-Gremio: un jugador puede unirse a varios |
| Datos | Casi todo por-Gremio. **Solo `Game` (TCG) es global**. |
| Creación de Gremio | Solo `SUPER_ADMIN`. Dueño de tienda solicita, SUPER_ADMIN aprueba. |
| Roles por-Gremio | Sí: un usuario puede ser ADMIN en G1 y PLAYER en G2 |
| Estrategia | Plan + schema + arranque incremental |

## Glosario

- **Gremio** (`Guild`) — la tienda/sociedad. Es el tenant.
- **Maestro del Gremio** (`GUILD_ADMIN`) — dueño/operador del Gremio (antes `ADMIN`).
- **Organizador del Gremio** (`GUILD_ORGANIZER`) — staff que ayuda a operar (eventos, asistencia).
- **Aventurero** (`MEMBER` / `PLAYER`) — jugador miembro del Gremio.
- **Super Maestro** (`SUPER_ADMIN`) — admin global de EliteCards (rol único a nivel de plataforma).

## Modelo de datos nuevo

### `Guild`
```
id, code (slug único), name, tagline, description,
logo_url, banner_url, accent_color,
owner_user_id (FK users), is_active, is_public,
created_at, updated_at
```

### `GuildMembership` (join table user ↔ guild)
```
id, user_id, guild_id, role (GuildRole),
joined_at, is_active,
UNIQUE(user_id, guild_id)
```

### `GuildRole` enum
- `MEMBER` — jugador regular
- `ORGANIZER` — staff
- `GUILD_ADMIN` — maestro del Gremio
- `JUDGE` (futuro) — juez oficial

### Roles globales (`UserRole` actual)
- `PLAYER` — default
- `SUPER_ADMIN` — plataforma EliteCards
- (eliminamos `ADMIN`/`ORGANIZER` del nivel global — se mueven a `GuildRole`)

## Entidades que ganan `guild_id` (NOT NULL)

```
PlayerProfile      → al unirse a un Gremio se crea SeasonProgress por temporada activa de ese Gremio
                     (NOTA: PlayerProfile se mantiene global — es la identidad del jugador.
                      La membresía a Gremios va por GuildMembership)
Season             → cada Gremio tiene sus propias temporadas T1, T2...
SeasonProgress     → ya tiene player_id + season_id → season tiene guild_id implícito
SeasonHistory      → idem
Event              → guild_id
EventRegistration  → vía event
MatchResult        → vía event
Product            → guild_id
Reservation        → vía product
Mission            → guild_id (cada Gremio crea sus misiones)
PlayerMission      → vía mission
Achievement        → guild_id (cada Gremio crea sus medallas, o pueden venir un set base por defecto)
PlayerAchievement  → vía achievement
Title              → guild_id
PlayerTitle        → vía title
HallOfFameEntry    → vía season
ExpTransaction     → vía season
PrestigeTransaction → vía season
AdminActionLog     → guild_id (audit local del Gremio) + super_admin_action_log para globales
Notification       → puede tener guild_id opcional (algunas son cross-Gremio: invitación a Gremio)
```

## Entidades globales (sin `guild_id`)

- `User` — identidad de usuario
- `PlayerProfile` — identidad del jugador (alias, elite_id, prestigio histórico cross-Gremio? **sí, suma de todos**)
- `Game` — catálogo de TCG soportados por la plataforma

## Permisos por endpoint

```
SUPER_ADMIN only:
  POST   /api/super-admin/guilds              crear Gremio
  PATCH  /api/super-admin/guilds/{id}         editar/desactivar
  GET    /api/super-admin/audit               audit global

GUILD_ADMIN (de un Gremio específico):
  POST   /api/guilds/{guild_id}/events
  POST   /api/guilds/{guild_id}/seasons
  ...    todo /admin/* actual pero scoped por guild

MEMBER:
  GET    /api/guilds/{guild_id}/ranking
  POST   /api/guilds/{guild_id}/events/{id}/register
  ...    visibilidad de datos del Gremio donde es miembro

Cualquiera:
  GET    /api/guilds                          listar Gremios públicos (browse)
  POST   /api/guilds/{guild_id}/join          solicitar unirse
```

## Pasos del refactor (incremental, no big-bang)

### Fase A — Schema y backfill ✅ esta sesión
1. Crear `Guild`, `GuildMembership`, `GuildRole` enum, `SUPER_ADMIN` en `UserRole`.
2. Migración SQL: agrega `guild_id` (nullable inicialmente) a: `Season`, `Event`, `Product`, `Mission`, `Achievement`, `Title`, `AdminActionLog`.
3. Backfill: crear "Gremio Principal" con `id=1`, asignar `guild_id=1` a todo lo existente.
4. Migración 2: vuelve `guild_id` NOT NULL.
5. Crear `GuildMembership` para todos los `PlayerProfile` existentes con role=MEMBER y guild=1.
6. Endpoints CRUD `/api/super-admin/guilds` y `/api/guilds` (browse).

### Fase B — Context y filtrado
1. Header `X-Guild-Id` o subdominio para identificar Gremio actual.
2. Middleware FastAPI: extrae `current_guild` desde el header.
3. Routers existentes empiezan a filtrar por `current_guild` cuando aplique.
4. Frontend: selector de Gremio en navbar, persiste en localStorage, inyecta header en axios.

### Fase C — Permisos
1. Decoradores `require_guild_role(role)` que validan `GuildMembership`.
2. Migrar usuarios actuales `ADMIN` → `SUPER_ADMIN` + `GUILD_ADMIN` del Gremio default.
3. Endpoints `/admin/*` se mueven a `/api/guilds/{id}/admin/*`.

### Fase D — UX
1. Página `/guilds` — directorio público con filtros.
2. Página `/guilds/{slug}` — landing del Gremio con su propio look (logo + accent_color).
3. Página `/guilds/me` — mis Gremios.
4. Flujo "Solicitar unirse a Gremio" + "Admin aprueba/rechaza".
5. Branding por Gremio: logo en el navbar al estar en contexto de Gremio.

### Fase E — Datos cross-Gremio
1. Prestigio histórico del jugador sigue siendo global (suma de todos los Gremios).
2. Elite ID sigue siendo global (identidad única).
3. Hall of Fame puede tener vista global ("Mejores del año en cualquier Gremio") además de por-Gremio.

## Backfill: Gremio Principal

Al correr la migración:
```sql
INSERT INTO guilds (id, code, name, tagline, owner_user_id, is_active, is_public)
VALUES (1, 'principal', 'Gremio Principal',
        'El Gremio fundador de EliteCards', 1, 1, 1);

UPDATE seasons SET guild_id = 1;
UPDATE events SET guild_id = 1;
UPDATE products SET guild_id = 1;
UPDATE missions SET guild_id = 1;
UPDATE achievements SET guild_id = 1;
UPDATE titles SET guild_id = 1;
UPDATE admin_action_log SET guild_id = 1;

INSERT INTO guild_memberships (user_id, guild_id, role, is_active)
SELECT u.id, 1,
       CASE WHEN u.role = 'ADMIN' THEN 'GUILD_ADMIN' ELSE 'MEMBER' END,
       1
FROM users u
JOIN player_profiles p ON p.user_id = u.id;
```

## Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Endpoint actual rompe si no se le pasa guild_id | Default a "Gremio Principal" en fase B mientras se migra UI |
| JWT actuales sin guild context | Agregar `current_guild_id` opcional al JWT en próximo login |
| Frontend sin selector hace queries sin contexto | Inicializar `localStorage.ec_current_guild = 1` para usuarios actuales |
| Prestigio cross-Gremio se desincroniza | Calcular `PlayerProfile.prestige` como suma de `PrestigeTransaction` siempre |
| Misiones globales (campañas EliteCards) vs por-Gremio | Mantener flag `is_global` en `Mission` para campañas de plataforma |

## Naming convention en la UI

- "Gremio" en headings y copy
- "Aventureros" en lugar de "Jugadores" cuando hablamos del contexto del Gremio
- "Maestro del Gremio" en lugar de "Admin del Gremio"
- "Sala del Gremio" (Hall) en lugar de "Dashboard del Gremio"
- Mantenemos "Ruta del Campeón" y "EXP Elite" porque son del producto, no del Gremio
