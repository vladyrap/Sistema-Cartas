"""Encuestas (polls) del Gremio."""
from datetime import datetime, timezone
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException, status
from sqlalchemy import func, select

from app.core.deps import DbDep, GuildContext, ScopedAdminDep, UserDep
from app.models import Poll, PollOption, PollVote

router = APIRouter()


class PollOptionOut(BaseModel):
    id: int
    text: str
    vote_count: int = 0


class PollOut(BaseModel):
    id: int
    guild_id: int
    question: str
    is_active: bool
    closes_at: datetime | None = None
    options: list[PollOptionOut]
    my_vote_option_id: int | None = None
    created_at: datetime


class PollCreate(BaseModel):
    question: str = Field(min_length=2, max_length=280)
    options: list[str] = Field(min_length=2, max_length=10)
    closes_at: datetime | None = None


def _serialize(db, poll: Poll, my_user_id: int | None) -> PollOut:
    counts_rows = db.execute(
        select(PollVote.option_id, func.count(PollVote.id))
        .where(PollVote.poll_id == poll.id)
        .group_by(PollVote.option_id)
    ).all()
    counts = {oid: int(c) for oid, c in counts_rows}
    options = list(db.scalars(
        select(PollOption).where(PollOption.poll_id == poll.id).order_by(PollOption.id)
    ))
    my_vote = None
    if my_user_id:
        my_vote = db.scalar(
            select(PollVote.option_id).where(
                PollVote.poll_id == poll.id, PollVote.user_id == my_user_id
            )
        )
    return PollOut(
        id=poll.id, guild_id=poll.guild_id, question=poll.question,
        is_active=poll.is_active, closes_at=poll.closes_at,
        options=[PollOptionOut(id=o.id, text=o.text, vote_count=counts.get(o.id, 0)) for o in options],
        my_vote_option_id=my_vote,
        created_at=poll.created_at,
    )


@router.get("", response_model=list[PollOut])
def list_polls(db: DbDep, guild: GuildContext, current: UserDep) -> list[PollOut]:
    if not guild:
        return []
    polls = list(db.scalars(
        select(Poll).where(Poll.guild_id == guild.id).order_by(Poll.id.desc())
    ))
    return [_serialize(db, p, current.id) for p in polls]


@router.post("", response_model=PollOut, status_code=201)
def create_poll(payload: PollCreate, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> PollOut:
    if not guild:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Falta X-Guild-Id")
    p = Poll(guild_id=guild.id, author_user_id=admin.id, question=payload.question, closes_at=payload.closes_at)
    db.add(p); db.flush()
    for text in payload.options:
        db.add(PollOption(poll_id=p.id, text=text.strip()[:160]))
    db.commit(); db.refresh(p)
    return _serialize(db, p, admin.id)


@router.post("/{poll_id}/vote/{option_id}", response_model=PollOut)
def vote(poll_id: int, option_id: int, db: DbDep, current: UserDep) -> PollOut:
    p = db.get(Poll, poll_id)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Encuesta no encontrada")
    if not p.is_active or (p.closes_at and p.closes_at < datetime.now(timezone.utc)):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Encuesta cerrada")
    opt = db.get(PollOption, option_id)
    if not opt or opt.poll_id != poll_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Opción inválida")

    existing = db.scalar(select(PollVote).where(PollVote.poll_id == poll_id, PollVote.user_id == current.id))
    if existing:
        existing.option_id = option_id
    else:
        db.add(PollVote(poll_id=poll_id, option_id=option_id, user_id=current.id))
    db.commit()
    return _serialize(db, p, current.id)


@router.post("/{poll_id}/close", response_model=PollOut)
def close_poll(poll_id: int, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> PollOut:
    p = db.get(Poll, poll_id)
    if not p or (guild and p.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Encuesta no encontrada")
    p.is_active = False
    db.commit()
    return _serialize(db, p, admin.id)


@router.delete("/{poll_id}", status_code=204)
def delete_poll(poll_id: int, db: DbDep, admin: ScopedAdminDep, guild: GuildContext):
    p = db.get(Poll, poll_id)
    if p and (not guild or p.guild_id == guild.id):
        db.delete(p); db.commit()
    return None
