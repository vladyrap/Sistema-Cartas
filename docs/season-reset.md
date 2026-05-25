# Regla de reinicio de temporada — detalle técnico

## Resumen

Al activar una nueva temporada, **todos los jugadores** reciben un nuevo `SeasonProgress` con su nivel inicial calculado así:

| Rango máximo en T-1 | Nivel inicial en T-actual | Rango inicial |
|---|---|---|
| Maestro o Campeón | **10** | Duelista |
| Cualquier otro | **1** | Iniciado |
| Sin historial (jugador nuevo) | **1** | Iniciado |

Esta lógica vive en `backend/app/services/progression.py::starting_level_for_new_season()`.

## Lo que NO se reinicia

| Entidad | Razón |
|---|---|
| `PlayerProfile.prestige` | Prestigio histórico. Solo aumenta al cerrar temporadas. |
| `PlayerAchievement` | Medallas son para siempre. |
| `PlayerTitle` | Títulos como "Campeón T1" no expiran. |
| `SeasonHistory` | Records de temporadas pasadas. |
| `HallOfFameEntry` | Honoríficos. |
| `PlayerProfile.elite_id_*` | La credencial es única por vida. |

## Lo que SÍ se reinicia (vía nuevo `SeasonProgress`)

| Estado | Comportamiento |
|---|---|
| Nivel | Vuelve a 1 (o 10 si promovido). |
| EXP en nivel | 0. |
| EXP total temporada | 0. |
| Rango actual | Iniciado o Duelista según promoción. |
| Rango máximo en la temporada | Iniciado o Duelista según promoción. |
| Ranking de temporada | Se recalcula. |
| Misiones activas | Las misiones de la temporada anterior expiran. |
| Beneficios desbloqueados | Se recalculan SIEMPRE desde el nivel actual. |

## ¿Por qué el promovido NO obtiene beneficios avanzados?

Aunque comience como Duelista N10, **los beneficios** se evalúan en tiempo real con el nivel actual:

```
unlocked_benefits(level=10) → ["Elite ID activa", "Misiones semanales", "Sorteos de temporada"]
unlocked_benefits(level=25) → todos los anteriores + "Catálogo Elite Pro"
```

El jugador promovido empieza en nivel 10 → solo tiene los 3 primeros hitos.
Para acceder a Catálogo Pro (N25), Final Elite (N30), etc., **tiene que volver a subir** durante la temporada en curso.

Esto es **intencional**: la promoción es un atajo de partida, no una herencia de privilegios.

## Casos borde

### Jugador registrado durante la temporada activa

Cuando un usuario nuevo se registra mientras T3 está ACTIVE:
1. Se crea su `PlayerProfile`.
2. **No** se crea `SeasonProgress` inmediatamente. Se crea **lazy** la primera vez que recibe EXP o consulta su progreso (`get_or_create_progress`).
3. Empieza Iniciado N1 sin importar el historial (no tiene historia previa).

### Jugador con historial pero que no jugó la temporada inmediata anterior

Ejemplo: ganó T1 (Campeón), no jugó T2. T3 se activa.

```python
# En activate_season():
prev_id = season.previous_season_id  # apunta a T2
# ¿player tiene SeasonHistory en T2? No → previous_rank = None
# starting_level_for_new_season(None) = 1
```

Resultado: empieza Iniciado N1. **La regla evalúa SOLO la temporada inmediata anterior**, no el historial completo.

> **Decisión de producto**: esto se discutió y es la regla correcta. Si quisiéramos "Maestro alguna vez → promovido para siempre", se cambia 1 línea en `season.activate_season()` para buscar el max de todos los `SeasonHistory` del jugador.

### Activación duplicada

`activate_season()` valida que no haya otra temporada ACTIVE y que la propia esté en DRAFT. La creación de `SeasonProgress` está sujeta a un `UniqueConstraint(season_id, player_id)`, así que un segundo intento levanta `IntegrityError` y hace rollback.

### Cierre de temporada vacía

Si nadie jugó (ningún `SeasonProgress`), el cierre genera 0 `SeasonHistory` y 0 prestigio. La temporada queda CLOSED igualmente.

## Vista previa (preview_reset)

Antes de activar, el admin puede ver qué pasaría:

```python
preview = preview_reset(db, target_season_id=t3.id)
# [
#   {player_id: 5, alias: "AceVortex", previous_max_rank: "MAESTRO",
#    starting_level: 10, starting_rank: "DUELISTA", was_promoted_start: True},
#   {player_id: 8, alias: "ShadowKaiser", previous_max_rank: "RETADOR",
#    starting_level: 1, starting_rank: "INICIADO", was_promoted_start: False},
#   ...
# ]
```

Esto alimenta el panel admin **"Jugadores que comenzarán como Duelista"** pedido explícitamente en el brief.

## Test cases sugeridos (Fase 1)

1. `test_starting_level_for_promoted_master` — `RankName.MAESTRO` → 10.
2. `test_starting_level_for_promoted_champion` — `RankName.CAMPEON` → 10.
3. `test_starting_level_for_elite` — `RankName.ELITE` → 1.
4. `test_starting_level_for_none` — `None` → 1.
5. `test_activate_season_creates_progress_for_all_players` — N players → N SeasonProgress.
6. `test_activate_season_rejects_if_other_active` — error claro.
7. `test_activate_season_idempotency` — segundo intento falla limpio.
8. `test_close_season_creates_history_and_prestige`.
9. `test_promoted_player_does_not_have_elite_pro_access` — N10 → `has_elite_pro_access() == False`.
10. `test_preview_reset_matches_activate_outcome` — preview y activate dan los mismos `starting_level` por jugador.
