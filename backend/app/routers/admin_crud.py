"""CRUD admin endpoints — Games, Events, Products, Missions, Achievements, Players."""
from __future__ import annotations

from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import AdminDep, DbDep, GuildContext, ScopedAdminDep
from app.services import audit
from app.core.security import hash_password
from app.models import (
    Achievement,
    AttendanceStatus,
    Event,
    EventRegistration,
    Game,
    Mission,
    PaymentStatus,
    PlayerProfile,
    Product,
    Reservation,
    ReservationStatus,
    Season,
    SeasonProgress,
    SeasonStatus,
    User,
)
from app.schemas.common import (
    AchievementCreate,
    AchievementOut,
    AchievementUpdate,
    EventCreate,
    EventOut,
    EventUpdate,
    GameCreate,
    GameOut,
    GameUpdate,
    MissionCreate,
    MissionOut,
    MissionUpdate,
    PlayerAdminUpdate,
    PlayerFullOut,
    ProductCreate,
    ProductOut,
    ProductUpdate,
    UserAdminUpdate,
)


router = APIRouter()


# ============================== Games ==============================


@router.get("/games", response_model=list[GameOut])
def list_games(db: DbDep, admin: AdminDep) -> list[Game]:
    return list(db.scalars(select(Game).order_by(Game.name)))


@router.post("/games", response_model=GameOut, status_code=201)
def create_game(payload: GameCreate, db: DbDep, admin: AdminDep) -> Game:
    if db.scalar(select(Game).where(Game.code == payload.code)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Ya existe un juego con ese código")
    g = Game(**payload.model_dump())
    db.add(g)
    db.commit()
    db.refresh(g)
    return g


@router.patch("/games/{game_id}", response_model=GameOut)
def update_game(game_id: int, payload: GameUpdate, db: DbDep, admin: AdminDep) -> Game:
    g = db.get(Game, game_id)
    if not g:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Juego no encontrado")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(g, k, v)
    db.commit()
    db.refresh(g)
    return g


@router.delete("/games/{game_id}", status_code=204)
def delete_game(game_id: int, db: DbDep, admin: AdminDep):
    g = db.get(Game, game_id)
    if not g:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Juego no encontrado")
    # Soft check: bloquear si tiene eventos o productos relacionados
    has_events = db.scalar(select(Event).where(Event.game_id == game_id))
    has_products = db.scalar(select(Product).where(Product.game_id == game_id))
    if has_events or has_products:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "No se puede eliminar — hay eventos o productos asociados. Desactívalo en su lugar.",
        )
    db.delete(g)
    db.commit()


# ============================== Events ==============================


def _event_to_out(ev: Event, registered: int = 0) -> EventOut:
    return EventOut(
        id=ev.id, name=ev.name, game_id=ev.game_id, event_type=ev.event_type,
        status=ev.status, starts_at=ev.starts_at, ends_at=ev.ends_at,
        slots=ev.slots, registered_count=registered, price_clp=int(ev.price_clp),
        description=ev.description,
    )


