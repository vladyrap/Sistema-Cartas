"""Tests del growth pack: créditos, premios, membresía, némesis, prioridad waitlist."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Event, EventRegistration, EventStatus, EventWaitlist, Game, Guild,
    MatchResult, PlayerRating, Season, SeasonNemesis, SeasonStatus,
)
from app.models.base import EventType, PaymentStatus
from app.services import event as event_svc
from app.services import growth as growth_svc


@pytest.fixture()
def make_event(db: Session, default_guild: Guild, game: Game):
    counter = {"n": 0}

    def _make(price_clp: int = 0, slots: int = 16, **extra) -> Event:
        counter["n"] += 1
        ev = Event(
            guild_id=default_guild.id,
            name=f"Growth Test {counter['n']}",
            game_id=game.id,
            event_type=EventType.COMPETITIVE,
            status=extra.pop("status", EventStatus.OPEN),
            starts_at=datetime.now(timezone.utc) + timedelta(hours=48),
            slots=slots,
            price_clp=price_clp,
            **extra,
        )
        db.add(ev)
        db.commit()
        db.refresh(ev)
        return ev

    return _make


# ══════════════════ CREDITS ══════════════════


def test_credit_balance_sums_ledger(db, make_player):
    p = make_player()
    growth_svc.grant_credit(db, player_id=p.id, amount_clp=5000, reason="premio", notify=False)
    growth_svc.grant_credit(db, player_id=p.id, amount_clp=-2000, reason="canje", kind="redeem", notify=False)
    db.commit()
    assert growth_svc.credit_balance(db, p.id) == 3000


def test_distribute_prizes_splits_pool(db, make_event, make_player):
    ev = make_event(price_clp=10000)
    players = [make_player() for _ in range(4)]
    for i, p in enumerate(players, start=1):
        reg = event_svc.register_player(db, event_id=ev.id, player_id=p.id)
        reg.payment_status = PaymentStatus.PAID
        reg.final_position = i
    db.commit()

    # Recaudado 40.000 · pool 50% = 20.000 · splits 50/30/20
    out = growth_svc.distribute_event_prizes(
        db, event_id=ev.id, percent_pool=50, splits=[50, 30, 20],
    )
    db.commit()
    assert out["collected_clp"] == 40000
    assert out["pool_clp"] == 20000
    amounts = {p["position"]: p["amount_clp"] for p in out["paid"]}
    assert amounts == {1: 10000, 2: 6000, 3: 4000}
    assert growth_svc.credit_balance(db, players[0].id) == 10000


def test_distribute_prizes_is_idempotent(db, make_event, make_player):
    ev = make_event(price_clp=5000)
    p = make_player()
    reg = event_svc.register_player(db, event_id=ev.id, player_id=p.id)
    reg.payment_status = PaymentStatus.PAID
    reg.final_position = 1
    db.commit()
    growth_svc.distribute_event_prizes(db, event_id=ev.id, percent_pool=100, splits=[100])
    db.commit()
    with pytest.raises(ValueError, match="ya repartió"):
        growth_svc.distribute_event_prizes(db, event_id=ev.id, percent_pool=100, splits=[100])


# ══════════════════ MEMBERSHIP ══════════════════


def test_membership_extend_and_is_member(db, make_player):
    p = make_player()
    assert growth_svc.is_member(db, p.id) is False
    m = growth_svc.extend_membership(db, player_id=p.id, days=30, source="manual")
    db.commit()
    assert growth_svc.is_member(db, p.id) is True
    first_until = m.paid_until
    # Segundo pago extiende desde paid_until, no desde now
    m2 = growth_svc.extend_membership(db, player_id=p.id, days=30, source="manual")
    db.commit()
    assert m2.paid_until > first_until
    assert m2.total_payments == 2


def test_expired_membership_not_member(db, make_player):
    p = make_player()
    m = growth_svc.extend_membership(db, player_id=p.id, days=30, source="manual")
    m.paid_until = datetime.now(timezone.utc) - timedelta(days=1)
    db.commit()
    assert growth_svc.is_member(db, p.id) is False


def test_member_waitlist_priority(db, make_event, make_player):
    """Un member que llegó segundo a la cola entra antes que el no-member."""
    ev = make_event(price_clp=0, slots=1)
    p1, w_normal, w_member = make_player(), make_player(), make_player()
    reg1 = event_svc.register_player(db, event_id=ev.id, player_id=p1.id)
    db.commit()
    event_svc.join_waitlist(db, event_id=ev.id, player_id=w_normal.id)   # primero en llegar
    event_svc.join_waitlist(db, event_id=ev.id, player_id=w_member.id)  # segundo, pero member
    growth_svc.extend_membership(db, player_id=w_member.id, days=30, source="manual")
    db.commit()

    event_svc.cancel_registration(db, registration_id=reg1.id, by_player_id=p1.id)
    db.commit()

    promoted = db.scalar(select(EventRegistration).where(
        EventRegistration.event_id == ev.id,
        EventRegistration.player_id == w_member.id,
    ))
    assert promoted is not None, "el member debió tener prioridad"
    still_waiting = db.scalar(select(EventWaitlist).where(
        EventWaitlist.event_id == ev.id,
        EventWaitlist.player_id == w_normal.id,
        EventWaitlist.promoted_at.is_(None),
    ))
    assert still_waiting is not None


# ══════════════════ NÉMESIS ══════════════════


@pytest.fixture()
def active_season(db, make_season):
    return make_season(status=SeasonStatus.ACTIVE)


def test_assign_nemeses_pairs_by_rating(db, make_player, game, active_season):
    now = datetime.now(timezone.utc)
    players = [make_player() for _ in range(4)]
    for i, p in enumerate(players):
        db.add(PlayerRating(player_id=p.id, game_id=game.id,
                            rating=1500 + i * 10, last_match_at=now))
    db.commit()

    pairs = growth_svc.assign_nemeses_for_season(db, season_id=active_season.id)
    db.commit()
    assert pairs == 2
    # Cada jugador tiene exactamente un némesis, y la relación es mutua
    for p in players:
        n = db.scalar(select(SeasonNemesis).where(
            SeasonNemesis.season_id == active_season.id,
            SeasonNemesis.player_id == p.id,
        ))
        assert n is not None
        reverse = db.scalar(select(SeasonNemesis).where(
            SeasonNemesis.season_id == active_season.id,
            SeasonNemesis.player_id == n.nemesis_player_id,
        ))
        assert reverse.nemesis_player_id == p.id


def test_assign_nemeses_idempotent(db, make_player, game, active_season):
    now = datetime.now(timezone.utc)
    for _ in range(2):
        p = make_player()
        db.add(PlayerRating(player_id=p.id, game_id=game.id, rating=1500, last_match_at=now))
    db.commit()
    assert growth_svc.assign_nemeses_for_season(db, season_id=active_season.id) == 1
    db.commit()
    # Segunda corrida: nadie nuevo → 0 pares
    assert growth_svc.assign_nemeses_for_season(db, season_id=active_season.id) == 0


def test_nemesis_match_updates_h2h(db, make_player, game, active_season, make_event):
    now = datetime.now(timezone.utc)
    a, b = make_player(), make_player()
    for p in (a, b):
        db.add(PlayerRating(player_id=p.id, game_id=game.id, rating=1500, last_match_at=now))
    db.commit()
    growth_svc.assign_nemeses_for_season(db, season_id=active_season.id)
    db.commit()

    ev = make_event()
    m = MatchResult(
        event_id=ev.id, round_number=1, player_a_id=a.id, player_b_id=b.id,
        winner_id=a.id, games_a=2, games_b=0,
        reported_at=now,
    )
    db.add(m)
    db.flush()

    was_nemesis = growth_svc.record_nemesis_match(db, match=m)
    db.commit()
    assert was_nemesis is True
    na = db.scalar(select(SeasonNemesis).where(
        SeasonNemesis.season_id == active_season.id, SeasonNemesis.player_id == a.id,
    ))
    assert na.my_wins == 1 and na.their_wins == 0


def test_non_nemesis_match_ignored(db, make_player, game, active_season, make_event):
    a, b = make_player(), make_player()  # sin ratings → sin némesis
    ev = make_event()
    m = MatchResult(
        event_id=ev.id, round_number=1, player_a_id=a.id, player_b_id=b.id,
        winner_id=a.id, games_a=2, games_b=0,
        reported_at=datetime.now(timezone.utc),
    )
    db.add(m)
    db.flush()
    assert growth_svc.record_nemesis_match(db, match=m) is False
