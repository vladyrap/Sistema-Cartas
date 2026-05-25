"""Tests del servicio de temporadas — close/create/activate con regla de reset."""
import pytest

from app.models import RankName, SeasonHistory, SeasonProgress, SeasonStatus
from app.services import season as season_svc


def test_create_season_in_draft(db, make_season, default_guild):
    """Una temporada nueva nace en DRAFT."""
    s1 = make_season(status=SeasonStatus.CLOSED)
    s2 = season_svc.create_season(
        db, name="Temporada Test",
        starts_at=s1.starts_at, ends_at=s1.ends_at,
        previous_season_id=s1.id,
        guild_id=default_guild.id,
    )
    db.commit()
    assert s2.status == SeasonStatus.DRAFT
    assert s2.previous_season_id == s1.id


def test_activate_season_creates_progress_for_all(db, make_season, make_player):
    """Activar crea SeasonProgress para cada jugador existente."""
    p1 = make_player("alice")
    p2 = make_player("bob")
    s = make_season(status=SeasonStatus.DRAFT)

    result = season_svc.activate_season(db, s.id)
    db.commit()

    assert result["players_initialized"] == 2
    assert result["promoted_to_duelista"] == 0
    progresses = db.query(SeasonProgress).filter_by(season_id=s.id).all()
    assert len(progresses) == 2
    assert all(sp.level == 1 for sp in progresses)
    assert all(not sp.was_promoted_start for sp in progresses)


def test_activate_promotes_master_and_champion(db, make_season, make_player):
    """Maestro y Campeón en T-1 → comienzan Duelista N10 con was_promoted_start=True."""
    p_master = make_player("master")
    p_champ = make_player("champion")
    p_regular = make_player("regular")

    # Temporada anterior cerrada con histories
    t1 = make_season(status=SeasonStatus.CLOSED)
    db.add(SeasonHistory(
        season_id=t1.id, player_id=p_master.id,
        final_level=27, final_exp_total=20000, max_rank=RankName.MAESTRO,
        final_position=3, prestige_earned=400,
    ))
    db.add(SeasonHistory(
        season_id=t1.id, player_id=p_champ.id,
        final_level=30, final_exp_total=30000, max_rank=RankName.CAMPEON,
        final_position=1, prestige_earned=1000,
    ))
    db.add(SeasonHistory(
        season_id=t1.id, player_id=p_regular.id,
        final_level=18, final_exp_total=8000, max_rank=RankName.RETADOR,
        final_position=12, prestige_earned=50,
    ))
    db.commit()

    # T2 en DRAFT apuntando a T1
    t2 = make_season(status=SeasonStatus.DRAFT, previous_season_id=t1.id)

    result = season_svc.activate_season(db, t2.id)
    db.commit()

    assert result["promoted_to_duelista"] == 2
    sp_master = db.query(SeasonProgress).filter_by(season_id=t2.id, player_id=p_master.id).one()
    sp_champ = db.query(SeasonProgress).filter_by(season_id=t2.id, player_id=p_champ.id).one()
    sp_reg = db.query(SeasonProgress).filter_by(season_id=t2.id, player_id=p_regular.id).one()

    assert sp_master.level == 31 and sp_master.was_promoted_start
    assert sp_master.current_rank == RankName.DUELISTA
    assert sp_champ.level == 31 and sp_champ.was_promoted_start
    assert sp_reg.level == 1 and not sp_reg.was_promoted_start
    assert sp_reg.current_rank == RankName.INICIADO


def test_activate_rejects_if_other_active(db, make_season, make_player):
    """No se puede activar si ya hay otra temporada ACTIVE."""
    make_player("p1")
    make_season(status=SeasonStatus.ACTIVE)  # ya activa
    s = make_season(status=SeasonStatus.DRAFT)

    with pytest.raises(ValueError, match="ACTIVE"):
        season_svc.activate_season(db, s.id)


