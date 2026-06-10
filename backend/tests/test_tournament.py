"""Tests del sistema de torneos: standings, pairings, report_match, finalize.

Cubre las invariantes críticas que cualquier refactor futuro NO debe romper:
  - winner ∈ {player_a, player_b} o draw
  - UNIQUE compuesta por ronda
  - idempotencia de report_match
  - lockout de generate_pairings si la ronda actual no está cerrada
  - finalize_positions calcula rank correcto
  - unfinalize limpia posiciones
"""
import pytest
from datetime import datetime, timezone
from fastapi import HTTPException
from sqlalchemy.exc import IntegrityError

from app.models import (
    Event,
    EventRegistration,
    EventStatus,
    EventType,
    MatchResult,
)
from app.services import tournament as ts


# ─────────────────────────  Fixtures  ─────────────────────────


@pytest.fixture()
def make_event(db, default_guild, game, make_season):
    counter = {"n": 0}

    def _make(*, season=None, status=EventStatus.OPEN, **extra) -> Event:
        counter["n"] += 1
        n = counter["n"]
        s = season or make_season(status="ACTIVE")
        ev = Event(
            guild_id=default_guild.id,
            name=extra.pop("name", f"Event {n}"),
            game_id=game.id,
            season_id=s.id,
            event_type=extra.pop("event_type", EventType.COMPETITIVE),
            status=status,
            starts_at=datetime.now(timezone.utc),
            slots=extra.pop("slots", 16),
            **extra,
        )
        db.add(ev)
        db.commit()
        db.refresh(ev)
        return ev

    return _make


@pytest.fixture()
def make_registration(db):
    def _make(event, player, **extra) -> EventRegistration:
        reg = EventRegistration(
            event_id=event.id, player_id=player.id,
            match_points=extra.pop("match_points", 0),
            rounds_won=extra.pop("rounds_won", 0),
            rounds_lost=extra.pop("rounds_lost", 0),
            rounds_draw=extra.pop("rounds_draw", 0),
            games_won=extra.pop("games_won", 0),
            games_lost=extra.pop("games_lost", 0),
            **extra,
        )
        db.add(reg)
        db.commit()
        db.refresh(reg)
        return reg

    return _make


@pytest.fixture()
def make_match(db):
    def _make(event, pa, pb, *, round_number=1, table=1, **extra) -> MatchResult:
        m = MatchResult(
            event_id=event.id,
            round_number=round_number,
            table_number=table,
            player_a_id=pa.id,
            player_b_id=pb.id if pb else None,
            **extra,
        )
        db.add(m)
        db.commit()
        db.refresh(m)
        return m

    return _make


# ─────────────────────────  DB constraints  ─────────────────────────


class TestDatabaseConstraints:
    def test_unique_player_a_per_round(self, db, make_event, make_player, make_match):
        """Un jugador no puede ser player_a dos veces en la misma ronda."""
        ev = make_event()
        p1, p2, p3 = make_player(), make_player(), make_player()
        make_match(ev, p1, p2, round_number=1, table=1)
        db.add(MatchResult(
            event_id=ev.id, round_number=1, table_number=2,
            player_a_id=p1.id, player_b_id=p3.id,
        ))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_unique_player_b_per_round(self, db, make_event, make_player, make_match):
        """Un jugador no puede ser player_b dos veces en la misma ronda."""
        ev = make_event()
        p1, p2, p3 = make_player(), make_player(), make_player()
        make_match(ev, p1, p2, round_number=1, table=1)
        db.add(MatchResult(
            event_id=ev.id, round_number=1, table_number=2,
            player_a_id=p3.id, player_b_id=p2.id,  # p2 ya está
        ))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_winner_must_be_a_player(self, db, make_event, make_player):
        """CHECK constraint: winner_id ∈ {player_a, player_b}."""
        ev = make_event()
        p1, p2, p3 = make_player(), make_player(), make_player()
        db.add(MatchResult(
            event_id=ev.id, round_number=1, table_number=1,
            player_a_id=p1.id, player_b_id=p2.id,
            winner_id=p3.id,  # ¡no juega en este match!
            games_a=2, games_b=0,
        ))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_winner_null_is_ok(self, db, make_event, make_player):
        """winner_id NULL es válido (draw o sin reportar)."""
        ev = make_event()
        p1, p2 = make_player(), make_player()
        db.add(MatchResult(
            event_id=ev.id, round_number=1, table_number=1,
            player_a_id=p1.id, player_b_id=p2.id,
            winner_id=None, is_draw=True, games_a=1, games_b=1,
        ))
        db.commit()  # no debe levantar

    def test_no_negative_games(self, db, make_event, make_player):
        ev = make_event()
        p1, p2 = make_player(), make_player()
        db.add(MatchResult(
            event_id=ev.id, round_number=1, table_number=1,
            player_a_id=p1.id, player_b_id=p2.id,
            games_a=-1, games_b=0,
        ))
        with pytest.raises(IntegrityError):
            db.commit()
        db.rollback()

    def test_cascade_delete_event_removes_matches(self, db, make_event, make_player, make_match):
        ev = make_event()
        p1, p2 = make_player(), make_player()
        make_match(ev, p1, p2)
        assert db.query(MatchResult).count() == 1
        db.delete(ev)
        db.commit()
        assert db.query(MatchResult).count() == 0


