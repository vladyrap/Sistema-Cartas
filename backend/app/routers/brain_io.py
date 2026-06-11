"""Brain.io — polls live durante eventos para crowdsourcing de decisiones."""
import json
from collections import Counter
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select
from sqlalchemy.exc import IntegrityError

from app.core.deps import DbDep, OptionalUserDep, ScopedAdminDep, UserDep
from app.core.rate_limit import limiter
from app.models import BrainPoll, BrainVote, Event

router = APIRouter()


class CreatePollIn(BaseModel):
    event_id: int
    question: str = Field(min_length=4, max_length=280)
    options: list[str] = Field(min_length=2, max_length=6)
    match_id: int | None = None


class PollOut(BaseModel):
    id: int
    event_id: int
    match_id: int | None
    question: str
    options: list[str]
    status: str
    vote_counts: list[int]
    total_votes: int
    my_vote: int | None = None
    created_at: datetime


def _poll_to_out(db, poll: BrainPoll, user_id: int | None) -> PollOut:
    options = json.loads(poll.options_json or "[]")
    votes = list(db.scalars(select(BrainVote).where(BrainVote.poll_id == poll.id)))
    counts = [0] * len(options)
    my_vote = None
    for v in votes:
        if 0 <= v.option_index < len(counts):
            counts[v.option_index] += 1
        if user_id and v.user_id == user_id:
            my_vote = v.option_index
    return PollOut(
        id=poll.id, event_id=poll.event_id, match_id=poll.match_id,
        question=poll.question, options=options,
        status=poll.status,
        vote_counts=counts, total_votes=sum(counts),
        my_vote=my_vote, created_at=poll.created_at,
    )


@router.post("/", response_model=PollOut)
def create_poll(payload: CreatePollIn, admin: ScopedAdminDep, db: DbDep) -> PollOut:
    """Solo admin/judge crea polls."""
    ev = db.get(Event, payload.event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    poll = BrainPoll(
        event_id=payload.event_id,
        match_id=payload.match_id,
        question=payload.question.strip(),
        options_json=json.dumps([o.strip()[:120] for o in payload.options]),
        created_by_user_id=admin.id,
    )
    db.add(poll)
    db.commit()
    db.refresh(poll)
    return _poll_to_out(db, poll, admin.id)


@router.get("/events/{event_id}", response_model=list[PollOut])
def list_event_polls(event_id: int, db: DbDep, current: OptionalUserDep) -> list[PollOut]:
    polls = list(db.scalars(
        select(BrainPoll).where(BrainPoll.event_id == event_id).order_by(desc(BrainPoll.created_at)).limit(50)
    ))
    uid = current.id if current else None
    return [_poll_to_out(db, p, uid) for p in polls]


class VoteIn(BaseModel):
    option_index: int = Field(ge=0, le=5)


@router.post("/{poll_id}/vote", response_model=PollOut)
@limiter.limit("60/minute")
def vote(request: Request, poll_id: int, payload: VoteIn, current: UserDep, db: DbDep) -> PollOut:
    poll = db.get(BrainPoll, poll_id)
    if not poll:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Poll no encontrado")
    if poll.status != "OPEN":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Poll cerrado")
    options = json.loads(poll.options_json or "[]")
    if payload.option_index >= len(options):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Opción inválida")

    existing = db.scalar(select(BrainVote).where(
        BrainVote.poll_id == poll.id, BrainVote.user_id == current.id,
    ))
    if existing:
        existing.option_index = payload.option_index
    else:
        try:
            db.add(BrainVote(poll_id=poll.id, user_id=current.id, option_index=payload.option_index))
            db.flush()
        except IntegrityError:
            db.rollback()
    db.commit()
    return _poll_to_out(db, poll, current.id)


@router.post("/{poll_id}/close", response_model=PollOut)
def close_poll(poll_id: int, admin: ScopedAdminDep, db: DbDep) -> PollOut:
    poll = db.get(BrainPoll, poll_id)
    if not poll:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Poll no encontrado")
    poll.status = "CLOSED"
    poll.closes_at = datetime.now(timezone.utc)
    db.commit()
    return _poll_to_out(db, poll, admin.id)
