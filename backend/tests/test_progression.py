"""Tests de funciones puras de progresión — sin DB."""
import pytest

from app.models.base import RankName
from app.services.progression import (
    MAX_LEVEL,
    PROMOTED_STARTING_LEVEL,
    apply_exp_delta,
    cumulative_exp_to_reach,
    exp_required_for_level,
    has_elite_access,
    has_elite_pro_access,
    level_from_total_exp,
    progress_to_next_level,
    rank_from_level,
    starting_level_for_new_season,
    unlocked_benefits,
)


# ============================== Rank mapping ==============================


@pytest.mark.parametrize("level,expected", [
    (1, RankName.INICIADO),   (15, RankName.INICIADO),
    (16, RankName.APRENDIZ),  (30, RankName.APRENDIZ),
    (31, RankName.DUELISTA),  (45, RankName.DUELISTA),
    (46, RankName.RETADOR),   (60, RankName.RETADOR),
    (61, RankName.ELITE),     (75, RankName.ELITE),
    (76, RankName.MAESTRO),   (90, RankName.MAESTRO),
    (91, RankName.CAMPEON),   (100, RankName.CAMPEON),
])
def test_rank_from_level(level, expected):
    assert rank_from_level(level) == expected


def test_rank_from_level_out_of_range():
    with pytest.raises(ValueError):
        rank_from_level(0)
    with pytest.raises(ValueError):
        rank_from_level(MAX_LEVEL + 1)


# ============================== EXP curve ==============================


def test_exp_required_for_level_1_is_zero():
    assert exp_required_for_level(1) == 0


def test_exp_required_grows_with_level():
    e2 = exp_required_for_level(2)
    e10 = exp_required_for_level(10)
    e50 = exp_required_for_level(50)
    e100 = exp_required_for_level(100)
    assert e2 < e10 < e50 < e100


def test_exp_required_for_level_2_is_100():
    assert exp_required_for_level(2) == 100


def test_cumulative_exp_to_reach_max():
    """Llegar al cap es aspiracional pero no absurdo."""
    total = cumulative_exp_to_reach(MAX_LEVEL)
    # Curva 1.06x → total ~530k EXP para L100
    assert 400_000 < total < 700_000


def test_cumulative_to_1_is_zero():
    assert cumulative_exp_to_reach(1) == 0


# ============================== Level from EXP ==============================


def test_level_from_total_exp_zero():
    level, in_lv = level_from_total_exp(0)
    assert level == 1 and in_lv == 0


def test_level_from_total_exp_first_jump():
    # Exactamente 100 → nivel 2 con 0 dentro
    level, in_lv = level_from_total_exp(100)
    assert level == 2 and in_lv == 0


def test_level_from_total_exp_partial():
    level, in_lv = level_from_total_exp(150)
    assert level == 2 and in_lv == 50


def test_level_from_total_exp_caps_at_max():
    level, in_lv = level_from_total_exp(10_000_000)
    assert level == MAX_LEVEL
    assert in_lv == 0


# ============================== apply_exp_delta ==============================


def test_apply_exp_delta_positive_no_levelup():
    new_level, new_in, gained = apply_exp_delta(1, 0, 50)
    assert new_level == 1
    assert new_in == 50
    assert gained == 0


def test_apply_exp_delta_single_levelup():
    new_level, new_in, gained = apply_exp_delta(1, 0, 100)
    assert new_level == 2
    assert new_in == 0
    assert gained == 1


def test_apply_exp_delta_multi_levelup():
    new_level, new_in, gained = apply_exp_delta(1, 0, 1000)
    # Con curva 1.06x, 1000 EXP desde L1 saltea unos 8-9 niveles
    assert new_level >= 7
    assert gained >= 6


def test_apply_exp_delta_negative_caps_at_zero():
    new_level, new_in, gained = apply_exp_delta(5, 30, -200)
    # No baja de nivel; EXP en nivel se capa a 0
    assert new_level == 5
    assert new_in == 0
    assert gained == 0


def test_apply_exp_delta_max_level_caps():
    new_level, new_in, _ = apply_exp_delta(MAX_LEVEL, 0, 500_000)
    assert new_level == MAX_LEVEL
    assert new_in == 0


# ============================== progress_to_next ==============================


def test_progress_to_next_normal():
    info = progress_to_next_level(16, 50)
    assert info["current_level"] == 16
    assert info["current_rank"] == RankName.APRENDIZ
    assert info["next_level"] == 17
    assert info["percent_to_next"] > 0


def test_progress_to_next_max_level():
    info = progress_to_next_level(MAX_LEVEL, 0)
    assert info["next_level"] is None
    assert info["percent_to_next"] == 100.0


# ============================== Benefits ==============================


def test_unlocked_benefits_at_level_1():
    benefits = unlocked_benefits(1)
    unlocked = [b for b in benefits if b["unlocked"]]
    assert len(unlocked) == 1  # solo Elite ID
    assert unlocked[0]["level"] == 1


def test_unlocked_benefits_at_level_75():
    """Nivel 75 desbloquea 7 hitos: 1, 10, 20, 30, 45, 60, 75."""
    benefits = unlocked_benefits(75)
    unlocked = [b for b in benefits if b["unlocked"]]
    locked = [b for b in benefits if not b["unlocked"]]
    assert len(unlocked) == 7
    # Quedan: 90 y 100
    assert {b["level"] for b in locked} == {90, 100}


def test_unlocked_benefits_at_max():
    benefits = unlocked_benefits(MAX_LEVEL)
    unlocked = [b for b in benefits if b["unlocked"]]
    # 9 hitos en total
    assert len(unlocked) == 9
    assert all(b["unlocked"] for b in benefits)


def test_elite_access_thresholds():
    assert not has_elite_access(59)
    assert has_elite_access(60)
    assert has_elite_access(100)


def test_elite_pro_requires_75():
    assert not has_elite_pro_access(74)
    assert has_elite_pro_access(75)
    assert has_elite_pro_access(100)


# ============================== Regla de reinicio Maestro→Duelista ==============================


@pytest.mark.parametrize("prev_rank,expected_level", [
    (None, 1),
    (RankName.INICIADO, 1),
    (RankName.APRENDIZ, 1),
    (RankName.DUELISTA, 1),
    (RankName.RETADOR, 1),
    (RankName.ELITE, 1),
    (RankName.MAESTRO, PROMOTED_STARTING_LEVEL),
    (RankName.CAMPEON, PROMOTED_STARTING_LEVEL),
])
def test_starting_level_rule(prev_rank, expected_level):
    """Solo Maestro y Campeón en T-1 → comienzan en DUELISTA (nivel 31)."""
    assert starting_level_for_new_season(prev_rank) == expected_level


def test_promoted_does_not_unlock_pro_benefits():
    """El jugador promovido empieza en N31 → NO tiene acceso a Catálogo Pro (N75)."""
    start = starting_level_for_new_season(RankName.MAESTRO)
    assert start == 31
    assert not has_elite_pro_access(start)
    assert rank_from_level(start) == RankName.DUELISTA
    benefits = unlocked_benefits(start)
    unlocked = [b for b in benefits if b["unlocked"]]
    # Niveles ≤ 31: 1, 10, 20, 30 → 4 hitos
    assert len(unlocked) == 4
    # Catálogo Pro (75) y Final Elite (90) deben estar BLOQUEADOS
    locked_levels = [b["level"] for b in benefits if not b["unlocked"]]
    assert 75 in locked_levels and 90 in locked_levels
