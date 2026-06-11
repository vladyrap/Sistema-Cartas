"""Content Engine endpoints — cola, aprobación, publicación, métricas, biblioteca."""
import json
from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy import desc, func, select

from app.core.deps import AdminDep, DbDep
from app.models import (
    ContentJob, ContentMetric, ContentPiece, ContentWinningHook, Event,
)
from app.services import content_engine as ce_svc

router = APIRouter()


def _piece_to_out(p: ContentPiece) -> dict:
    return {
        "id": p.id, "job_id": p.job_id, "event_id": p.event_id,
        "platform": p.platform, "status": p.status,
        "body": json.loads(p.edited_body_json or p.body_json),
        "original_body": json.loads(p.body_json),
        "was_edited": p.edited_body_json is not None,
        "generation": p.generation, "revision_note": p.revision_note,
        "writer_model": p.writer_model,
        "published_url": p.published_url,
        "published_at": p.published_at.isoformat() if p.published_at else None,
        "impact_score": p.impact_score,
        "created_at": p.created_at.isoformat(),
    }


def _job_to_out(db, j: ContentJob, with_pieces: bool = False) -> dict:
    ev = db.get(Event, j.event_id)
    out = {
        "id": j.id, "event_id": j.event_id,
        "event_name": ev.name if ev else f"#{j.event_id}",
        "status": j.status, "error": j.error, "retries": j.retries,
        "analysis_model": j.analysis_model,
        "created_at": j.created_at.isoformat(),
    }
    if with_pieces:
        # Última generación por plataforma
        pieces = list(db.scalars(select(ContentPiece).where(
            ContentPiece.job_id == j.id
        ).order_by(ContentPiece.platform, desc(ContentPiece.generation))))
        latest: dict[str, ContentPiece] = {}
        for p in pieces:
            latest.setdefault(p.platform, p)
        out["pieces"] = [_piece_to_out(p) for p in latest.values()]
        out["brief"] = json.loads(j.brief_json) if j.brief_json else None
    return out


# ═══════════════════════ JOBS ═══════════════════════


@router.post("/jobs/{event_id}/trigger")
def trigger_job(event_id: int, admin: AdminDep, db: DbDep,
                regenerate: bool = Query(default=False)) -> dict:
    """Encola (o re-encola con regenerate=true) el job del evento."""
    ev = db.get(Event, event_id)
    if not ev:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Evento no existe")
    existing = db.scalar(select(ContentJob).where(ContentJob.event_id == event_id))
    if existing and regenerate:
        existing.status = "PENDING"
        existing.retries = 0
        existing.error = None
        db.commit()
        return {"ok": True, "job_id": existing.id, "requeued": True}
    if existing:
        return {"ok": True, "job_id": existing.id, "already_exists": True,
                "status": existing.status}
    job = ce_svc.enqueue_job(db, event_id=event_id)
    db.commit()
    return {"ok": True, "job_id": job.id}


@router.post("/jobs/{job_id}/run-now")
def run_job_now(job_id: int, admin: AdminDep, db: DbDep) -> dict:
    """Procesa el job síncrono (sin esperar al runner de 2 min)."""
    job = db.get(ContentJob, job_id)
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job no existe")
    job = ce_svc.process_job(db, job=job)
    db.commit()
    return {"ok": True, "status": job.status, "error": job.error}


@router.get("/jobs")
def list_jobs(admin: AdminDep, db: DbDep, status_filter: str | None = None,
              limit: int = 20) -> list[dict]:
    stmt = select(ContentJob).order_by(desc(ContentJob.created_at)).limit(limit)
    if status_filter:
        stmt = stmt.where(ContentJob.status == status_filter)
    return [_job_to_out(db, j) for j in db.scalars(stmt)]


@router.get("/jobs/{job_id}")
def get_job(job_id: int, admin: AdminDep, db: DbDep) -> dict:
    job = db.get(ContentJob, job_id)
    if not job:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Job no existe")
    return _job_to_out(db, job, with_pieces=True)