def test_activate_only_works_on_draft(db, make_season):
    """Activar solo funciona en estado DRAFT."""
    s = make_season(status=SeasonStatus.CLOSED)
    with pytest.raises(ValueError, match="DRAFT"):
        season_svc.activate_season(db, s.id)


def test_close_season_creates_history(db, make_season, make_player):
    """Cerrar temporada genera SeasonHistory por cada SeasonProgress."""
    p1 = make_player("alice")
    p2 = make_player("bob")
    s = make_season(status=SeasonStatus.ACTIVE)

    db.add(SeasonProgress(
        season_id=s.id, player_id=p1.id, starting_level=1,
        level=15, exp_in_level=20, exp_total=5000,
        max_rank=RankName.RETADOR, current_rank=RankName.RETADOR,
    ))
    db.add(SeasonProgress(
        season_id=s.id, player_id=p2.id, starting_level=10, was_promoted_start=True,
        level=12, exp_in_level=50, exp_total=2000,
        max_rank=RankName.DUELISTA, current_rank=RankName.DUELISTA,
    ))
    db.commit()

    report = season_svc.close_season(db, s.id)
    db.commit()

    assert report["total_players"] == 2
    s_after = db.query(season_svc.Season).filter_by(id=s.id).one()
    assert s_after.status == SeasonStatus.CLOSED
    histories = db.query(SeasonHistory).filter_by(season_id=s.id).all()
    assert len(histories) == 2
    # El de mayor exp queda en posición 1
    h_alice = next(h for h in histories if h.player_id == p1.id)
    h_bob = next(h for h in histories if h.player_id == p2.id)
    assert h_alice.final_position == 1
    assert h_bob.final_position == 2


def test_close_rejects_non_active(db, make_season):
    """Solo se puede cerrar temporadas ACTIVE."""
    s = make_season(status=SeasonStatus.DRAFT)
    with pytest.raises(ValueError, match="ACTIVE"):
        season_svc.close_season(db, s.id)


def test_close_grants_prestige(db, make_season, make_player):
    """Al cerrar, el jugador recibe prestigio que se suma al perfil."""
    p = make_player("alice")
    initial_prestige = p.prestige
    s = make_season(status=SeasonStatus.ACTIVE)
    db.add(SeasonProgress(
        season_id=s.id, player_id=p.id, starting_level=1,
        level=30, exp_in_level=0, exp_total=30000,
        max_rank=RankName.CAMPEON, current_rank=RankName.CAMPEON,
    ))
    db.commit()

    season_svc.close_season(db, s.id)
    db.commit()
    db.refresh(p)

    # Campeón nivel 30 → debería ganar: participation(50) + N10(100) + N20(200) + N30(400) + top8(300) + champion(700) = 1750
    assert p.prestige > initial_prestige
    assert p.prestige - initial_prestige == 1750


def test_preview_reset_matches_activate(db, make_season, make_player):
    """preview_reset y activate_season dan el mismo starting_level por jugador."""
    p_master = make_player("master")
    p_regular = make_player("regular")
    t1 = make_season(status=SeasonStatus.CLOSED)
    db.add(SeasonHistory(
        season_id=t1.id, player_id=p_master.id,
        final_level=28, final_exp_total=22000, max_rank=RankName.MAESTRO,
        final_position=2, prestige_earned=300,
    ))
    db.commit()
    t2 = make_season(status=SeasonStatus.DRAFT, previous_season_id=t1.id)

    preview = season_svc.preview_reset(db, target_season_id=t2.id)
    preview_by_id = {row["player_id"]: row for row in preview}

    season_svc.activate_season(db, t2.id)
    db.commit()

    sp_master = db.query(SeasonProgress).filter_by(season_id=t2.id, player_id=p_master.id).one()
    sp_reg = db.query(SeasonProgress).filter_by(season_id=t2.id, player_id=p_regular.id).one()

    assert preview_by_id[p_master.id]["starting_level"] == sp_master.starting_level == 31
    assert preview_by_id[p_regular.id]["starting_level"] == sp_reg.starting_level == 1
    assert preview_by_id[p_master.id]["was_promoted_start"] is True
