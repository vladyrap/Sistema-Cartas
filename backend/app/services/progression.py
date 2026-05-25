"""Niveles, rangos y EXP — funciones puras sin DB.

Todas las funciones son determinísticas y aisladas: ideales para test unitario.
"""
from __future__ import annotations

from app.models.base import RankName

# ============================== Constantes ==============================

MIN_LEVEL = 1
MAX_LEVEL = 100

# Crecimiento de la curva de EXP. Con 1.15x un L100 cuesta ~14M de EXP por
# nivel — irreal. Con 1.06x el total acumulado a L100 es ~600k EXP, alcanzable
# para un jugador muy activo durante varias temporadas.
EXP_GROWTH = 1.06
EXP_BASE = 100

# Mapa nivel → rango. 7 rangos distribuidos a través de 100 niveles.
# CAMPEON queda como tier final exclusivo (10 niveles top).
RANK_BANDS: list[tuple[int, int, RankName]] = [
    (1,  15,  RankName.INICIADO),
    (16, 30,  RankName.APRENDIZ),
    (31, 45,  RankName.DUELISTA),
    (46, 60,  RankName.RETADOR),
    (61, 75,  RankName.ELITE),
    (76, 90,  RankName.MAESTRO),
    (91, 100, RankName.CAMPEON),
]

# Beneficios desbloqueados al alcanzar un nivel (acumulativos hacia arriba).
# Re-escalados al cap de 100 con hitos intermedios para mantener engagement.
BENEFITS_BY_LEVEL: dict[int, str] = {
    1:   "Elite ID activa",
    10:  "Torneos casuales y eventos básicos",
    20:  "Misiones semanales",
    30:  "Sorteos de temporada",
    45:  "Preventa Nivel 1 (Elite Access básico)",
    60:  "Elite Access completo",
    75:  "Catálogo Elite Pro",
    90:  "Final Elite y prioridad máxima",
    100: "Leyenda del Gremio",
}


# ============================== EXP curve ==============================


def exp_required_for_level(target_level: int) -> int:
    """EXP que necesitas para PASAR DEL nivel (target-1) AL nivel target.

    Curva: base 100, crecimiento EXP_GROWTH (6%) por nivel.
      Nivel 1 → 2:  100
      Nivel 10:     ~155
      Nivel 50:     ~1700
      Nivel 100:    ~28k
    """
    if target_level <= MIN_LEVEL:
        return 0
    if target_level > MAX_LEVEL:
        raise ValueError(f"Nivel objetivo {target_level} excede máximo {MAX_LEVEL}")
    return round(EXP_BASE * (EXP_GROWTH ** (target_level - 2)))


def cumulative_exp_to_reach(level: int) -> int:
    """EXP total acumulada para llegar al nivel dado desde nivel 1.

    cumulative_exp_to_reach(1)   == 0
    cumulative_exp_to_reach(30)  ≈ 8500
    cumulative_exp_to_reach(100) ≈ 470k
    """
    if level <= MIN_LEVEL:
        return 0
    return sum(exp_required_for_level(lv) for lv in range(2, level + 1))


# ============================== Rank lookup ==============================


def rank_from_level(level: int) -> RankName:
    """Mapa estricto nivel → rango. Levanta ValueError si está fuera de rango."""
    for lo, hi, rank in RANK_BANDS:
        if lo <= level <= hi:
            return rank
    raise ValueError(f"Nivel {level} fuera de rangos válidos (1..{MAX_LEVEL})")


def level_from_total_exp(total_exp: int) -> tuple[int, int]:
    """Dado total_exp acumulada, devuelve (level, exp_in_current_level).

    Calcula recorriendo los thresholds. O(MAX_LEVEL) — trivial.
    """
    if total_exp < 0:
        total_exp = 0
    remaining = total_exp
    level = MIN_LEVEL
    for next_level in range(MIN_LEVEL + 1, MAX_LEVEL + 1):
        needed = exp_required_for_level(next_level)
        if remaining < needed:
            return level, remaining
        remaining -= needed
        level = next_level
    # Llegamos a MAX_LEVEL con EXP de sobra; capamos a 0 dentro del nivel 30.
    return MAX_LEVEL, 0


# ============================== Progress helpers ==============================


