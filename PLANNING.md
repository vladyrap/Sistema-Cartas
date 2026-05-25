# EliteCards — Planning

## Visión

EliteCards es una plataforma web tipo **TCG + RPG + esports**. Una tienda de cartas que se diferencia por su capa digital: cada jugador tiene credencial, ranking, temporadas, niveles, misiones, prestigio histórico y beneficios reales que se ganan jugando.

El sistema central se llama **Ruta del Campeón**. Es la "campaña" RPG de cada temporada: el jugador parte en un nivel base, gana **EXP Elite** participando en torneos/desafíos, sube de nivel, desbloquea beneficios y al final de la temporada conserva su **Prestigio** y se reinicia para una nueva campaña.

## Arquitectura general

```
┌─────────────────────────┐         HTTPS         ┌──────────────────────────┐
│  Frontend (Vite/React)  │ ────────────────────► │  Backend (FastAPI)       │
│  - Landing              │ ◄──────────────────── │  - REST API              │
│  - Dashboard jugador    │      JSON / JWT       │  - Servicios de negocio  │
│  - Ruta del Campeón     │                       │  - Auth (JWT)            │
│  - Ranking              │                       │                          │
│  - Eventos              │                       └──────┬───────────────────┘
│  - Catálogo             │                              │
│  - Admin                │                              │ SQLAlchemy 2.x
└─────────────────────────┘                              ▼
                                                  ┌──────────────────┐
                                                  │  PostgreSQL 15+  │
                                                  └──────────────────┘
                                                  ┌──────────────────┐
                                                  │  Redis (cache,   │
                                                  │  ranking, locks) │
                                                  └──────────────────┘
```

## Capas del backend

```
backend/app/
├── core/
│   ├── config.py         # Settings (Pydantic) — env vars
│   ├── db.py             # SQLAlchemy engine + Session
│   ├── security.py       # JWT + password hashing
│   └── deps.py           # Dependencies (get_db, get_current_user)
│
├── models/               # ORM (SQLAlchemy declarative)
│   ├── base.py           # Base + mixins (timestamps)
│   ├── user.py
│   ├── player.py
│   ├── game.py
│   ├── season.py
│   ├── season_progress.py
│   ├── season_history.py
│   ├── event.py
│   ├── event_registration.py
│   ├── match_result.py
│   ├── exp_transaction.py
│   ├── prestige_transaction.py
│   ├── achievement.py
│   ├── title.py
│   ├── mission.py
│   ├── product.py
│   ├── reservation.py
│   ├── hall_of_fame.py
│   └── admin_action_log.py
│
├── schemas/              # Pydantic v2 (request/response DTOs)
│   └── ...
│
├── services/             # Lógica de negocio (sin HTTP)
│   ├── progression.py    # calcular nivel, rango, EXP al siguiente
│   ├── exp.py            # award_exp / deduct_exp / transactional
│   ├── season.py         # close_season / create_season / apply_reset
│   ├── prestige.py       # convertir performance en prestigio
│   ├── benefits.py       # unlock_benefits_by_level / validate_access
│   ├── ranking.py        # generate_ranking_general / por_juego / historico
│   ├── reservation.py    # validar nivel/access para reservar
│   ├── hall_of_fame.py   # entries por temporada
│   └── elite_id.py       # generación del número de jugador
│
├── routers/              # Endpoints REST
│   ├── auth.py
│   ├── players.py
│   ├── seasons.py
│   ├── events.py
│   ├── rankings.py
│   ├── catalog.py
│   ├── reservations.py
│   ├── missions.py
│   ├── achievements.py
│   ├── hall_of_fame.py
│   └── admin.py
│
└── main.py               # FastAPI app + middlewares + CORS + routers
```

**Regla clave**: los **services** son puro Python sin dependencias HTTP — testeables aisladamente. Los **routers** llaman a services y solo manejan parsing/respuesta/auth.

## Capas del frontend

```
frontend/src/
├── App.jsx               # Router top-level
├── main.jsx
│
├── pages/
│   ├── Landing.jsx
│   ├── Login.jsx
│   ├── Register.jsx
│   ├── Dashboard.jsx
│   ├── Profile.jsx
│   ├── RutaDelCampeon.jsx
│   ├── Ranking.jsx
│   ├── Events.jsx
│   ├── EventDetail.jsx
│   ├── Catalog.jsx
│   ├── MyReservations.jsx
│   ├── Missions.jsx
│   ├── HallOfFame.jsx
│   └── admin/
│       ├── Dashboard.jsx
│       ├── Users.jsx
│       ├── Events.jsx
│       ├── Seasons.jsx        # crear/cerrar temporada, ver duelistas-por-mérito
│       ├── Catalog.jsx
│       └── Reservations.jsx
│
├── components/
│   ├── ui/                    # primitivos (Button, Card, Badge, Modal…)
│   ├── EliteIdCard.jsx        # tarjeta credencial estilo TCG
│   ├── PlayerCard.jsx
│   ├── RankBadge.jsx          # badge de rango (Iniciado…Campeón)
│   ├── ClassBadge.jsx         # badge de clase RPG
│   ├── ExpBar.jsx             # barra con EXP y % al siguiente nivel
│   ├── LevelTimeline.jsx      # camino visual Ruta del Campeón
│   ├── EventCard.jsx
│   ├── ProductCard.jsx
│   ├── RankingTable.jsx
│   ├── MedalGrid.jsx
│   ├── ReservationModal.jsx
│   ├── MatchResultModal.jsx   # admin
│   └── SeasonResetPreview.jsx # admin: lista de jugadores Maestro→Duelista antes de aplicar
│
└── lib/
    ├── api.js                 # axios client con interceptor JWT
    ├── auth.js                # token storage + currentUser
    ├── progression.js         # helpers cliente: rango desde nivel, color por rango
    └── format.js              # fechas, números, plurales
```

