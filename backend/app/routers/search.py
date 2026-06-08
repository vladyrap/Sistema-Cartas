"""Endpoints de búsqueda full-text + status del scheduler."""
from __future__ import annotations

from pydantic import BaseModel
from fastapi import APIRouter, Query

from app.core.deps import AdminDep, DbDep
from app.services import scheduler as sched_svc
from app.services import search as search_svc
from app.services.cache import cache

router = APIRouter()


class SearchHit(BaseModel):
    kind: str
    ref_id: int
    title: str
    snippet: str | None = None
    rank: float


@router.get("/search", response_model=list[SearchHit])
def search(
    q: str = Query(min_length=2, max_length=80),
    kind: str | None = Query(default=None, pattern="^(player|deck|product|game)$"),
    limit: int = Query(default=20, ge=1, le=50),
) -> list[SearchHit]:
    """Búsqueda FTS5 cross-recursos. Tokeniza autocomplete-friendly.
    Devuelve resultados ordenados por relevancia BM25."""
    hits = search_svc.search(q, kind=kind, limit=limit)
    return [SearchHit(**h) for h in hits]


# ============================== Admin ==============================


admin_router = APIRouter()


@admin_router.get("/scheduler/status")
def scheduler_status(admin: AdminDep) -> dict:
    """Devuelve los jobs registrados y su próximo run."""
    return {"jobs": sched_svc.jobs_info()}


@admin_router.post("/scheduler/run/{job_id}")
def run_job_manually(job_id: str, admin: AdminDep) -> dict:
    """Dispara un job manualmente (útil para debugging y ops)."""
    job_map = {
        "expire_reservations": sched_svc.job_expire_reservations,
        "cache_sweep": sched_svc.job_cache_sweep,
        "purge_auth_tokens": sched_svc.job_purge_old_auth_tokens,
        "auto_close_events": sched_svc.job_auto_close_overdue_events,
        "rebuild_search": sched_svc.job_rebuild_search_index,
    }
    fn = job_map.get(job_id)
    if not fn:
        return {"ok": False, "error": f"job_id '{job_id}' no existe"}
    fn()
    return {"ok": True, "job_id": job_id}


@admin_router.get("/cache/stats")
def cache_stats(admin: AdminDep) -> dict:
    return cache.stats()


@admin_router.post("/cache/clear")
def cache_clear(admin: AdminDep) -> dict:
    cache.clear()
    return {"cleared": True}


@admin_router.post("/search/rebuild")
def search_rebuild(admin: AdminDep) -> dict:
    """Rebuild full del índice FTS5. Lento — solo úsalo en ops manuales."""
    n = search_svc.rebuild_index()
    return {"indexed": n}