# ─────────────────────────  Standings  ─────────────────────────


class TestStandings:
    def test_empty_event_returns_empty(self, db, make_event):
        ev = make_event()
        assert ts.compute_standings(db, event_id=ev.id) == []

    def test_orders_by_match_points_desc(self, db, make_event, make_player, make_registration):
        ev = make_event()
        p1, p2, p3 = make_player(), make_player(), make_player()
        make_registration(ev, p1, match_points=9, rounds_won=3)
        make_registration(ev, p2, match_points=6, rounds_won=2, rounds_lost=1)
        make_registration(ev, p3, match_points=3, rounds_won=1, rounds_lost=2)

        rows = ts._compute_standings_inner(db, event_id=ev.id)
        assert [r.player_id for r in rows] == [p1.id, p2.id, p3.id]
        assert [r.rank for r in rows] == [1, 2, 3]

    def test_dropped_players_keep_their_standing(self, db, make_event, make_player, make_registration):
        """Drop NO baja del ranking — el jugador desapareció de pairings pero sus puntos quedan."""
        ev = make_event()
        p1, p2 = make_player(), make_player()
        make_registration(ev, p1, match_points=6, rounds_won=2)
        make_registration(ev, p2, match_points=3, rounds_won=1, dropped=True)
        rows = ts._compute_standings_inner(db, event_id=ev.id)
        assert rows[0].player_id == p1.id
        assert rows[1].player_id == p2.id and rows[1].dropped


# ─────────────────────────  report_match validations  ─────────────────────────


class TestReportMatchValidations:
    def test_winner_must_be_in_match(self, db, make_event, make_player, make_match):
        ev = make_event()
        p1, p2, p3 = make_player(), make_player(), make_player()
        m = make_match(ev, p1, p2)
        with pytest.raises(HTTPException) as ei:
            ts.report_match(db, match_id=m.id, winner_id=p3.id, is_draw=False, games_a=2, games_b=0)
        assert ei.value.status_code == 400
        assert "jugadores del match" in ei.value.detail

    def test_draw_with_winner_rejected(self, db, make_event, make_player, make_match, make_registration):
        ev = make_event()
        p1, p2 = make_player(), make_player()
        make_registration(ev, p1); make_registration(ev, p2)
        m = make_match(ev, p1, p2)
        with pytest.raises(HTTPException) as ei:
            ts.report_match(db, match_id=m.id, winner_id=p1.id, is_draw=True, games_a=1, games_b=1)
        assert ei.value.status_code == 400

    def test_no_draw_no_winner_rejected(self, db, make_event, make_player, make_match, make_registration):
        ev = make_event()
        p1, p2 = make_player(), make_player()
        make_registration(ev, p1); make_registration(ev, p2)
        m = make_match(ev, p1, p2)
        with pytest.raises(HTTPException) as ei:
            ts.report_match(db, match_id=m.id, winner_id=None, is_draw=False, games_a=2, games_b=0)
        assert ei.value.status_code == 400

    def test_bye_cannot_be_reported(self, db, make_event, make_player, make_match):
        ev = make_event()
        p1 = make_player()
        m = make_match(ev, p1, None, is_bye=True, winner_id=p1.id, games_a=2, games_b=0)
        with pytest.raises(HTTPException) as ei:
            ts.report_match(db, match_id=m.id, winner_id=p1.id, is_draw=False, games_a=2, games_b=0)
        assert ei.value.status_code == 400


# ─────────────────────────  report_match idempotency  ─────────────────────────


