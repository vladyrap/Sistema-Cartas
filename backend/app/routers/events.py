from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select

from app.core.deps import DbDep, GuildContext, UserDep, get_current_user
from app.models import Event, EventRegistration, Game, User
from app.schemas.common import EventOut, EventRegistrationOut, GameOut
from app.services import event as event_svc

router = APIRouter()


def _to_out(ev: Event, registered_count: int, is_registered: bool = False) -> EventOut:
    return EventOut(
        id=ev.id,
        name=ev.name,
        game_id=ev.game_id,
        event_type=ev.event_type,
        status=ev.status,
        starts_at=ev.starts_at,
        ends_at=ev.ends_at,
        slots=ev.slots,
        registered_count=registered_count,
        price_clp=int(ev.price_clp),
        description=ev.description,
        is_registered=is_registered,
    )


def _registered_set(db, player_id: int | None) -> set[int]:
    if player_id is None:
        return set()
    return set(
        db.scalars(
            select(EventRegistration.event_id).where(EventRegistration.player_id == player_id)
        )
    )


@router.get("", response_model=list[EventOut])
def list_events(db: DbDep, guild: GuildContext) -> list[EventOut]:
    stmt = select(Event).order_by(Event.starts_at)
    if guild is not None:
        stmt = stmt.where(Event.guild_id == guild.id)
    events = list(db.scalars(stmt))
    if not events:
        return []
    ids = [e.id for e in events]
    counts = dict(
        db.execute(
            select(EventRegistration.event_id, func.count(EventRegistration.id))
            .where(EventRegistration.event_id.in_(ids))
            .group_by(EventRegistration.event_id)
        ).all()
    )
    return [_to_out(e, counts.get(e.id, 0)) for e in events]


@router.get("/{event_id}", response_model=EventOut)
def get_event(event_id: int, db: DbDep, guild: GuildContext) -> EventOut:
    ev = db.get(Event, event_id)
    if not ev or (guild is not None and ev.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    count = db.scalar(
        select(func.count(EventRegistration.id)).where(EventRegistration.event_id == event_id)
    ) or 0
    return _to_out(ev, count)


@router.get("/{event_id}/me", response_model=EventOut)
def get_event_with_me(event_id: int, db: DbDep, current: UserDep, guild: GuildContext) -> EventOut:
    """Detalle del evento con flag de inscripción del jugador autenticado."""
    ev = db.get(Event, event_id)
    if not ev or (guild is not None and ev.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    count = db.scalar(
        select(func.count(EventRegistration.id)).where(EventRegistration.event_id == event_id)
    ) or 0
    is_reg = False
    if current.profile:
        is_reg = db.scalar(
            select(EventRegistration).where(
                EventRegistration.event_id == event_id,
                EventRegistration.player_id == current.profile.id,
            )
        ) is not None
    return _to_out(ev, count, is_reg)


@router.post("/{event_id}/register", response_model=EventRegistrationOut, status_code=201)
def register_to_event(event_id: int, db: DbDep, current: UserDep) -> EventRegistration:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil de jugador")
    reg = event_svc.register_player(db, event_id=event_id, player_id=current.profile.id)
    db.commit()
    db.refresh(reg)
    return reg


@router.delete("/registrations/{registration_id}", status_code=204)
def cancel_my_registration(registration_id: int, db: DbDep, current: UserDep):
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil de jugador")
    event_svc.cancel_registration(db, registration_id=registration_id, by_player_id=current.profile.id)
    db.commit()
    return None


# ============================== Games ==============================


games_router = APIRouter()


@games_router.get("", response_model=list[GameOut])
def list_games(db: DbDep) -> list[Game]:
    return list(db.scalars(select(Game).where(Game.is_active == True).order_by(Game.name)))