@router.get("/events", response_model=list[EventOut])
def list_events_admin(db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> list[EventOut]:
    from sqlalchemy import func
    stmt = select(Event).order_by(Event.starts_at.desc())
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
    return [_event_to_out(e, counts.get(e.id, 0)) for e in events]


@router.post("/events", response_model=EventOut, status_code=201)
def create_event(payload: EventCreate, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> EventOut:
    if not db.get(Game, payload.game_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Juego no encontrado")
    if payload.season_id is not None and not db.get(Season, payload.season_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Temporada no encontrada")
    data = payload.model_dump()
    if guild is not None:
        data["guild_id"] = guild.id
    ev = Event(**data)
    db.add(ev)
    db.flush()
    audit.log(db, admin_id=admin.id, action="event.create", guild_id=ev.guild_id,
              target_kind="event", target_id=ev.id, payload={"name": ev.name})
    db.commit()
    db.refresh(ev)
    return _event_to_out(ev, 0)


@router.patch("/events/{event_id}", response_model=EventOut)
def update_event(event_id: int, payload: EventUpdate, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> EventOut:
    ev = db.get(Event, event_id)
    if not ev or (guild is not None and ev.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    if payload.game_id is not None and not db.get(Game, payload.game_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Juego no encontrado")
    changes = payload.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(ev, k, v)
    audit.log(db, admin_id=admin.id, action="event.update", guild_id=ev.guild_id,
              target_kind="event", target_id=ev.id,
              payload={"name": ev.name, "fields": list(changes.keys())})
    db.commit()
    db.refresh(ev)

    from sqlalchemy import func
    count = db.scalar(
        select(func.count(EventRegistration.id)).where(EventRegistration.event_id == event_id)
    ) or 0
    return _event_to_out(ev, count)


@router.delete("/events/{event_id}", status_code=204)
def delete_event(event_id: int, db: DbDep, admin: ScopedAdminDep, guild: GuildContext):
    ev = db.get(Event, event_id)
    if not ev or (guild is not None and ev.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no encontrado")
    # Bloquear si tiene inscritos
    has_regs = db.scalar(select(EventRegistration).where(EventRegistration.event_id == event_id))
    if has_regs:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "No se puede eliminar — tiene inscritos. Cancela el evento en su lugar.",
        )
    audit.log(db, admin_id=admin.id, action="event.delete", guild_id=ev.guild_id,
              target_kind="event", target_id=ev.id, payload={"name": ev.name})
    db.delete(ev)
    db.commit()


# ============================== Products ==============================


@router.get("/products", response_model=list[ProductOut])
def list_products_admin(db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> list[ProductOut]:
    stmt = select(Product).order_by(Product.name)
    if guild is not None:
        stmt = stmt.where(Product.guild_id == guild.id)
    rows = list(db.scalars(stmt))
    return [_product_out(p) for p in rows]


def _product_out(p: Product) -> ProductOut:
    return ProductOut(
        id=p.id, name=p.name, game_id=p.game_id, category=p.category,
        price_clp=int(p.price_clp), stock=p.stock, image_url=p.image_url,
        description=p.description, access=p.access, required_level=p.required_level,
        per_player_limit=p.per_player_limit, is_preorder=p.is_preorder, is_active=p.is_active,
    )


@router.post("/products", response_model=ProductOut, status_code=201)
def create_product(payload: ProductCreate, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> ProductOut:
    if payload.game_id is not None and not db.get(Game, payload.game_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Juego no encontrado")
    data = payload.model_dump()
    if guild is not None:
        data["guild_id"] = guild.id
    p = Product(**data)
    db.add(p)
    db.flush()
    audit.log(db, admin_id=admin.id, action="product.create", guild_id=p.guild_id,
              target_kind="product", target_id=p.id, payload={"name": p.name})
    db.commit()
    db.refresh(p)
    return _product_out(p)


@router.patch("/products/{product_id}", response_model=ProductOut)
def update_product(product_id: int, payload: ProductUpdate, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> ProductOut:
    p = db.get(Product, product_id)
    if not p or (guild is not None and p.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado")
    if payload.game_id is not None and not db.get(Game, payload.game_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Juego no encontrado")
    changes = payload.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(p, k, v)
    audit.log(db, admin_id=admin.id, action="product.update", guild_id=p.guild_id,
              target_kind="product", target_id=p.id,
              payload={"name": p.name, "fields": list(changes.keys())})
    db.commit()
    db.refresh(p)
    return _product_out(p)


@router.delete("/products/{product_id}", status_code=204)
def delete_product(product_id: int, db: DbDep, admin: ScopedAdminDep, guild: GuildContext):
    p = db.get(Product, product_id)
    if not p or (guild is not None and p.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Producto no encontrado")
    has_active_res = db.scalar(
        select(Reservation).where(
            Reservation.product_id == product_id,
            Reservation.status.in_([
                ReservationStatus.PENDING, ReservationStatus.APPROVED, ReservationStatus.PAID
            ]),
        )
    )
    if has_active_res:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "No se puede eliminar — tiene reservas activas. Desactívalo (is_active=false).",
        )
    audit.log(db, admin_id=admin.id, action="product.delete", guild_id=p.guild_id,
              target_kind="product", target_id=p.id, payload={"name": p.name})
    db.delete(p)
    db.commit()


# ============================== Missions ==============================


@router.get("/missions", response_model=list[MissionOut])
def list_missions_admin(db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> list[Mission]:
    stmt = select(Mission).order_by(Mission.is_weekly.desc(), Mission.name)
    if guild is not None:
        stmt = stmt.where(Mission.guild_id == guild.id)
    return list(db.scalars(stmt))


@router.post("/missions", response_model=MissionOut, status_code=201)
def create_mission(payload: MissionCreate, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> Mission:
    # Code es único por Gremio (a nivel global puede repetirse entre Gremios)
    dup_stmt = select(Mission).where(Mission.code == payload.code)
    if guild is not None:
        dup_stmt = dup_stmt.where(Mission.guild_id == guild.id)
    if db.scalar(dup_stmt):
        raise HTTPException(status.HTTP_409_CONFLICT, "Código de misión ya existe")
    if payload.season_id is not None and not db.get(Season, payload.season_id):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Temporada no encontrada")
    data = payload.model_dump()
    if guild is not None:
        data["guild_id"] = guild.id
    m = Mission(**data)
    db.add(m)
    db.flush()
    audit.log(db, admin_id=admin.id, action="mission.create", guild_id=m.guild_id,
              target_kind="mission", target_id=m.id, payload={"name": m.name, "code": m.code})
    db.commit()
    db.refresh(m)
    return m


@router.patch("/missions/{mission_id}", response_model=MissionOut)
def update_mission(mission_id: int, payload: MissionUpdate, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> Mission:
    m = db.get(Mission, mission_id)
    if not m or (guild is not None and m.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Misión no encontrada")
    changes = payload.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(m, k, v)
    audit.log(db, admin_id=admin.id, action="mission.update", guild_id=m.guild_id,
              target_kind="mission", target_id=m.id,
              payload={"name": m.name, "fields": list(changes.keys())})
    db.commit()
    db.refresh(m)
    return m


@router.delete("/missions/{mission_id}", status_code=204)
def delete_mission(mission_id: int, db: DbDep, admin: ScopedAdminDep, guild: GuildContext):
    m = db.get(Mission, mission_id)
    if not m or (guild is not None and m.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Misión no encontrada")
    audit.log(db, admin_id=admin.id, action="mission.delete", guild_id=m.guild_id,
              target_kind="mission", target_id=m.id, payload={"name": m.name})
    db.delete(m)
    db.commit()


# ============================== Achievements ==============================


@router.get("/achievements", response_model=list[AchievementOut])
def list_achievements_admin(db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> list[Achievement]:
    stmt = select(Achievement).order_by(Achievement.name)
    if guild is not None:
        stmt = stmt.where(Achievement.guild_id == guild.id)
    return list(db.scalars(stmt))


@router.post("/achievements", response_model=AchievementOut, status_code=201)
def create_achievement(payload: AchievementCreate, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> Achievement:
    # code es unique global a nivel BD — no relajar
    if db.scalar(select(Achievement).where(Achievement.code == payload.code)):
        raise HTTPException(status.HTTP_409_CONFLICT, "Código de medalla ya existe")
    data = payload.model_dump()
    if guild is not None:
        data["guild_id"] = guild.id
    a = Achievement(**data)
    db.add(a)
    db.flush()
    audit.log(db, admin_id=admin.id, action="achievement.create", guild_id=a.guild_id,
              target_kind="achievement", target_id=a.id, payload={"name": a.name})
    db.commit()
    db.refresh(a)
    return a


@router.patch("/achievements/{achievement_id}", response_model=AchievementOut)
def update_achievement(achievement_id: int, payload: AchievementUpdate, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> Achievement:
    a = db.get(Achievement, achievement_id)
    if not a or (guild is not None and a.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Medalla no encontrada")
    changes = payload.model_dump(exclude_unset=True)
    for k, v in changes.items():
        setattr(a, k, v)
    audit.log(db, admin_id=admin.id, action="achievement.update", guild_id=a.guild_id,
              target_kind="achievement", target_id=a.id,
              payload={"name": a.name, "fields": list(changes.keys())})
    db.commit()
    db.refresh(a)
    return a


@router.delete("/achievements/{achievement_id}", status_code=204)
def delete_achievement(achievement_id: int, db: DbDep, admin: ScopedAdminDep, guild: GuildContext):
    a = db.get(Achievement, achievement_id)
    if not a or (guild is not None and a.guild_id != guild.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Medalla no encontrada")
    audit.log(db, admin_id=admin.id, action="achievement.delete", guild_id=a.guild_id,
              target_kind="achievement", target_id=a.id, payload={"name": a.name})
    db.delete(a)
    db.commit()


# ============================== Players (full admin view) ==============================


def _player_full(player: PlayerProfile, user: User, level: int | None, rank: str | None) -> PlayerFullOut:
    return PlayerFullOut(
        id=player.id, user_id=user.id, email=user.email, role=user.role, is_active=user.is_active,
        alias=player.alias, full_name=player.full_name, avatar_url=player.avatar_url,
        player_class=player.player_class, elite_id_code=player.elite_id_code,
        elite_id_number=player.elite_id_number, prestige=player.prestige,
        favorite_game_id=player.favorite_game_id, current_level=level, current_rank=rank,
    )


@router.get("/players-full", response_model=list[PlayerFullOut])
def list_players_full(db: DbDep, admin: AdminDep) -> list[PlayerFullOut]:
    active = db.scalar(select(Season).where(Season.status == SeasonStatus.ACTIVE))
    levels: dict[int, tuple[int, str]] = {}
    if active:
        for pid, lv, rk in db.execute(
            select(SeasonProgress.player_id, SeasonProgress.level, SeasonProgress.current_rank)
            .where(SeasonProgress.season_id == active.id)
        ).all():
            levels[pid] = (lv, rk.value if hasattr(rk, "value") else rk)

    rows = db.execute(
        select(PlayerProfile, User)
        .join(User, PlayerProfile.user_id == User.id)
        .order_by(PlayerProfile.alias)
    ).all()
    out = []
    for player, user in rows:
        lv, rk = levels.get(player.id, (None, None))
        out.append(_player_full(player, user, lv, rk))
    return out


@router.patch("/players/{player_id}/profile", response_model=PlayerFullOut)
def admin_update_player_profile(
    player_id: int, payload: PlayerAdminUpdate, db: DbDep, admin: AdminDep
) -> PlayerFullOut:
    player = db.get(PlayerProfile, player_id)
    if not player:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jugador no encontrado")
    data = payload.model_dump(exclude_unset=True)
    if "alias" in data and data["alias"] != player.alias:
        if db.scalar(select(PlayerProfile).where(PlayerProfile.alias == data["alias"])):
            raise HTTPException(status.HTTP_409_CONFLICT, "Alias ya está en uso")
    for k, v in data.items():
        setattr(player, k, v)
    db.commit()
    db.refresh(player)

    user = db.get(User, player.user_id)
    active = db.scalar(select(Season).where(Season.status == SeasonStatus.ACTIVE))
    lv, rk = (None, None)
    if active:
        sp = db.scalar(
            select(SeasonProgress).where(
                SeasonProgress.season_id == active.id, SeasonProgress.player_id == player.id
            )
        )
        if sp:
            lv = sp.level
            rk = sp.current_rank.value if hasattr(sp.current_rank, "value") else sp.current_rank
    return _player_full(player, user, lv, rk)


@router.patch("/players/{player_id}/user", response_model=PlayerFullOut)
def admin_update_player_user(
    player_id: int, payload: UserAdminUpdate, db: DbDep, admin: AdminDep
) -> PlayerFullOut:
    player = db.get(PlayerProfile, player_id)
    if not player:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jugador no encontrado")
    user = db.get(User, player.user_id)
    if not user:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Usuario no encontrado")
    data = payload.model_dump(exclude_unset=True)
    if "new_password" in data and data["new_password"]:
        user.password_hash = hash_password(data.pop("new_password"))
    for k, v in data.items():
        setattr(user, k, v)
    db.commit()
    db.refresh(user)

    active = db.scalar(select(Season).where(Season.status == SeasonStatus.ACTIVE))
    lv, rk = (None, None)
    if active:
        sp = db.scalar(
            select(SeasonProgress).where(
                SeasonProgress.season_id == active.id, SeasonProgress.player_id == player.id
            )
        )
        if sp:
            lv = sp.level
            rk = sp.current_rank.value if hasattr(sp.current_rank, "value") else sp.current_rank
    return _player_full(player, user, lv, rk)