def progress_to_next_level(level: int, exp_in_level: int) -> dict:
    """Información de progreso al siguiente nivel.

    Retorna:
      {
        "current_level": int,
        "current_rank": RankName,
        "next_level": int | None,           # None si ya está en MAX
        "next_rank": RankName | None,
        "exp_in_level": int,
        "exp_required_for_next": int | None,
        "exp_remaining_for_next": int | None,
        "percent_to_next": float,           # 0.0 - 100.0  o 100.0 si max
      }
    """
    current_rank = rank_from_level(level)
    if level >= MAX_LEVEL:
        return {
            "current_level": level,
            "current_rank": current_rank,
            "next_level": None,
            "next_rank": None,
            "exp_in_level": exp_in_level,
            "exp_required_for_next": None,
            "exp_remaining_for_next": None,
            "percent_to_next": 100.0,
        }
    needed = exp_required_for_level(level + 1)
    remaining = max(0, needed - exp_in_level)
    pct = min(100.0, (exp_in_level / needed) * 100.0) if needed else 100.0
    return {
        "current_level": level,
        "current_rank": current_rank,
        "next_level": level + 1,
        "next_rank": rank_from_level(level + 1),
        "exp_in_level": exp_in_level,
        "exp_required_for_next": needed,
        "exp_remaining_for_next": remaining,
        "percent_to_next": round(pct, 1),
    }


# ============================== Beneficios ==============================


def unlocked_benefits(level: int) -> list[dict]:
    """Lista de beneficios actualmente desbloqueados.

    Retorna [{level: int, label: str, unlocked: bool}] para todos los hitos.
    """
    out = []
    for milestone, label in sorted(BENEFITS_BY_LEVEL.items()):
        out.append(
            {
                "level": milestone,
                "label": label,
                "unlocked": level >= milestone,
            }
        )
    return out


def has_elite_access(level: int) -> bool:
    """Elite Access se considera completo desde nivel 60 (con preventa básica desde 45)."""
    return level >= 60


def has_elite_pro_access(level: int) -> bool:
    """Catálogo Elite Pro requiere nivel 75+."""
    return level >= 75


# ============================== EXP application ==============================


def apply_exp_delta(
    current_level: int, exp_in_level: int, delta: int
) -> tuple[int, int, int]:
    """Aplica un delta de EXP (positivo o negativo) al estado del jugador.

    Reglas:
      - EXP nunca baja al jugador de nivel. Si el delta es negativo y excedería
        el inicio del nivel, exp_in_level se ajusta al mínimo (0) en ese nivel.
        El nivel NUNCA baja durante una temporada (la única forma de bajar
        es por reinicio de temporada).
      - Si EXP en nivel >= required_for_next, sube de nivel (puede subir varios).
      - En MAX_LEVEL la EXP en exceso simplemente se descarta.

    Retorna (new_level, new_exp_in_level, levels_gained).
    """
    level = current_level
    exp_in = exp_in_level + delta
    levels_gained = 0

    # Pérdida que excede el nivel actual: capamos a 0 sin bajar de nivel.
    if exp_in < 0:
        exp_in = 0

    # Subidas en cascada mientras alcance los thresholds.
    while level < MAX_LEVEL:
        needed = exp_required_for_level(level + 1)
        if exp_in < needed:
            break
        exp_in -= needed
        level += 1
        levels_gained += 1

    if level >= MAX_LEVEL:
        exp_in = 0  # cap en MAX

    return level, exp_in, levels_gained


# ============================== Inicio de temporada ==============================

PROMOTED_STARTING_LEVEL = 31  # Inicio de DUELISTA en el cap de 100


def starting_level_for_new_season(previous_max_rank: RankName | None) -> int:
    """Nivel inicial al comenzar una nueva temporada según el rango previo.

    Regla:
      - Maestro o Campeón en T-1 → comienza en nivel 31 (Duelista).
      - Cualquier otro caso (incluyendo jugadores nuevos sin historia) → nivel 1.

    Importante: la promoción de inicio NO desbloquea beneficios avanzados.
    Los beneficios se evalúan siempre con el nivel actual de la temporada en
    curso, así que el jugador promovido empieza con beneficios de nivel 31
    pero no con Catálogo Pro (nivel 75) ni Final Elite (nivel 90).
    """
    if previous_max_rank is not None and RankName.is_top_tier(previous_max_rank):
        return PROMOTED_STARTING_LEVEL
    return MIN_LEVEL
