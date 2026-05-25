# EliteCards — Roadmap

Plan por fases. Cada fase es un entregable funcional y desplegable.

## Fase 0 — Planning ✅ (esta entrega)

- README, PLANNING, DESIGN, ROADMAP
- Estructura de carpetas backend/frontend
- Modelos SQLAlchemy completos
- Servicios de lógica de negocio (temporadas, EXP, ranking, prestigio)
- Seed con 20 jugadores + 2 temporadas cerradas + 1 activa
- Stubs de routers + páginas

## Fase 1 — MVP backend

Objetivo: API funcional con autenticación, temporadas, jugadores y EXP.

1. Configuración: `core/config.py`, `db.py`, `security.py`, migraciones Alembic iniciales.
2. Auth: registro, login, refresh, currentUser.
3. CRUD Players + perfil + Elite ID generation.
4. Endpoints Seasons (admin: crear/cerrar/activar; público: temporada activa, histórica).
5. Endpoints EXP (admin: asignar; público: mis transacciones).
6. Endpoints Ranking (general, por juego).
7. Endpoint "aplicar reset de temporada" con preview (dry-run).
8. Logging admin + Pydantic v2 schemas completos.
9. Tests unitarios de `services/progression.py`, `services/season.py`, `services/prestige.py`.

**Criterio de done**: seed corre, login funciona, admin puede cerrar T1 + crear T2 + verificar que los Maestros/Campeones quedan en Duelista N10, ranking de la temporada activa se ve.

## Fase 2 — MVP frontend público

Objetivo: jugador puede ver su Ruta del Campeón.

1. Vite + Tailwind + Framer Motion + axios setup.
2. Landing premium (hero, Ruta, beneficios, próximos eventos, CTA).
3. Login / Register.
4. Dashboard del jugador (Elite ID, nivel, EXP bar, próximos eventos, misiones).
5. Página Perfil + historial de temporadas.
6. Página Ruta del Campeón (timeline nivel 1→30 con beneficios bloqueados/desbloqueados).
7. Ranking público.
8. Calendario de eventos + detalle + inscripción.

**Criterio de done**: jugador puede registrarse, ver su credencial, ver Ruta, inscribirse a un evento.

## Fase 3 — Admin

Objetivo: la tienda puede operar sin tocar la base de datos.

1. Panel admin: usuarios, juegos, eventos, resultados.
2. Inscritos, asistencia, asignar EXP por evento (cálculo automático según posición).
3. **Pantalla "Cerrar temporada"** con resumen y confirmación.
4. **Pantalla "Crear y activar nueva temporada"** con preview de quiénes parten como Duelista (panel admin pedido explícitamente en el brief).
5. CRUD de catálogo (Normal/Pro/Preventa).
6. Gestión de reservas: aprobar/rechazar/pagada/expirada.
7. Crear misiones + asignar medallas + gestionar Hall of Fame.
8. AdminActionLog visible.

**Criterio de done**: el dueño de la tienda puede cerrar la temporada actual y abrir una nueva sin SQL.

## Fase 4 — Gamificación completa

1. Misiones semanales/temporada + tracking.
2. Medallas y títulos (entrega automática + manual).
3. Hall of Fame UI.
4. Prestigio histórico visible en perfil.
5. Notificaciones in-app (subiste de nivel, desbloqueaste beneficio, expira reserva).
6. Animaciones de subida de nivel.

## Fase 5 — Catálogo y reservas

1. Vista de catálogo público (Normal + filtro por juego).
2. Catálogo Pro (requiere validación de nivel).
3. Preventas con cupos por categoría (40/40/20).
4. Modal de reserva + validación nivel/acceso.
5. Vista "Mis reservas".

## Fase 6 — Post-MVP (NO bloqueante)

- Pagos automáticos (Webpay/MercadoPago).
- Constructor de mazos.
- Estadísticas avanzadas (winrate por juego, racha, etc.).
- Marketplace de singles.
- Chat interno / matchmaking.
- App móvil nativa.
- Integraciones externas (Discord, etc.).

## Convenciones

- Todo merge a `main` requiere que `pytest backend/` pase.
- Cada feature de admin agrega un test del happy path en `backend/tests/`.
- Versionado semántico para releases (v0.1.0 al cerrar fase 1, etc.).
- Issues / TODOs marcados con `# TODO(fase-N):` en el código.
