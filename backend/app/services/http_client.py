"""HTTP client robusto para APIs externas (Scryfall, Resend, Telegram, etc.).

Features:
  - Retry con exponential backoff en errores transitorios (5xx, timeout, connect).
  - NO retry en 4xx (es bug del cliente).
  - Circuit breaker simple por host: si falla N veces seguidas, abre el circuito
    por X segundos — todas las requests al host fallan rápido en lugar de pegarle
    al server caído.
  - User-Agent global identificable.

Uso:
    from app.services.http_client import client
    r = client.get("https://api.scryfall.com/cards/named?fuzzy=foo")

O context manager si necesitás múltiples requests al mismo host:
    with client.session() as s:
        r1 = s.get(url1)
        r2 = s.get(url2)
"""
import logging
import threading
import time
from contextlib import contextmanager
from urllib.parse import urlparse

import httpx

log = logging.getLogger("http_client")

USER_AGENT = "EliteCards/1.0 (https://elitecards.cl)"
DEFAULT_TIMEOUT = 8.0
MAX_RETRIES = 3
BACKOFF_BASE = 0.4  # 0.4s, 0.8s, 1.6s

# Circuit breaker state por host
_breaker: dict[str, dict] = {}
_lock = threading.Lock()
FAILURE_THRESHOLD = 5     # fallos consecutivos antes de abrir
COOLDOWN_SECONDS = 30     # cuánto dura abierto


class CircuitOpen(Exception):
    """El circuito está abierto — el host falló mucho, no le pegamos por un rato."""


def _host(url: str) -> str:
    return urlparse(url).netloc or url


def _is_open(host: str) -> bool:
    with _lock:
        st = _breaker.get(host)
        if not st or st["open_until"] <= time.time():
            return False
        return True


def _record_failure(host: str) -> None:
    with _lock:
        st = _breaker.setdefault(host, {"fails": 0, "open_until": 0.0})
        st["fails"] += 1
        if st["fails"] >= FAILURE_THRESHOLD:
            st["open_until"] = time.time() + COOLDOWN_SECONDS
            log.warning("circuit_breaker_open host=%s cooldown_s=%d", host, COOLDOWN_SECONDS)


def _record_success(host: str) -> None:
    with _lock:
        if host in _breaker:
            _breaker[host] = {"fails": 0, "open_until": 0.0}


def request(
    method: str,
    url: str,
    *,
    timeout: float = DEFAULT_TIMEOUT,
    retries: int = MAX_RETRIES,
    **kwargs,
) -> httpx.Response:
    """Como httpx.request pero con retries + circuit breaker.

    Levanta httpx.RequestError si todos los retries fallan o CircuitOpen si
    el breaker está activo.
    """
    host = _host(url)
    if _is_open(host):
        raise CircuitOpen(f"Circuit open for {host}, retry later")

    headers = kwargs.pop("headers", {}) or {}
    headers.setdefault("User-Agent", USER_AGENT)

    last_exc: Exception | None = None
    for attempt in range(retries + 1):
        try:
            with httpx.Client(timeout=timeout, follow_redirects=True) as cli:
                r = cli.request(method, url, headers=headers, **kwargs)
            # 5xx → retry; 4xx → devolver al caller (no retry)
            if r.status_code >= 500:
                last_exc = httpx.HTTPStatusError(f"{r.status_code}", request=r.request, response=r)
                if attempt < retries:
                    time.sleep(BACKOFF_BASE * (2 ** attempt))
                    continue
                _record_failure(host)
                return r
            _record_success(host)
            return r
        except (httpx.TimeoutException, httpx.ConnectError, httpx.NetworkError) as e:
            last_exc = e
            if attempt < retries:
                time.sleep(BACKOFF_BASE * (2 ** attempt))
                continue
            _record_failure(host)
            raise

    # No deberíamos llegar acá, pero por completitud
    assert last_exc is not None
    raise last_exc


def get(url: str, **kwargs) -> httpx.Response:
    return request("GET", url, **kwargs)


def post(url: str, **kwargs) -> httpx.Response:
    return request("POST", url, **kwargs)


@contextmanager
def session(timeout: float = DEFAULT_TIMEOUT):
    """Context manager para múltiples requests al mismo host. Sin retry interno —
    los callers deben manejar errores si lo necesitan."""
    with httpx.Client(
        timeout=timeout,
        headers={"User-Agent": USER_AGENT},
        follow_redirects=True,
    ) as cli:
        yield cli


def breaker_status() -> dict:
    """Estado actual de los circuit breakers — útil en /health/deep."""
    now = time.time()
    with _lock:
        return {
            host: {
                "fails": st["fails"],
                "open": st["open_until"] > now,
                "cooldown_remaining_s": max(0, int(st["open_until"] - now)),
            }
            for host, st in _breaker.items()
        }