class TestReportMatchIdempotency:
    def test_report_then_change_reverts_correctly(self, db, make_event, make_player, make_match, make_registration):
        """Reportar A-gana, luego cambiar a B-gana, deja a B con MP=3 y A con 0."""
        ev = make_event()
        p1, p2 = make_player(), make_player()
        reg1 = make_registration(ev, p1)
        reg2 = make_registration(ev, p2)
        m = make_match(ev, p1, p2)

        ts.report_match(db, match_id=m.id, winner_id=p1.id, is_draw=False, games_a=2, games_b=0)
        db.commit()
        db.refresh(reg1); db.refresh(reg2)
        assert reg1.match_points == 3 and reg1.rounds_won == 1
        assert reg2.match_points == 0 and reg2.rounds_lost == 1

        ts.report_match(db, match_id=m.id, winner_id=p2.id, is_draw=False, games_a=0, games_b=2)
        db.commit()
        db.refresh(reg1); db.refresh(reg2)
        assert reg1.match_points == 0 and reg1.rounds_won == 0 and reg1.rounds_lost == 1
        assert reg2.match_points == 3 and reg2.rounds_won == 1 and reg2.rounds_lost == 0

    def test_report_to_draw_reverts_correctly(self, db, make_event, make_player, make_match, make_registration):
        ev = make_event()
        p1, p2 = make_player(), make_player()
        reg1 = make_registration(ev, p1); reg2 = make_registration(ev, p2)
        m = make_match(ev, p1, p2)
        ts.report_match(db, match_id=m.id, winner_id=p1.id, is_draw=False, games_a=2, games_b=1)
        db.commit()
        ts.report_match(db, match_id=m.id, winner_id=None, is_draw=True, games_a=1, games_b=1)
        db.commit()
        db.refresh(reg1); db.refresh(reg2)
        assert reg1.match_points == 1 and reg1.rounds_draw == 1
        assert reg2.match_points == 1 and reg2.rounds_draw == 1


# ─────────────────────────  generate_pairings  ─────────────────────────


class TestGeneratePairings:
    def test_blocks_if_current_round_open(self, db, make_event, make_player, make_match, make_registration):
        """Si la ronda 1 tiene un match no reportado, no se puede generar ronda 2."""
        ev = make_event()
        p1, p2, p3, p4 = make_player(), make_player(), make_player(), make_player()
        for p in (p1, p2, p3, p4):
            make_registration(ev, p)
        make_match(ev, p1, p2, round_number=1, table=1)  # sin reportar
        with pytest.raises(HTTPException) as ei:
            ts.generate_pairings(db, event_id=ev.id)
        assert ei.value.status_code == 400
        assert "sin reportar" in ei.value.detail

    def test_odd_player_gets_bye(self, db, make_event, make_player, make_registration):
        ev = make_event()
        players = [make_player() for _ in range(5)]
        for p in players:
            make_registration(ev, p)
        pairings = ts.generate_pairings(db, event_id=ev.id)
        byes = [p for p in pairings if p.player_b_id is None]
        assert len(byes) == 1
        assert len(pairings) == 3  # 2 matches reales + 1 bye

    def test_dropped_players_excluded(self, db, make_event, make_player, make_registration):
        ev = make_event()
        p1, p2, p3 = make_player(), make_player(), make_player()
        make_registration(ev, p1)
        make_registration(ev, p2)
        make_registration(ev, p3, dropped=True)
        pairings = ts.generate_pairings(db, event_id=ev.id)
        all_pids = {p.player_a_id for p in pairings} | {p.player_b_id for p in pairings if p.player_b_id}
        assert p3.id not in all_pids


# ─────────────────────────  Bye persistence  ─────────────────────────


class TestPersistPairings:
    def test_bye_auto_awards_match_points(self, db, make_event, make_player, make_registration):
        ev = make_event()
        p1 = make_player()
        reg = make_registration(ev, p1)
        pairings = [ts.PairingProposal(table_number=1, player_a_id=p1.id, player_b_id=None)]
        ts.persist_pairings(db, event_id=ev.id, pairings=pairings)
        db.commit()
        db.refresh(reg)
        assert reg.match_points == 3
        assert reg.rounds_won == 1
        assert reg.games_won == 2


# ─────────────────────────  finalize + unfinalize  ─────────────────────────


class TestFinalize:
    def test_finalize_assigns_positions(self, db, make_event, make_player, make_registration):
        ev = make_event()
        p1, p2, p3 = make_player(), make_player(), make_player()
        reg1 = make_registration(ev, p1, match_points=9, rounds_won=3)
        reg2 = make_registration(ev, p2, match_points=6, rounds_won=2, rounds_lost=1)
        reg3 = make_registration(ev, p3, match_points=3, rounds_won=1, rounds_lost=2)

        n = ts.finalize_positions(db, event_id=ev.id)
        db.commit()
        assert n == 3
        db.refresh(reg1); db.refresh(reg2); db.refresh(reg3)
        assert reg1.final_position == 1
        assert reg2.final_position == 2
        assert reg3.final_position == 3

    def test_unfinalize_clears_positions(self, db, make_event, make_player, make_registration):
        ev = make_event()
        p1 = make_player()
        reg = make_registration(ev, p1, match_points=9, final_position=1)
        result = ts.unfinalize_event(db, event_id=ev.id)
        db.commit()
        db.refresh(reg)
        assert result["positions_cleared"] >= 1
        assert reg.final_position is None
