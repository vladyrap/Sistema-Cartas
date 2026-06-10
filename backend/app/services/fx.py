"""FX rate service — mantiene USD→CLP actualizado cada día.

Fuente: frankfurter.app (free, sin auth, sin rate limit estricto).
Si la API falla, mantiene el último valor cacheado (que cae al default del env).
"""
from __future__ import annotations

import logging
import os
import threading
from datetime import datetime, timezone

import httpx

log = logging.getLogger("fx")

# open.er-api.com es free, sin auth, sin rate limit estricto, e incluye CLP.
FX_API_URL = "https://open.er-api.com/v6/latest/USD"
DEFAULT_USD_CLP = float(os.getenv("USD_CLP_RATE", "950"))

# State protegido con lock (scheduler corre en otro thread)
_state = {"rate": DEFAULT_USD_CLP, "updated_at": None, "source": "default"}
_lock = threading.Lock()


def get_usd_clp() -> float:
    """Devuelve el tipo de cambio actual (cacheado)."""
    with _lock:
        return _state["rate"]


def get_fx_status() -> dict:
    with _lock:
        return {
            "usd_clp": _state["rate"],
            "updated_at": _state["updated_at"].isoformat() if _state["updated_at"] else None,
            "source": _state["source"],
        }


def refresh() -> float | None:
    """Pega a la API FX y actualiza el cache. Devuelve el nuevo rate o None si falló."""
    try:
        with httpx.Client(timeout=5.0, follow_redirects=True) as cli:
            r = cli.get(FX_API_URL)
        r.raise_for_status()
        rate = float((r.json() or {}).get("rates", {}).get("CLP"))
    except Exception as e:
        log.warning("FX refresh failed: %s", e)
        return None
    if rate <= 0:
        return None
    with _lock:
        _state["rate"] = rate
        _state["updated_at"] = datetime.now(timezone.utc)
        _state["source"] = "open.er-api.com"
    log.info("FX rate actualizado: USD-CLP = %.2f", rate)
    return rate
