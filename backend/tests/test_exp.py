"""Tests del servicio EXP — asignación y subida de nivel."""
import pytest

from app.models import RankName, SeasonProgress, SeasonStatus
from app.services import exp as exp_svc


def test_award_exp_no_active_season_fails(db, make_player):
    p = make_player("alice")
    with pytest.raises(RuntimeError, match="temporada activa"):
        exp_svc.award_exp(db, p.id, "event_participation")


def test_award_exp_creates_progress_lazy(db, make_player, make_season):
    p = make_player("alice")
    make_season(status=SeasonStatus.ACTIVE)

    tx = exp_svc.award_exp(db, p.id, "event_participation")
    db.commit()

    assert tx.amount == 100
    sp = db.query(SeasonProgress).filter_by(player_id=p.id).one()
    assert sp.exp_total == 100
    # 100 EXP es exactamente lo que cuesta subir de nivel 1→2
    assert sp.level == 2
    assert sp.exp_in_level == 0


def test_award_exp_levels_up(db, make_player, make_season):
    p = make_player("alice")
    make_season(status=SeasonStatus.ACTIVE)

    # 100 EXP = exacto para nivel 2
    exp_svc.award_exp(db, p.id, "admin_adjust", amount=100, reason="Test")
    db.commit()
    sp = db.query(SeasonProgress).filter_by(player_id=p.id).one()
    assert sp.level == 2


def test_award_exp_max_rank_only_increases(db, make_player, make_season):
    p = make_player("alice")
    make_season(status=SeasonStatus.ACTIVE)

    # Suficiente EXP para llegar a Duelista (nivel 10)
    exp_svc.award_exp(db, p.id, "admin_adjust", amount=2000, reason="boost")
    db.commit()
    sp = db.query(SeasonProgress).filter_by(player_id=p.id).one()
    assert sp.level >= 5
    rank_before = sp.max_rank

    # EXP negativa no debe bajar el max_rank
    exp_svc.award_exp(db, p.id, "admin_adjust", amount=-1000, reason="penal")
    db.commit()
    sp = db.query(SeasonProgress).filter_by(player_id=p.id).one()
    assert sp.max_rank == rank_before


def test_negative_exp_does_not_drop_level(db, make_player, make_season):
    """EXP negativa nunca baja al jugador de nivel (regla crítica)."""
    p = make_player("alice")
    make_season(status=SeasonStatus.ACTIVE)
    exp_svc.award_exp(db, p.id, "admin_adjust", amount=500, reason="boost")
    db.commit()
    sp = db.query(SeasonProgress).filter_by(player_id=p.id).one()
    level_before = sp.level

    exp_svc.award_exp(db, p.id, "unsportsmanlike", amount=-9999, reason="N/A")
    db.commit()
    sp = db.query(SeasonProgress).filter_by(player_id=p.id).one()
    assert sp.level == level_before
    assert sp.exp_in_level == 0  # capa a 0


def test_unknown_reason_code_requires_amount(db, make_player, make_season):
    p = make_player("alice")
    make_season(status=SeasonStatus.ACTIVE)
    with pytest.raises(ValueError, match="reason_code"):
        exp_svc.award_exp(db, p.id, "made_up_code")


def test_exp_rules_defaults_are_correct(db, make_player, make_season):
    """Reglas de EXP del brief."""
    assert exp_svc.EXP_RULES["champion"] == 600
    assert exp_svc.EXP_RULES["finalist"] == 400
    assert exp_svc.EXP_RULES["top_4"] == 300
    assert exp_svc.EXP_RULES["top_8"] == 200
    assert exp_svc.EXP_RULES["round_won"] == 50
    assert exp_svc.EXP_RULES["event_participation"] == 100
    assert exp_svc.EXP_RULES["no_show"] == -100
