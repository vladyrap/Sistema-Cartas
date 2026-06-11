"""Tests del Content Engine: enqueue idempotente, harvest, pipeline mock, SIS."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

import json
import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    ContentJob, ContentMetric, ContentPiece, Event, EventRegistration,
    EventStatus, Game, Guild, MatchResult,
)
from app.models.base import EventType, PaymentStatus
from app.services import content_engine as ce


@pytest.fixture()
def finished_event(db: Session, default_guild: Guild, game: Game, make_player):
    """Evento FINISHED con 8 jugadores, posiciones y matches del campeón."""
    ev = Event(
        guild_id=default_guild.id, name="Copa Content Test", game_id=game.id,
        event_type=EventType.COMPETITIVE, status=EventStatus.FINISHED,
        starts_at=datetime.now(timezone.utc) - timedelta(days=1),
        slots=16, price_clp=0,
    )
    db.add(ev)
    db.flush()
    players = [make_player() for _ in range(8)]
    for i, p in enumerate(players, start=1):
        db.add(EventRegistration(
            event_id=ev.id, player_id=p.id,
            payment_status=PaymentStatus.PAID,
            final_position=i, rounds_won=8 - i, rounds_lost=i - 1,
            match_points=(8 - i) * 3,
            registered_at=datetime.now(timezone.utc),
        ))
    # 2 matches del campeón (players[0])
    db.add(MatchResult(
        event_id=ev.id, round_number=1,
        player_a_id=players[0].id, player_b_id=players[7].id,
        winner_id=players[0].id, games_a=2, games_b=0,
        reported_at=datetime.now(timezone.utc),
    ))
    db.add(MatchResult(
        event_id=ev.id, round_number=2,
        player_a_id=players[1].id, player_b_id=players[0].id,
        winner_id=players[0].id, games_a=1, games_b=2,
        reported_at=datetime.now(timezone.utc),
    ))
    db.commit()
    db.refresh(ev)
    return ev


def test_enqueue_is_idempotent(db, finished_event):
    j1 = ce.enqueue_job(db, event_id=finished_event.id)
    j2 = ce.enqueue_job(db, event_id=finished_event.id)
    db.commit()
    assert j1.id == j2.id
    total = db.scalar(select(ContentJob).where(ContentJob.event_id == finished_event.id))
    assert total is not None


def test_harvest_collects_champion_and_top8(db, finished_event):
    data = ce.harvest_event_data(db, event_id=finished_event.id)
    assert data["evento"]["nombre"] == "Copa Content Test"
    assert data["evento"]["jugadores"] == 8
    assert data["campeon"] is not None
    assert len(data["campeon"]["camino"]) == 2
    assert "venció a" in data["campeon"]["camino"][0]
    assert len(data["top8"]) == 8
    assert data["top8"][0]["pos"] == 1


def test_process_job_mock_produces_ready_with_pieces(db, finished_event):
    """Sin API key (tests = mock) el pipeline completo llega a READY."""
    job = ce.enqueue_job(db, event_id=finished_event.id)
    db.commit()
    job = ce.process_job(db, job=job)
    db.commit()
    assert job.status == "READY", job.error
    assert job.harvest_json and job.brief_json
    brief = json.loads(job.brief_json)
    assert brief.get("_mock") is True
    pieces = list(db.scalars(select(ContentPiece).where(ContentPiece.job_id == job.id)))
    assert len(pieces) == 5
    platforms = {p.platform for p in pieces}
    assert platforms == {"tiktok", "instagram", "facebook", "youtube_shorts", "discord"}
    # Evento de 8 jugadores → nada se skipea
    assert all(p.status == "DRAFT" for p in pieces)


def test_small_event_skips_video_platforms(db, default_guild, game, make_player):
    ev = Event(
        guild_id=default_guild.id, name="Mini Torneo", game_id=game.id,
        event_type=EventType.CASUAL, status=EventStatus.FINISHED,
        starts_at=datetime.now(timezone.utc), slots=4, price_clp=0,
    )
    db.add(ev)
    db.flush()
    for i in range(4):
        p = make_player()
        db.add(EventRegistration(
            event_id=ev.id, player_id=p.id, payment_status=PaymentStatus.PAID,
            final_position=i + 1, registered_at=datetime.now(timezone.utc),
        ))
    db.commit()
    job = ce.enqueue_job(db, event_id=ev.id)
    job = ce.process_job(db, job=job)
    db.commit()
    assert job.status == "READY"
    skipped = {p.platform for p in db.scalars(select(ContentPiece).where(
        ContentPiece.job_id == job.id, ContentPiece.status == "SKIPPED",
    ))}
    assert skipped == {"tiktok", "youtube_shorts"}


def test_sis_relative_to_baseline(db, finished_event):
    """SIS = 50 × raw/baseline, necesita 3+ piezas previas para calibrar."""
    job = ce.enqueue_job(db, event_id=finished_event.id)
    db.commit()
    now = datetime.now(timezone.utc)

    def mk_piece(published=True):
        p = ContentPiece(
            job_id=job.id, event_id=finished_event.id, platform="instagram",
            body_json="{}", status="PUBLISHED" if published else "DRAFT",
            generation=mk_piece.gen, published_at=now,
        )
        mk_piece.gen += 1
        db.add(p)
        db.flush()
        return p
    mk_piece.gen = 1

    # 3 piezas históricas con raw=100 c/u (100 likes)
    for _ in range(3):
        old = mk_piece()
        db.add(ContentMetric(piece_id=old.id, captured_at=now, likes=100))
    db.flush()

    # Pieza nueva con raw=200 → SIS = 50×200/100 = 100
    target = mk_piece()
    out = ce.record_metrics(db, piece=target, likes=200)
    db.commit()
    assert out["impact_score"] == 100.0

    # Pieza con raw=50 → SIS = 25
    target2 = mk_piece()
    out2 = ce.record_metrics(db, piece=target2, likes=50)
    db.commit()
    assert out2["impact_score"] == 25.0


def test_sis_none_while_calibrating(db, finished_event):
    job = ce.enqueue_job(db, event_id=finished_event.id)
    db.commit()
    p = ContentPiece(
        job_id=job.id, event_id=finished_event.id, platform="tiktok",
        body_json="{}", status="PUBLISHED",
        published_at=datetime.now(timezone.utc),
    )
    db.add(p)
    db.flush()
    out = ce.record_metrics(db, piece=p, likes=500)
    db.commit()
    assert out["impact_score"] is None  # <3 piezas previas → calibrando
