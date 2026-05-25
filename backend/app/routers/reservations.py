"""Router de reservas — jugador (crear, cancelar, listar mías) y admin (gestionar)."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.deps import AdminDep, DbDep, GuildContext, ScopedAdminDep, UserDep, assert_resource_in_user_guild
from app.models import (
    PlayerProfile,
    Product,
    Reservation,
    ReservationStatus,
    Season,
    SeasonProgress,
    SeasonStatus,
)
from app.schemas.common import (
    ProductOut,
    ReservationAdminRow,
    ReservationCreate,
    ReservationOut,
    ReservationWithProduct,
)
from app.services import reservation as res_svc

router = APIRouter()


def _product_to_out(p: Product) -> ProductOut:
    return ProductOut(
        id=p.id,
        name=p.name,
        game_id=p.game_id,
        category=p.category,
        price_clp=int(p.price_clp),
        stock=p.stock,
        image_url=p.image_url,
        description=p.description,
        access=p.access,
        required_level=p.required_level,
        per_player_limit=p.per_player_limit,
        is_preorder=p.is_preorder,
        is_active=p.is_active,
    )


# ============================== Player endpoints ==============================


@router.post("/me", response_model=ReservationOut, status_code=201)
def create_my_reservation(payload: ReservationCreate, db: DbDep, current: UserDep) -> Reservation:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "El usuario no tiene perfil de jugador")
    res = res_svc.create_reservation(
        db,
        player_id=current.profile.id,
        product_id=payload.product_id,
        quantity=payload.quantity,
        note=payload.note,
    )
    db.commit()
    db.refresh(res)
    return res


@router.get("/me", response_model=list[ReservationWithProduct])
def list_my_reservations(db: DbDep, current: UserDep) -> list[ReservationWithProduct]:
    if not current.profile:
        return []
    rows = db.execute(
        select(Reservation, Product)
        .join(Product, Reservation.product_id == Product.id)
        .where(Reservation.player_id == current.profile.id)
        .order_by(Reservation.created_at.desc())
    ).all()
    return [
        ReservationWithProduct(
            reservation=ReservationOut.model_validate(r),
            product=_product_to_out(p),
        )
        for r, p in rows
    ]


@router.post("/me/{reservation_id}/cancel", response_model=ReservationOut)
def cancel_my_reservation(reservation_id: int, db: DbDep, current: UserDep) -> Reservation:
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    res = res_svc.cancel(db, reservation_id, by_player_id=current.profile.id)
    db.commit()
    db.refresh(res)
    return res


# ============================== Admin endpoints ==============================


admin_router = APIRouter()


def _admin_row(
    res: Reservation, product: Product, player: PlayerProfile, level: int | None
) -> ReservationAdminRow:
    return ReservationAdminRow(
        reservation=ReservationOut.model_validate(res),
        product_name=product.name,
        product_access=product.access,
        player_alias=player.alias,
        player_elite_id=player.elite_id_code,
        player_level=level,
    )


def _assert_reservation_in_guild(db, reservation_id: int, admin, guild) -> Reservation:
    res = db.get(Reservation, reservation_id)
    if not res:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reserva no encontrada")
    prod = db.get(Product, res.product_id)
    assert_resource_in_user_guild(
        user=admin,
        resource_guild_id=prod.guild_id if prod else None,
        x_guild_id=guild.id if guild else None,
    )
    return res


@admin_router.get("", response_model=list[ReservationAdminRow])
def list_all_reservations(
    db: DbDep,
    admin: ScopedAdminDep,
    guild: GuildContext,
    status_filter: ReservationStatus | None = Query(default=None, alias="status"),
) -> list[ReservationAdminRow]:
    # Active season scoped al Gremio actual
    active_stmt = select(Season).where(Season.status == SeasonStatus.ACTIVE)
    if guild is not None:
        active_stmt = active_stmt.where(Season.guild_id == guild.id)
    active = db.scalar(active_stmt)
    levels: dict[int, int] = {}
    if active:
        for pid, lv in db.execute(
            select(SeasonProgress.player_id, SeasonProgress.level).where(
                SeasonProgress.season_id == active.id
            )
        ).all():
            levels[pid] = lv

    stmt = (
        select(Reservation, Product, PlayerProfile)
        .join(Product, Reservation.product_id == Product.id)
        .join(PlayerProfile, Reservation.player_id == PlayerProfile.id)
        .order_by(Reservation.created_at.desc())
    )
    if status_filter is not None:
        stmt = stmt.where(Reservation.status == status_filter)
    if guild is not None:
        stmt = stmt.where(Product.guild_id == guild.id)

    return [
        _admin_row(r, prod, player, levels.get(player.id))
        for r, prod, player in db.execute(stmt).all()
    ]


@admin_router.post("/{reservation_id}/approve", response_model=ReservationOut)
def admin_approve(reservation_id: int, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> Reservation:
    _assert_reservation_in_guild(db, reservation_id, admin, guild)
    res = res_svc.approve(db, reservation_id)
    db.commit()
    db.refresh(res)
    return res


@admin_router.post("/{reservation_id}/reject", response_model=ReservationOut)
def admin_reject(reservation_id: int, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> Reservation:
    _assert_reservation_in_guild(db, reservation_id, admin, guild)
    res = res_svc.reject(db, reservation_id)
    db.commit()
    db.refresh(res)
    return res


@admin_router.post("/{reservation_id}/mark-paid", response_model=ReservationOut)
def admin_mark_paid(reservation_id: int, db: DbDep, admin: ScopedAdminDep, guild: GuildContext) -> Reservation:
    _assert_reservation_in_guild(db, reservation_id, admin, guild)
    res = res_svc.mark_paid(db, reservation_id)
    db.commit()
    db.refresh(res)
    return res


@admin_router.post("/expire-overdue", response_model=dict)
def admin_expire_overdue(db: DbDep, admin: AdminDep) -> dict:
    """Tarea de mantenimiento — solo admin global (no scoped)."""
    count = res_svc.expire_overdue(db)
    db.commit()
    return {"expired": count}