## Estados y caché

- **JWT** en localStorage (refresh via endpoint).
- **Ranking** se cachea en Redis con TTL corto (60s) y se invalida cuando un admin sube resultados o se cierra temporada.
- **Misiones activas** se calculan al vuelo desde `PlayerMission` (no cache).
- **Beneficios desbloqueados** se derivan del nivel actual cada vez que se consultan — son función pura del nivel, no estado.

## Flujo de "cerrar temporada" (resumen)

```
admin → POST /admin/seasons/{id}/close
   ├─ Service: season.close_season(season_id)
   │   ├─ Para cada SeasonProgress de la temporada:
   │   │   ├─ Calcular rango_max alcanzado
   │   │   ├─ Convertir performance → Prestigio (servicio prestige)
   │   │   ├─ Crear PrestigeTransaction
   │   │   ├─ Crear SeasonHistory entry (nivel_final, rango_max, exp_final, top, etc.)
   │   │   └─ Resolver títulos/medallas que cierren ("Campeón Temporada N")
   │   ├─ Generar HallOfFameEntry por categoría (campeón, top 8, mejor novato…)
   │   └─ Marcar Season.status = CLOSED
   └─ Notificar (in-app + cache invalidate)
```

## Flujo de "crear nueva temporada"

```
admin → POST /admin/seasons   { name, starts_at, ends_at, ... }
   ├─ Validar que no haya otra ACTIVE
   ├─ Service: season.create_season(...)
   │   └─ Insertar Season status=DRAFT
   └─ admin → POST /admin/seasons/{id}/activate
       ├─ Service: season.activate_season(season_id)
       │   ├─ Para cada Player con SeasonHistory en temporada inmediata anterior:
       │   │   ├─ rank_max = history.max_rank
       │   │   ├─ if rank_max in (MAESTRO, CAMPEON):
       │   │   │     starting_level = 10  # Duelista
       │   │   │     was_promoted_start = True
       │   │   │  else:
       │   │   │     starting_level = 1   # Iniciado
       │   │   ├─ Crear SeasonProgress(season_id, player_id, level=starting_level,
       │   │   │                        starting_level=starting_level,
       │   │   │                        was_promoted_start=was_promoted_start,
       │   │   │                        exp=0, max_rank=rank_from_level(starting_level))
       │   ├─ Para Players sin history previa (nuevos): SeasonProgress level=1
       │   └─ Marcar Season.status = ACTIVE, previous Season referenced
       └─ Notificar
```

## Sistema de niveles y EXP

EXP requerida por nivel — fórmula incremental simple, **no acumulada**, para que cada nivel se sienta como un escalón concreto:

```
exp_required_for_level(n) = round(100 * (1.15 ** (n - 1)))
```

| Nivel | EXP para subir |
|---|---|
| 1 → 2 | 100 |
| 5 → 6 | 175 |
| 10 → 11 | 351 |
| 15 → 16 | 706 |
| 20 → 21 | 1421 |
| 25 → 26 | 2858 |
| 29 → 30 | 4999 |

EXP total para alcanzar nivel 30 desde 1 ≈ **27.000** EXP.

Esto da temporadas de ~3 meses donde un jugador competitivo necesita unos 6-8 torneos top-4 + misiones para llegar a Campeón.

## Reglas críticas a respetar

1. **EXP, nivel y ranking de temporada SE REINICIAN** cada temporada.
2. **Prestigio, medallas, títulos, Hall of Fame, Elite ID, historial NO se reinician.**
3. **Beneficios** son función del nivel **actual** de la temporada activa — nunca se "heredan" entre temporadas.
4. Un jugador que parte como **Duelista (nivel 10) por mérito** NO obtiene automáticamente catálogo Pro/Elite Access. Tiene que volver a subir.
5. **Distribución de stock limitado** se valida en el servicio de reservation:
   - 40% stock para usuarios con Elite Access o Elite Pro
   - 40% para comunidad general
   - 20% reservado para premios/eventos
6. **EXP negativa** (no asistir, antideportiva) puede dejar al jugador con EXP < 0 dentro del nivel, pero **nunca baja de nivel**. El nivel solo sube.
7. **Anti-abuso**: las transacciones EXP/Prestigio van a tabla auditada (`ExpTransaction`, `PrestigeTransaction`) con `reason`, `admin_id`, `event_id` opcional. El admin puede revertir.

## Seguridad

- Hash de passwords con bcrypt (12 rounds).
- JWT con expiración corta (15 min) + refresh token (7 días).
- Roles: `PLAYER`, `ORGANIZER`, `ADMIN`. Decorador `@require_role()` en routers admin.
- Rate limiting básico vía nginx/FastAPI middleware (no en MVP, sí en fase 2).
- Logs de acciones admin en `AdminActionLog` (quién, qué, cuándo, payload).

## Pendientes documentados aparte

- [`ROADMAP.md`](ROADMAP.md): fases del MVP + post-MVP.
- [`DESIGN.md`](DESIGN.md): paleta, tipografía, sistema de componentes.
- [`docs/season-reset.md`](docs/season-reset.md): casos borde de la regla de reinicio.