# ═══════════════════════ PIEZAS ═══════════════════════


@router.post("/pieces/{piece_id}/approve")
def approve_piece(piece_id: int, admin: AdminDep, db: DbDep) -> dict:
    p = db.get(ContentPiece, piece_id)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pieza no existe")
    p.status = "APPROVED"
    p.approved_by_user_id = admin.id
    p.approved_at = datetime.now(timezone.utc)
    db.commit()
    return _piece_to_out(p)


class RejectIn(BaseModel):
    note: str | None = Field(default=None, max_length=500)


@router.post("/pieces/{piece_id}/reject")
def reject_piece(piece_id: int, payload: RejectIn, admin: AdminDep, db: DbDep) -> dict:
    p = db.get(ContentPiece, piece_id)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pieza no existe")
    p.status = "REJECTED"
    p.revision_note = payload.note
    db.commit()
    return _piece_to_out(p)


@router.post("/pieces/{piece_id}/regenerate")
def regenerate_piece(piece_id: int, payload: RejectIn, admin: AdminDep, db: DbDep) -> dict:
    """Nueva generación de la pieza con feedback del editor."""
    p = db.get(ContentPiece, piece_id)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pieza no existe")
    job = db.get(ContentJob, p.job_id)
    if not job or not job.brief_json:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Job sin brief — regenerá el job completo")
    brief = json.loads(job.brief_json)
    prev_body = json.loads(p.edited_body_json or p.body_json)
    try:
        new_body = ce_svc.generate_piece_body(
            db, brief=brief, platform=p.platform,
            revision_note=payload.note, previous_body=prev_body,
        )
    except RuntimeError as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, str(e))
    p.status = "REJECTED"  # la vieja queda en historial
    new_p = ContentPiece(
        job_id=p.job_id, event_id=p.event_id, platform=p.platform,
        body_json=json.dumps(new_body, ensure_ascii=False),
        status="DRAFT", revision_note=payload.note,
        generation=p.generation + 1,
        writer_model=p.writer_model,
    )
    db.add(new_p)
    db.commit()
    db.refresh(new_p)
    return _piece_to_out(new_p)


class EditIn(BaseModel):
    body: dict


@router.patch("/pieces/{piece_id}")
def edit_piece(piece_id: int, payload: EditIn, admin: AdminDep, db: DbDep) -> dict:
    p = db.get(ContentPiece, piece_id)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pieza no existe")
    p.edited_body_json = json.dumps(payload.body, ensure_ascii=False)
    db.commit()
    return _piece_to_out(p)


@router.post("/pieces/{piece_id}/publish-discord")
def publish_discord(piece_id: int, admin: AdminDep, db: DbDep) -> dict:
    """Publica la pieza de Discord vía el webhook ya integrado."""
    p = db.get(ContentPiece, piece_id)
    if not p or p.platform != "discord":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Pieza Discord no encontrada")
    body = json.loads(p.edited_body_json or p.body_json)
    ev = db.get(Event, p.event_id)
    from app.models import Guild
    guild = db.get(Guild, ev.guild_id) if ev else None
    if not guild or not guild.discord_webhook_url:
        raise HTTPException(status.HTTP_400_BAD_REQUEST,
                            "El gremio del evento no tiene Discord webhook configurado")
    try:
        from app.services.notify_external import send_discord_webhook
        campos = "\n".join(f"**{c.get('nombre')}**: {c.get('valor')}"
                           for c in body.get("campos", []))
        embed = {
            "title": body.get("embed_titulo", "")[:250],
            "description": f"{body.get('embed_descripcion_md', '')}\n\n{campos}"[:3800],
            "color": 0x7C5CFF,
        }
        sent = send_discord_webhook(
            guild.discord_webhook_url,
            content=body.get("mensaje_arriba", "")[:1900] or None,
            embed=embed,
        )
        if not sent:
            raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Discord webhook falló")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, f"Discord falló: {type(e).__name__}")
    p.status = "PUBLISHED"
    p.published_at = datetime.now(timezone.utc)
    db.commit()
    return _piece_to_out(p)


