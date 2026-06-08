"""Validación y creación de reservas.

Reglas:
  - Producto debe estar activo y con stock > 0.
  - Jugador no puede sobrepasar `per_player_limit` por producto.
  - Si el producto pide `required_level`, el jugador debe tener un SeasonProgress
    en la temporada activa con `level >= required_level`. Si no hay temporada
    activa o el jugador no tiene progreso, se rechaza.
  - Si el producto es ELITE_PRO, requiere nivel 25+.
  - Si el producto es ELITE_ACCESS, requiere nivel 15+ (preventa básica) o 20+
    (Elite Access completo). El service trata 15+ como suficiente para Access.
  - El admin puede aprobar/rechazar/marcar pagada/cancelar reservas.

Distribución de stock (informativa para preventas con cupos limitados):
  40% para usuarios con Elite Access o Elite Pro
  40% para comunidad general
  20% reservado para premios/eventos
Esto se valida cuando el producto tiene flag is_preorder y stock<=10 (regla
simple: si stock por categoría se agotó, rechazar). Para MVP el control se hace
manualmente desde admin al ajustar stock; el service solo valida nivel y access.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    PlayerProfile,
    Product,
    ProductAccess,
    ProductVariant,
    Reservation,
    ReservationStatus,
    Season,
    SeasonProgress,
    SeasonStatus,
)


DEFAULT_EXPIRATION_HOURS = 72


class ReservationError(Exception):
    pass


def _player_current_level(db: Session, player_id: int) -> int:
    """Nivel del jugador en la temporada activa. 0 si no hay temporada o progreso."""
    active = db.scalar(select(Season).where(Season.status == SeasonStatus.ACTIVE))
    if not active:
        return 0
    sp = db.scalar(
        select(SeasonProgress).where(
            SeasonProgress.season_id == active.id,
            SeasonProgress.player_id == player_id,
        )
    )
    return sp.level if sp else 0


def _preorder_slot_used_for_access(
    db: Session, *, product_id: int, access: ProductAccess
) -> int:
    """Cuenta reservas vivas (PENDING/APPROVED/PAID) de jugadores en un nivel de access."""
    # Implementación simple: cuenta reservas con `access` del producto. En esta
    # versión solo nos importa el bucket NORMAL vs ELITE (Access o Pro). Si el
    # producto requiere nivel 25+, el bucket es PRO; si 15+, ELITE; sino NORMAL.
    # Aproximación: usamos el nivel del jugador al reservar para asignar bucket
    # — para no romper modelo, contamos por todas las reservas vivas del producto
    # y dejamos que el admin ajuste cupos manualmente. Esta función queda como
    # extensión futura cuando bucketizemos por player_level.
    return db.scalar(
        select(func.coalesce(func.sum(Reservation.quantity), 0)).where(
            Reservation.product_id == product_id,
            Reservation.status.in_([
                ReservationStatus.PENDING,
                ReservationStatus.APPROVED,
                ReservationStatus.PAID,
            ]),
        )
    ) or 0


def _bucket_for_level(level: int) -> str:
    """Asigna bucket de cupo preventa según nivel del jugador."""
    if level >= 25:
        return "pro"
    if level >= 15:
        return "elite"
    return "normal"


def _preorder_used_per_bucket(
    db: Session, *, product_id: int
) -> dict[str, int]:
    """Cuenta reservas vivas agrupando jugadores por bucket de nivel.

    Recorre las reservas vivas y mira el nivel actual del jugador. Es O(n) en
    cantidad de reservas — aceptable porque las preventas tienen cupos chicos.
    """
    used = {"normal": 0, "elite": 0, "pro": 0}
    rows = list(
        db.scalars(
            select(Reservation).where(
                Reservation.product_id == product_id,
                Reservation.status.in_([
                    ReservationStatus.PENDING,
                    ReservationStatus.APPROVED,
                    ReservationStatus.PAID,
                ]),
            )
        )
    )
    for r in rows:
        lv = _player_current_level(db, r.player_id)
        used[_bucket_for_level(lv)] += r.quantity
    return used


def validate_reservation_request(
    db: Session, *, player_id: int, product_id: int, quantity: int,
    variant_id: int | None = None,
) -> Product:
    """Aplica todas las validaciones de negocio. Devuelve el Product si OK.

    Levanta ReservationError con mensaje en español si algo falla.
    """
    if quantity < 1:
        raise ReservationError("La cantidad debe ser al menos 1")

    product = db.get(Product, product_id)
    if not product or not product.is_active:
        raise ReservationError("Producto no disponible")

    # Variantes: si el producto tiene variantes, exigimos variant_id; el stock
    # se valida contra la variante específica.
    variant: ProductVariant | None = None
    if product.has_variants:
        if variant_id is None:
            raise ReservationError("Este producto requiere seleccionar variante (SKU)")
        variant = db.get(ProductVariant, variant_id)
        if not variant or variant.product_id != product.id or not variant.is_active:
            raise ReservationError("Variante no disponible")
        if variant.stock < quantity:
            raise ReservationError(f"Stock insuficiente: quedan {variant.stock} unidades")
    else:
        if variant_id is not None:
            raise ReservationError("Este producto no tiene variantes")
        if product.stock < quantity:
            raise ReservationError(f"Stock insuficiente: quedan {product.stock} unidades")

    # Validar nivel del jugador
    player_level = _player_current_level(db, player_id)
    if player_level < product.required_level:
        raise ReservationError(
            f"Necesitas nivel {product.required_level} para reservar este producto "
            f"(tienes nivel {player_level or '—'} en la temporada actual)"
        )

    # Validar tipo de access
    if product.access == ProductAccess.ELITE_PRO and player_level < 25:
        raise ReservationError("Catálogo Elite Pro requiere alcanzar nivel 25 esta temporada")
    if product.access == ProductAccess.ELITE_ACCESS and player_level < 15:
        raise ReservationError("Elite Access requiere alcanzar nivel 15 esta temporada")

    # Validar cupos de preventa por bucket de nivel (40 normal / 40 elite / 20 pro
    # por defecto, configurable en el producto).
    if product.is_preorder:
        used = _preorder_used_per_bucket(db, product_id=product_id)
        bucket = _bucket_for_level(player_level)
        slot_total = {
            "normal": product.preorder_slots_normal,
            "elite": product.preorder_slots_elite,
            "pro": product.preorder_slots_pro,
        }[bucket]
        if used[bucket] + quantity > slot_total:
            remaining = max(0, slot_total - used[bucket])
            raise ReservationError(
                f"Cupos de preventa para tu nivel ({bucket.upper()}) agotados — "
                f"quedan {remaining} de {slot_total}."
            )

    # Validar límite por jugador
    if product.per_player_limit is not None:
        already = db.scalar(
            select(func.coalesce(func.sum(Reservation.quantity), 0)).where(
                Reservation.player_id == player_id,
                Reservation.product_id == product_id,
                Reservation.status.in_(
                    [
                        ReservationStatus.PENDING,
                        ReservationStatus.APPROVED,
                        ReservationStatus.PAID,
                    ]
                ),
            )
        ) or 0
        if already + quantity > product.per_player_limit:
            remaining = max(0, product.per_player_limit - already)
            raise ReservationError(
                f"Límite por jugador alcanzado para este producto "
                f"(máximo {product.per_player_limit}, te queda {remaining})"
            )

    return product


def create_reservation(
    db: Session, *, player_id: int, product_id: int, quantity: int = 1,
    note: str | None = None, variant_id: int | None = None,
) -> Reservation:
    """Crea una reserva PENDIENTE, descontando stock al instante.

    El stock se descuenta de inmediato (reserva blanda) para evitar overselling.
    Si el admin rechaza, se devuelve el stock. Si expira, también.
    """
    try:
        product = validate_reservation_request(
            db, player_id=player_id, product_id=product_id, quantity=quantity,
            variant_id=variant_id,
        )
    except ReservationError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

    # Decrementar stock: si hay variante, de la variante; sino del producto.
    if variant_id is not None:
        variant = db.get(ProductVariant, variant_id)
        if variant:
            variant.stock -= quantity
    else:
        product.stock -= quantity

    expires_at = datetime.now(timezone.utc) + timedelta(hours=DEFAULT_EXPIRATION_HOURS)
    reservation = Reservation(
        player_id=player_id,
        product_id=product_id,
        variant_id=variant_id,
        quantity=quantity,
        status=ReservationStatus.PENDING,
        expires_at=expires_at,
        note=note,
    )
    db.add(reservation)
    db.flush()

    # Mission trigger: reservar producto
    try:
        from app.services import gamification as gm
        gm.increment_mission_progress(db, player_id=player_id, mission_code="reserve_product", delta=1)
    except Exception:
        pass

    return reservation


def _restock(db: Session, reservation: Reservation) -> None:
    """Devuelve el stock al producto/variante. Solo si la reserva estaba ocupando stock."""
    if reservation.variant_id is not None:
        variant = db.get(ProductVariant, reservation.variant_id)
        if variant is not None:
            variant.stock += reservation.quantity
            return
    product = db.get(Product, reservation.product_id)
    if product is not None:
        product.stock += reservation.quantity


def _transition(reservation: Reservation, new_status: ReservationStatus) -> Reservation:
    reservation.status = new_status
    return reservation


def _notify_safe(db, **kwargs):
    try:
        from app.services import notifications as notif_svc
        notif_svc.notify(db, **kwargs)
    except Exception:
        pass


def approve(db: Session, reservation_id: int) -> Reservation:
    res = db.get(Reservation, reservation_id)
    if not res:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reserva no encontrada")
    if res.status != ReservationStatus.PENDING:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Solo se puede aprobar reservas PENDING (actual: {res.status.value})",
        )
    product = db.get(Product, res.product_id)
    _notify_safe(db, player_id=res.player_id,
                 guild_id=(product.guild_id if product else None),
                 type="reservation_approved",
                 title="Reserva aprobada",
                 body=f"Tu reserva de {product.name if product else 'producto'} fue aprobada. Procede al pago.",
                 link="/my-reservations")
    return _transition(res, ReservationStatus.APPROVED)


def reject(db: Session, reservation_id: int) -> Reservation:
    res = db.get(Reservation, reservation_id)
    if not res:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reserva no encontrada")
    if res.status not in (ReservationStatus.PENDING, ReservationStatus.APPROVED):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"No se puede rechazar una reserva {res.status.value}",
        )
    _restock(db, res)
    product = db.get(Product, res.product_id)
    _notify_safe(db, player_id=res.player_id,
                 guild_id=(product.guild_id if product else None),
                 type="reservation_rejected",
                 title="Reserva rechazada",
                 body=f"Tu reserva de {product.name if product else 'producto'} fue rechazada.",
                 link="/my-reservations")
    return _transition(res, ReservationStatus.REJECTED)


def mark_paid(db: Session, reservation_id: int) -> Reservation:
    res = db.get(Reservation, reservation_id)
    if not res:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reserva no encontrada")
    if res.status not in (ReservationStatus.PENDING, ReservationStatus.APPROVED):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Solo se puede marcar pagada una reserva PENDING o APPROVED (actual: {res.status.value})",
        )
    product = db.get(Product, res.product_id)
    _notify_safe(db, player_id=res.player_id,
                 guild_id=(product.guild_id if product else None),
                 type="reservation_paid",
                 title="Reserva pagada",
                 body=f"Pago de {product.name if product else 'producto'} confirmado.",
                 link="/my-reservations")
    return _transition(res, ReservationStatus.PAID)


def cancel(db: Session, reservation_id: int, *, by_player_id: int | None = None) -> Reservation:
    res = db.get(Reservation, reservation_id)
    if not res:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Reserva no encontrada")
    if by_player_id is not None and res.player_id != by_player_id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Esta reserva no es tuya")
    if res.status not in (ReservationStatus.PENDING, ReservationStatus.APPROVED):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"No se puede cancelar una reserva {res.status.value}",
        )
    _restock(db, res)
    return _transition(res, ReservationStatus.CANCELLED)


def expire_overdue(db: Session) -> int:
    """Marca como EXPIRED las reservas vencidas. Devuelve cantidad afectada.

    Pensado para tarea programada o llamada manual. Si se llama, también
    devuelve stock al producto.
    """
    now = datetime.now(timezone.utc)
    overdue = list(
        db.scalars(
            select(Reservation).where(
                Reservation.status == ReservationStatus.PENDING,
                Reservation.expires_at.is_not(None),
                Reservation.expires_at < now,
            )
        )
    )
    for r in overdue:
        _restock(db, r)
        r.status = ReservationStatus.EXPIRED
    return len(overdue)
