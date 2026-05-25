"""Rate limiter compartido entre main.py y routers.

Se monta una sola vez en main.py vía `app.state.limiter`. Los routers usan
`@limiter.limit("...")` directamente.
"""
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address, default_limits=["200/minute"])
