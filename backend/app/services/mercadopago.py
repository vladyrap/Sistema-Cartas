"""Servicio MercadoPago con backend pluggable.

- `real`: usa el SDK oficial. Cada Gremio configura su MP_ACCESS_TOKEN propio
  (cada tienda cobra a su nombre). Para sandbox MP, basta con un token TEST-...
- `mock`: devuelve init_point fake para dev sin credenciales. Útil para CI y
  para construir el flow sin tocar MP.

Patrón: el caller invoca `create_preference()` con metadata, el backend decide.
Para webhooks reales: MP firma con HMAC y manda x-signature; lo validamos.
"""
from __future__ import annotations

import hashlib
import hmac
import logging
import os
import secrets

from app.core.config import settings

log = logging.getLogger("mercadopago")


def _backend() -> str:
    """Modo: real o mock."""
    if os.environ.get("MP_BACKEND", "mock").lower() == "real":
        return "real"
    return "mock"


def create_preference(
    *,
    access_token: str | None,
    items: list[dict],
    external_reference: str,
    back_urls: dict[str, str],
    notification_url: str | None = None,
) -> dict:
    """Crea una preference MP. Devuelve {id, init_point, sandbox_init_point}.

    `items`: lista de dicts con keys: title, quantity, unit_price (CLP int), currency_id.
    `external_reference`: identificador interno (reservation_id como str).
    `back_urls`: {success, failure, pending} — URLs del frontend.
    """
    if _backend() == "mock" or not access_token:
        # Devuelve fake init_point que redirige a una página interna de demo
        fake_id = "MOCK-" + secrets.token_urlsafe(8)
        return {
            "id": fake_id,
            "init_point": f"{settings.frontend_url}/payments/return?status=mock&pref={fake_id}&external_reference={external_reference}",
            "sandbox_init_point": f"{settings.frontend_url}/payments/return?status=mock&pref={fake_id}",
            "mock": True,
        }

    try:
        import mercadopago
        sdk = mercadopago.SDK(access_token)
        preference_data: dict = {
            "items": items,
            "external_reference": external_reference,
            "back_urls": back_urls,
            "auto_return": "approved",
        }
        if notification_url:
            preference_data["notification_url"] = notification_url
        resp = sdk.preference().create(preference_data)
        return resp.get("response", {})
    except Exception as e:
        log.exception("Error al crear preference MP: %s", e)
        raise


def get_payment(payment_id: str, access_token: str) -> dict | None:
    """Consulta detalle de un payment."""
    if _backend() == "mock" or not access_token:
        return {
            "id": payment_id, "status": "approved",
            "external_reference": "mock", "transaction_amount": 0,
            "mock": True,
        }
    try:
        import mercadopago
        sdk = mercadopago.SDK(access_token)
        resp = sdk.payment().get(payment_id)
        return resp.get("response", {})
    except Exception as e:
        log.exception("Error al consultar payment %s: %s", payment_id, e)
        return None


def verify_webhook_signature(
    *, secret: str | None, request_id: str | None,
    data_id: str | None, ts: str | None, sig_header: str | None,
) -> bool:
    """Valida la firma HMAC del webhook de MP.

    MP envía `x-signature: ts=<>,v1=<sha256_hex>` y `x-request-id`.
    Firma de: f"id:{data_id};request-id:{request_id};ts:{ts};"

    Si no hay secret configurado, devolvemos True (permitimos en dev) pero
    loggeamos warning.
    """
    if not secret:
        log.warning("MP webhook signature no validable: sin secret. OK para dev.")
        return True
    if not (sig_header and ts and data_id and request_id):
        return False
    # Parse "ts=xxx,v1=yyy"
    parts = dict(p.split("=", 1) for p in sig_header.split(",") if "=" in p)
    expected = parts.get("v1")
    if not expected:
        return False
    payload = f"id:{data_id};request-id:{request_id};ts:{ts};"
    computed = hmac.new(secret.encode(), payload.encode(), hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, computed)
