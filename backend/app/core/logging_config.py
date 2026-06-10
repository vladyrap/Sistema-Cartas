"""Structured logging — JSON con request_id, user_id, latency en cada line.

Usa python-json-logger (ya en requirements). Inyecta atributos via contextvars
que el middleware HTTP setea por request.
"""
import logging
import sys
from contextvars import ContextVar

from pythonjsonlogger import jsonlogger

# Context vars — set por middleware, leídos por el filter en cada record.
request_id_ctx: ContextVar[str | None] = ContextVar("request_id", default=None)
user_id_ctx: ContextVar[int | None] = ContextVar("user_id", default=None)


class ContextFilter(logging.Filter):
    """Inyecta request_id y user_id desde contextvars al LogRecord."""

    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_ctx.get()
        record.user_id = user_id_ctx.get()
        return True


def configure_logging(*, level: str = "INFO", json: bool = True) -> None:
    """Setea el handler root: JSON estructurado a stdout.

    json=False → formato humano para debugging local.
    """
    root = logging.getLogger()
    # Limpiar handlers previos (uvicorn agrega los suyos también)
    for h in list(root.handlers):
        root.removeHandler(h)

    handler = logging.StreamHandler(sys.stdout)
    handler.addFilter(ContextFilter())

    if json:
        fmt = jsonlogger.JsonFormatter(
            "%(asctime)s %(levelname)s %(name)s %(message)s "
            "%(request_id)s %(user_id)s %(pathname)s %(lineno)d",
            rename_fields={"levelname": "level", "asctime": "ts"},
        )
    else:
        fmt = logging.Formatter(
            "[%(asctime)s] %(levelname)s %(name)s "
            "[req=%(request_id)s user=%(user_id)s] %(message)s"
        )

    handler.setFormatter(fmt)
    root.addHandler(handler)
    root.setLevel(level)

    # uvicorn access logs también en JSON
    for name in ("uvicorn", "uvicorn.access", "uvicorn.error"):
        lg = logging.getLogger(name)
        lg.handlers = [handler]
        lg.propagate = False
