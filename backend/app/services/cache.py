"""Cache in-memory con TTL + invalidación por prefijo.

Patrón cache-aside: el caller pasa una función `compute` que se ejecuta solo
si la key está fría. Útil para standings/rankings/leaderboards que son caros
de calcular pero cambian solo en eventos puntuales.

Thread-safe vía lock. En multi-worker producción habría que respaldarlo con
Redis — el package `redis` ya está en requirements.
"""
from __future__ import annotations

import logging
import threading
import time
from dataclasses import dataclass
from typing import Any, Callable, TypeVar

logger = logging.getLogger(__name__)

T = TypeVar("T")


@dataclass
class _Entry:
    value: Any
    expires_at: float


class TTLCache:
    def __init__(self) -> None:
        self._store: dict[str, _Entry] = {}
        self._lock = threading.Lock()
        self._stats = {"hits": 0, "misses": 0, "evictions": 0}

    def get(self, key: str) -> Any | None:
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                self._stats["misses"] += 1
                return None
            if time.time() >= entry.expires_at:
                self._store.pop(key, None)
                self._stats["evictions"] += 1
                self._stats["misses"] += 1
                return None
            self._stats["hits"] += 1
            return entry.value

    def set(self, key: str, value: Any, *, ttl_seconds: float = 60.0) -> None:
        with self._lock:
            self._store[key] = _Entry(value=value, expires_at=time.time() + ttl_seconds)

    def get_or_compute(
        self, key: str, compute: Callable[[], T], *, ttl_seconds: float = 60.0
    ) -> T:
        v = self.get(key)
        if v is not None:
            return v
        v = compute()
        self.set(key, v, ttl_seconds=ttl_seconds)
        return v

    def invalidate(self, key: str) -> bool:
        with self._lock:
            return self._store.pop(key, None) is not None

    def invalidate_prefix(self, prefix: str) -> int:
        with self._lock:
            keys = [k for k in self._store if k.startswith(prefix)]
            for k in keys:
                self._store.pop(k, None)
            return len(keys)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()
            self._stats = {"hits": 0, "misses": 0, "evictions": 0}

    def stats(self) -> dict:
        with self._lock:
            total = self._stats["hits"] + self._stats["misses"]
            hit_rate = (self._stats["hits"] / total) if total else 0.0
            return {**self._stats, "size": len(self._store), "hit_rate": round(hit_rate, 3)}


# Singleton compartido.
cache = TTLCache()


# ============================== Helpers de invalidación por evento ==============================


def invalidate_event(event_id: int) -> None:
    cache.invalidate_prefix(f"event:{event_id}:")


def invalidate_game_rating(game_id: int) -> None:
    cache.invalidate(f"rating_lb:{game_id}")


def invalidate_all_rankings() -> None:
    cache.invalidate_prefix("ranking:")
