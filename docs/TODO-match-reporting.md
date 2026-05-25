# TODO: Match reporting in-app

Funcionalidad postergada de la Ola 3 del batch grande de features. Es la más
compleja de las que se discutieron porque requiere máquina de estados y manejo
de disputas.

## Diseño propuesto

### Modelo

```python
class MatchPairing:
    id: int
    event_id: int (FK Event)
    round_number: int
    player1_id: int (FK PlayerProfile)
    player2_id: int (FK PlayerProfile, nullable para BYE)
    player1_deck_id: int | None  # FK PlayerDeck (opcional)
    player2_deck_id: int | None
    status: PENDING | REPORTED_P1 | REPORTED_P2 | CONFIRMED | DISPUTED | RESOLVED
    reported_p1_result: 'win' | 'loss' | 'draw' | None
    reported_p2_result: 'win' | 'loss' | 'draw' | None
    confirmed_result: 'p1' | 'p2' | 'draw' | None  # quién ganó
    resolved_by_admin_id: int | None
    notes: str | None
```

### Endpoints

- `POST /api/events/{event_id}/pair-round` (admin) — genera los pareos para la
  ronda N a partir de los inscritos (algoritmo Swiss simple o random).
- `POST /api/matches/{id}/report` (jugador, body: result) — reporta su resultado.
  Si el otro ya reportó lo mismo → CONFIRMED automático.
  Si el otro ya reportó algo distinto → DISPUTED.
- `POST /api/matches/{id}/resolve` (admin, body: confirmed_result) — resuelve disputa.
- `GET /api/events/{id}/matches` — lista todos los pareos del evento.

### Auto-EXP

Al confirmar un match: el ganador recibe `match_won` (+50 EXP, ya existe como
`round_won`). El perdedor no recibe nada negativo. En DISPUTED no se otorga
hasta resolver.

### UI

- Página `/events/{id}/play` para jugadores activos en el torneo:
  · Muestra su pareo actual con foto + alias del oponente.
  · Botones "Gané / Perdí / Empate".
  · Si ya reportó, muestra "Esperando confirmación del oponente".
  · Si está en DISPUTED, muestra "Reportado conflicto, espera al admin".
- Panel admin `/admin/events/{id}/matches`: tabla con pareos, filtros por
  status, botón "Resolver disputa".

### Por qué se postergó

- Algoritmo Swiss real es bastante código (rondas, byes, tiebreakers).
- La UX de doble-confirmación tiene varios estados que necesitan testing
  manual cuidadoso.
- Como MVP, el admin marca resultados a mano vía `/admin/events/{id}/results`
  (ya existe). Migrar a self-report es mejora de UX, no bloqueante.

## Estado actual

El sistema ya soporta:
- `EventRegistration.rounds_won` int (admin lo edita a mano)
- `EventRegistration.final_position` int (admin marca top 1/2/3/etc.)
- `/admin/events/{id}/results` recibe la lista completa y `award_event_exp`
  distribuye EXP correctamente.

Cuando se vaya a implementar, este doc es el punto de partida.