class PublishIn(BaseModel):
    url: str | None = Field(default=None, max_length=800)


@router.post("/pieces/{piece_id}/mark-published")
def mark_published(piece_id: int, payload: PublishIn, admin: AdminDep, db: DbDep) -> dict:
    p = db.get(ContentPiece, piece_id)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pieza no existe")
    p.status = "PUBLISHED"
    p.published_at = datetime.now(timezone.utc)
    p.published_url = payload.url
    db.commit()
    return _piece_to_out(p)


class MetricsIn(BaseModel):
    views: int = Field(default=0, ge=0)
    likes: int = Field(default=0, ge=0)
    comments: int = Field(default=0, ge=0)
    shares: int = Field(default=0, ge=0)
    saves: int = Field(default=0, ge=0)


@router.post("/pieces/{piece_id}/metrics")
def add_metrics(piece_id: int, payload: MetricsIn, admin: AdminDep, db: DbDep) -> dict:
    p = db.get(ContentPiece, piece_id)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Pieza no existe")
    if p.status != "PUBLISHED":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Solo piezas publicadas llevan métricas")
    out = ce_svc.record_metrics(db, piece=p, **payload.model_dump())
    db.commit()
    return {"ok": True, **out}


# ═══════════════════════ BIBLIOTECA + ANALYTICS ═══════════════════════


@router.get("/library")
def library(admin: AdminDep, db: DbDep, platform: str | None = None,
            piece_status: str | None = None, min_sis: float | None = None,
            limit: int = 50) -> list[dict]:
    stmt = select(ContentPiece).order_by(desc(ContentPiece.created_at)).limit(limit)
    if platform:
        stmt = stmt.where(ContentPiece.platform == platform)
    if piece_status:
        stmt = stmt.where(ContentPiece.status == piece_status)
    if min_sis is not None:
        stmt = stmt.where(ContentPiece.impact_score >= min_sis)
    pieces = list(db.scalars(stmt))
    event_names = dict(db.execute(
        select(Event.id, Event.name).where(Event.id.in_({p.event_id for p in pieces}))
    ).all()) if pieces else {}
    out = []
    for p in pieces:
        d = _piece_to_out(p)
        d["event_name"] = event_names.get(p.event_id, f"#{p.event_id}")
        out.append(d)
    return out


@router.get("/analytics")
def analytics(admin: AdminDep, db: DbDep) -> dict:
    """SIS agregados por plataforma + top performers + winning hooks."""
    published = list(db.scalars(select(ContentPiece).where(
        ContentPiece.status == "PUBLISHED",
        ContentPiece.impact_score.is_not(None),
    )))
    by_platform: dict[str, list[float]] = {}
    for p in published:
        by_platform.setdefault(p.platform, []).append(p.impact_score)
    platform_stats = [{
        "platform": k,
        "pieces": len(v),
        "avg_sis": round(sum(v) / len(v), 1),
        "best_sis": round(max(v), 1),
    } for k, v in by_platform.items()]

    top = sorted(published, key=lambda p: -(p.impact_score or 0))[:10]
    event_names = dict(db.execute(
        select(Event.id, Event.name).where(Event.id.in_({p.event_id for p in top}))
    ).all()) if top else {}
    top_out = [{
        "piece_id": p.id, "platform": p.platform,
        "event_name": event_names.get(p.event_id),
        "impact_score": p.impact_score,
        "published_url": p.published_url,
    } for p in top]

    hooks = [{
        "platform": h.platform, "hook": h.hook_text, "sis": h.impact_score,
    } for h in db.scalars(select(ContentWinningHook)
                          .order_by(desc(ContentWinningHook.impact_score)).limit(15))]

    return {"platforms": platform_stats, "top_performers": top_out,
            "winning_hooks": hooks, "total_published": len(published)}
