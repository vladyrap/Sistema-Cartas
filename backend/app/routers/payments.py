"""Pagos con MercadoPago Checkout Pro.

Flow:
1. Jugador reservó producto y admin lo aprobó → status APPROVED.
2. Jugador click "Pagar" → POST /api/payments/reservation/{id}/start
3. Backend crea MP preference con el access_token del Gremio dueño del producto.
4. Backend devuelve init_point. Frontend redirige.
5. Usuario paga en MP → MP llama POST /api/payments/mercadopago/webhook con payment_id.
6. Backend consulta el payment, valida que external_reference == reservation_id,
   y marca status=PAID + paid_at.
7. Usuario es redirigido de vuelta al frontend (/payments/return) con confirmación.
"""
import logging
from datetime import datetime, timezone
from fastapi import APIRouter, HTTPException, Request, status as http_status
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import DbDep, UserDep
from app.models import Guild, Product, Reservation, ReservationStatus
from app.schemas.common import CreatePaymentOut
from app.services import mercadopago as mp_svc
from app.services import notifications as notif_svc

log = logging.getLogger("payments")
router = APIRouter()


@router.post("/reservation/{reservation_id}/start", response_model=CreatePaymentOut)
def start_payment(reservation_id: int, request: Request, db: DbDep, current: UserDep) -> CreatePaymentOut:
    """Crea una preference de MP para una reserva APPROVED del jugador."""
    if not current.profile:
        raise HTTPException(http_status.HTTP_400_BAD_REQUEST, "Sin perfil")

    res = db.get(Reservation, reservation_id)
    if not res or res.player_id != current.profile.id:
        raise HTTPException(http_status.HTTP_404_NOT_FOUND, "Reserva no encontrada")
    if res.status != ReservationStatus.APPROVED:
        raise HTTPException(
            http_status.HTTP_400_BAD_REQUEST,
            f"Solo se puede pagar reservas APPROVED (estado actual: {res.status.value})",
        )

    product = db.get(Product, res.product_id)
    if not product:
        raise HTTPException(http_status.HTTP_400_BAD_REQUEST, "Producto no existe")
    guild = db.get(Guild, product.guild_id)
    if not guild:
        raise HTTPException(http_status.HTTP_400_BAD_REQUEST, "Gremio no existe")

    # back_urls: frontend público + notification_url al backend
    front_base = settings.frontend_url.rstrip("/")
    pref = mp_svc.create_preference(
        access_token=guild.mp_access_token,
        items=[{
            "title": product.name,
            "quantity": res.quantity,
            "unit_price": int(product.price_clp),
            "currency_id": "CLP",
        }],
        external_reference=str(res.id),
        back_urls={
            "success": f"{front_base}/payments/return?status=success",
            "failure": f"{front_base}/payments/return?status=failure",
            "pending": f"{front_base}/payments/return?status=pending",
        },
        notification_url=f"{str(request.base_url).rstrip('/')}/api/payments/mercadopago/webhook",
    )

    res.mp_preference_id = pref.get("id")
    db.commit()
    return CreatePaymentOut(
        init_point=pref.get("init_point") or pref.get("sandbox_init_point") or "",
        preference_id=pref.get("id") or "",
        mock=pref.get("mock", False),
    )


@router.post("/mercadopago/webhook")
async def mercadopago_webhook(request: Request, db: DbDep) -> dict:
    """Recibe notificaciones de MP. Valida firma + actualiza la reserva."""
    body = await request.json() if request.headers.get("content-type", "").startswith("application/json") else {}
    # MP también puede mandar topic+id como query params; soportamos ambos
    qp = dict(request.query_params)
    topic = qp.get("topic") or qp.get("type") or body.get("type")
    data_id = qp.get("id") or (body.get("data") or {}).get("id")

    if topic != "payment" or not data_id:
        return {"received": True, "ignored": True}

    # Validación de firma (best-effort: si no hay secret, lo dejamos pasar con warn)
    secret = settings.mp_webhook_secret if hasattr(settings, "mp_webhook_secret") else None
    sig_header = request.headers.get("x-signature")
    req_id = request.headers.get("x-request-id")
    ts = None
    if sig_header:
        parts = dict(p.split("=", 1) for p in sig_header.split(",") if "=" in p)
        ts = parts.get("ts")
    ok = mp_svc.verify_webhook_signature(
        secret=secret, request_id=req_id, data_id=str(data_id), ts=ts, sig_header=sig_header,
    )
    if not ok:
        raise HTTPException(http_status.HTTP_401_UNAUTHORIZED, "Firma inválida")

    # Como no sabemos a priori qué Gremio es, primero buscamos la reserva por mp_preference_id
    # vía MP API (necesitamos el access_token). Esto es chicken-and-egg: necesitamos saber
    # qué token usar para consultar el payment. Workaround: cada Gremio activo tiene un solo
    # token; los webhooks no llegarán si MP no se llamó. Probamos con el primer Gremio que
    # tenga token configurado (en prod, MP webhook URL incluiría el guild_id como query).
    guilds_with_token = list(db.scalars(
        select(Guild).where(Guild.mp_access_token.is_not(None))
    ))
    payment = None
    used_token = None
    for g in guilds_with_token:
        p = mp_svc.get_payment(str(data_id), g.mp_access_token)
        if p and p.get("external_reference"):
            payment = p
            used_token = g.mp_access_token
            break

    if not payment:
        log.warning("Payment %s no resoluble con ningún token. Ignorando.", data_id)
        return {"received": True, "resolved": False}

    ext_ref = payment.get("external_reference")
    try:
        reservation_id = int(ext_ref)
    except (TypeError, ValueError):
        return {"received": True, "ignored": "invalid_external_reference"}

    res = db.get(Reservation, reservation_id)
    if not res:
        return {"received": True, "ignored": "reservation_not_found"}

    payment_status = payment.get("status")
    res.mp_payment_id = str(data_id)
    if payment_status == "approved" and res.status != ReservationStatus.PAID:
        res.status = ReservationStatus.PAID
        res.paid_at = datetime.now(timezone.utc)
        # Notif
        notif_svc.notify(
            db, player_id=res.player_id,
            type="reservation_paid",
            title="Pago confirmado ✓",
            body=f"MercadoPago confirmó tu pago. Reserva #{res.id}.",
            link="/my-reservations",
        )
    db.commit()
    return {"received": True, "reservation_id": reservation_id, "payment_status": payment_status}
