"""Content Engine — harvest de datos, análisis (Sonnet), escritura (Fable),
Social Impact Score y winning hooks.

La IA nunca inventa: el analista solo trabaja con el harvest verificado y el
escritor solo con el brief. En modo mock (sin API key) genera templates con
placeholders — el flujo completo es probable en dev.
"""
from __future__ import annotations

import json
import logging
import statistics
from datetime import datetime, timezone

from sqlalchemy import desc, func, select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import (
    ContentJob, ContentMetric, ContentPiece, ContentWinningHook, Event, Game,
    EventRegistration, MatchResult, PlayerProfile, PlayerRivalry,
    SpectatorPick, TournamentAchievement, TournamentHypeEvent,
    TournamentPrediction, TournamentStoryline,
)
from app.models.content_engine import PLATFORMS

log = logging.getLogger("content_engine")

MAX_RETRIES = 3


def _is_mock() -> bool:
    return settings.ai_backend != "anthropic" or not settings.anthropic_api_key


# ═══════════════════════════ ENQUEUE ═══════════════════════════


def enqueue_job(db: Session, *, event_id: int) -> ContentJob | None:
    """Crea el ContentJob si no existe (idempotente — re-finalize no duplica)."""
    existing = db.scalar(select(ContentJob).where(ContentJob.event_id == event_id))
    if existing:
        return existing
    job = ContentJob(event_id=event_id, status="PENDING")
    db.add(job)
    db.flush()
    log.info("content job enqueued event=%d", event_id)
    return job


# ═══════════════════════════ HARVEST (0 tokens) ═══════════════════════════


def harvest_event_data(db: Session, *, event_id: int) -> dict:
    """Recolecta TODO lo narrable del torneo en un dict auditable."""
    ev = db.get(Event, event_id)
    if not ev:
        raise ValueError("Evento no encontrado")
    game = db.get(Game, ev.game_id)

    alias_cache: dict[int, str] = {}

    def alias(pid: int | None) -> str | None:
        if pid is None:
            return None
        if pid not in alias_cache:
            p = db.get(PlayerProfile, pid)
            alias_cache[pid] = p.alias if p else f"#{pid}"
        return alias_cache[pid]

    # Top 8 con récords
    regs = list(db.scalars(select(EventRegistration).where(
        EventRegistration.event_id == event_id,
        EventRegistration.final_position.is_not(None),
    ).order_by(EventRegistration.final_position).limit(8)))
    top8 = [{
        "pos": r.final_position, "alias": alias(r.player_id),
        "record": f"{r.rounds_won}W-{r.rounds_lost}L-{r.rounds_draw}D",
        "match_points": r.match_points,
    } for r in regs]

    # Camino del campeón ronda por ronda
    champion = regs[0] if regs and regs[0].final_position == 1 else None
    champ_path = []
    if champion:
        c_matches = list(db.scalars(select(MatchResult).where(
            MatchResult.event_id == event_id,
            ((MatchResult.player_a_id == champion.player_id)
             | (MatchResult.player_b_id == champion.player_id)),
            MatchResult.reported_at.is_not(None),
        ).order_by(MatchResult.round_number)))
        for m in c_matches:
            if m.is_bye:
                champ_path.append(f"R{m.round_number}: bye")
                continue
            opp = m.player_b_id if m.player_a_id == champion.player_id else m.player_a_id
            won = m.winner_id == champion.player_id
            score = f"{m.games_a}-{m.games_b}" if m.player_a_id == champion.player_id else f"{m.games_b}-{m.games_a}"
            verb = "venció a" if won else ("empató con" if m.is_draw else "perdió con")
            champ_path.append(f"R{m.round_number}: {verb} {alias(opp)} {score}")

    # MVP global: voto más repetido entre todas las rondas
    mvp_rows = db.execute(
        select(SpectatorPick.picked_player_id, func.count(SpectatorPick.id))
        .where(SpectatorPick.event_id == event_id)
        .group_by(SpectatorPick.picked_player_id)
        .order_by(desc(func.count(SpectatorPick.id))).limit(1)
    ).first()
    mvp = {"alias": alias(mvp_rows[0]), "votos": int(mvp_rows[1])} if mvp_rows else None

    # Rivalidad destacada: par del evento con rivalry más intensa (3+ matches)
    rivalry = None
    pids = [r.player_id for r in regs]
    if len(pids) >= 2:
        riv = db.scalar(select(PlayerRivalry).where(
            PlayerRivalry.player_low_id.in_(pids),
            PlayerRivalry.player_high_id.in_(pids),
            PlayerRivalry.matches_count >= 3,
        ).order_by(desc(PlayerRivalry.intensity_score)))
        if riv:
            rivalry = {
                "jugadores": [alias(riv.player_low_id), alias(riv.player_high_id)],
                "matches_historicos": riv.matches_count,
                "h2h": f"{riv.wins_low}-{riv.wins_high}" + (f"-{riv.draws}E" if riv.draws else ""),
            }

    # Achievements del evento (con título del catálogo)
    from app.services.tournament_universe import ACHIEVEMENTS
    achs = list(db.scalars(select(TournamentAchievement).where(
        TournamentAchievement.event_id == event_id
    ).order_by(desc(TournamentAchievement.created_at)).limit(10)))
    achievements = []
    for a in achs:
        d = ACHIEVEMENTS.get(a.achievement_key)
        if d:
            achievements.append({"jugador": alias(a.player_id), "logro": d.title,
                                 "rareza": d.rarity})

    # Storyline existente (Fable ya la escribió — el escritor la cita, no re-crea)
    story = db.scalar(select(TournamentStoryline).where(
        TournamentStoryline.event_id == event_id
    ))

    # Hype: top 3 posts por reacciones (voz de la comunidad)
    hype = list(db.scalars(select(TournamentHypeEvent).where(
        TournamentHypeEvent.event_id == event_id
    ).order_by(desc(TournamentHypeEvent.reactions_count)).limit(3)))

    # Predicciones: ¿el público acertó al campeón?
    pred_stats = None
    if champion:
        total_preds = db.scalar(select(func.count(TournamentPrediction.id)).where(
            TournamentPrediction.event_id == event_id,
            TournamentPrediction.target_kind == "champion",
        )) or 0
        correct = db.scalar(select(func.count(TournamentPrediction.id)).where(
            TournamentPrediction.event_id == event_id,
            TournamentPrediction.target_kind == "champion",
            TournamentPrediction.predicted_winner_id == champion.player_id,
        )) or 0
        if total_preds:
            pred_stats = {"total": int(total_preds), "acertaron": int(correct),
                          "pct": round(correct / total_preds * 100)}

    total_players = db.scalar(select(func.count(EventRegistration.id)).where(
        EventRegistration.event_id == event_id
    )) or 0
    rounds = db.scalar(select(func.coalesce(func.max(MatchResult.round_number), 0)).where(
        MatchResult.event_id == event_id
    )) or 0

    return {
        "evento": {"nombre": ev.name, "juego": game.name if game else "TCG",
                   "fecha": ev.starts_at.strftime("%d/%m/%Y"),
                   "jugadores": int(total_players), "rondas": int(rounds)},
        "campeon": {"alias": alias(champion.player_id),
                    "record": top8[0]["record"], "camino": champ_path} if champion else None,
        "top8": top8,
        "mvp": mvp,
        "rivalidad": rivalry,
        "logros": achievements,
        "storyline_extracto": (story.narrative[:600] + "…") if story and story.narrative else None,
        "hype_comunidad": [{"texto": h.content[:200], "reacciones": h.reactions_count} for h in hype],
        "predicciones": pred_stats,
    }


# ═══════════════════════════ ANALISTA (Sonnet) ═══════════════════════════

ANALYST_SYSTEM = """Sos el analista de contenido de EliteCards, comunidad competitiva de TCG en Chile.
Recibís datos verificados de un torneo y producís un brief editorial en JSON.
REGLAS DURAS:
1. SOLO usás los datos provistos. Campo sin datos → null o [].
2. No inventás cifras, nombres ni resultados.
3. Elegís UN ángulo emocional dominante basado en evidencia.
4. fun_facts verificables desde los datos.
Output: SOLO el JSON, sin markdown."""

BRIEF_SCHEMA_HINT = """{
  "headline_angle": "upset|dominio|remontada|rivalidad|debut|comunidad",
  "headline": "1 línea, máx 80 chars, sin emojis",
  "champion": {"alias": "", "record": "", "camino": [], "dato_destacado": ""},
  "mvp": {"alias": "", "votos": 0, "por_que": ""},
  "top8": [{"pos": 1, "alias": "", "record": ""}],
  "key_moments": [{"ronda": "", "descripcion": ""}],
  "rivalry_highlight": {"jugadores": [], "historia": "", "resultado": ""},
  "achievements_highlight": [{"jugador": "", "logro": "", "rareza": ""}],
  "fun_facts": [],
  "emotional_hook": "máx 100 chars",
  "hashtags": [],
  "cta_sugerido": ""
}"""


def _mock_brief(harvest: dict) -> dict:
    champ = (harvest.get("campeon") or {}).get("alias") or "{{campeón}}"
    return {
        "headline_angle": "dominio",
        "headline": f"{champ} se queda con {harvest['evento']['nombre']}",
        "champion": harvest.get("campeon"),
        "mvp": harvest.get("mvp"),
        "top8": harvest.get("top8", []),
        "key_moments": [],
        "rivalry_highlight": harvest.get("rivalidad"),
        "achievements_highlight": harvest.get("logros", [])[:3],
        "fun_facts": [f"{harvest['evento']['jugadores']} jugadores, {harvest['evento']['rondas']} rondas"],
        "emotional_hook": f"La corona de {harvest['evento']['juego']} tiene nuevo dueño.",
        "hashtags": ["#TCGChile", f"#{harvest['evento']['juego'].replace(' ', '')}", "#EliteCards"],
        "cta_sugerido": "Inscribite al próximo torneo en la web 🔥",
        "_mock": True,
    }


def run_analysis(db: Session, *, harvest: dict) -> dict:
    """Brief editorial. Mock si no hay API key."""
    if _is_mock():
        return _mock_brief(harvest)
    # Few-shot: hooks ganadores históricos
    hooks = list(db.scalars(select(ContentWinningHook)
                            .order_by(desc(ContentWinningHook.impact_score)).limit(5)))
    hooks_txt = "\n".join(f"- [{h.platform}] {h.hook_text}" for h in hooks) or "(sin historial)"
    from app.services import ai_chat
    prompt = (
        f"DATOS DEL TORNEO:\n{json.dumps(harvest, ensure_ascii=False)}\n\n"
        f"HOOKS QUE FUNCIONARON ANTES (tono de referencia, no copiar):\n{hooks_txt}\n\n"
        f"Generá el brief con este schema exacto:\n{BRIEF_SCHEMA_HINT}"
    )
    out = ai_chat.complete_json(prompt, system=ANALYST_SYSTEM, max_tokens=1500, creative=False)
    if "error" in out and "raw" in out:
        raise RuntimeError(f"Analista devolvió JSON inválido: {out['raw'][:200]}")
    return out


# ═══════════════════════════ ESCRITOR (Fable) — recetas ═══════════════════════════

WRITER_SYSTEM = """Sos el copywriter de EliteCards. Voz: épica pero cercana, español de Chile,
celebra a los jugadores por nombre, nunca arrogante, humor sutil de TCG.
PROHIBIDO: inventar datos fuera del brief, clickbait engañoso, exceso de emojis.
El protagonista es la comunidad, no la tienda. Output: SOLO el JSON pedido."""

RECIPES: dict[str, dict] = {
    "tiktok": {
        "label": "TikTok",
        "instructions": (
            "Guion de video 30-45s. Hook en los primeros 2 segundos con el dato "
            "más impactante. 5-7 beats. CTA final. Caption ≤150 chars."
        ),
        "schema": '{"hook_2s": "", "guion": [{"t": "0-3s", "texto_pantalla": "", "voz": ""}], '
                  '"duracion_seg": 40, "audio_sugerido": "", "caption": "", "hashtags": []}',
    },
    "instagram": {
        "label": "Instagram",
        "instructions": (
            "Carrusel 6-8 slides: portada (headline) → campeón → camino → MVP → "
            "top 8 → logro/rivalidad → CTA. Caption ≤2200 chars; la primera línea "
            "es el gancho (única visible colapsada)."
        ),
        "schema": '{"primera_linea": "", "caption": "", "slides": [{"titulo": "", "cuerpo": ""}], "hashtags": []}',
    },
    "facebook": {
        "label": "Facebook",
        "instructions": (
            "Post de comunidad 400-800 chars, tono diario local. Nombrá a TODOS "
            "los top 8 (la gente se taggea). Pregunta final para comentarios."
        ),
        "schema": '{"post": "", "foto_sugerida": "", "hashtags": []}',
    },
    "youtube_shorts": {
        "label": "YouTube Shorts",
        "instructions": (
            "Guion 45-58s estilo documental (podés citar el storyline si viene "
            "en el brief). Título ≤70 chars con keyword del juego. Descripción "
            "con CTA al próximo evento."
        ),
        "schema": '{"titulo_seo": "", "descripcion": "", "guion": [{"t": "", "voz": ""}], "tags": []}',
    },
    "discord": {
        "label": "Discord",
        "instructions": (
            "Anuncio con markdown nativo. Mensaje corto arriba + embed con "
            "campos: Campeón / MVP / Top 8 / Logros. Cerrá con link al storyline."
        ),
        "schema": '{"mensaje_arriba": "", "embed_titulo": "", "embed_descripcion_md": "", '
                  '"campos": [{"nombre": "", "valor": ""}]}',
    },
}


def _mock_body(platform: str, brief: dict) -> dict:
    champ = (brief.get("champion") or {}).get("alias") or "{{campeón}}"
    head = brief.get("headline", "{{headline}}")
    base = {
        "tiktok": {"hook_2s": head, "guion": [{"t": "0-3s", "texto_pantalla": head, "voz": f"{champ} lo hizo de nuevo"}],
                   "duracion_seg": 35, "audio_sugerido": "trending épico", "caption": head[:140],
                   "hashtags": brief.get("hashtags", [])},
        "instagram": {"primera_linea": head, "caption": f"{head}\n\n{brief.get('emotional_hook','')}",
                      "slides": [{"titulo": head, "cuerpo": ""},
                                 {"titulo": f"👑 {champ}", "cuerpo": (brief.get("champion") or {}).get("record", "")}],
                      "hashtags": brief.get("hashtags", [])},
        "facebook": {"post": f"{head}\n\n{brief.get('cta_sugerido','')}", "foto_sugerida": "foto del campeón con su deck",
                     "hashtags": brief.get("hashtags", [])},
        "youtube_shorts": {"titulo_seo": head[:70], "descripcion": brief.get("cta_sugerido", ""),
                           "guion": [{"t": "0-5s", "voz": head}], "tags": ["tcg", "torneo"]},
        "discord": {"mensaje_arriba": f"🏆 {head}", "embed_titulo": brief.get("headline", ""),
                    "embed_descripcion_md": brief.get("emotional_hook", ""),
                    "campos": [{"nombre": "Campeón", "valor": champ}]},
    }
    body = base[platform]
    body["_mock"] = True
    return body


def generate_piece_body(db: Session, *, brief: dict, platform: str,
                        revision_note: str | None = None,
                        previous_body: dict | None = None) -> dict:
    if _is_mock():
        return _mock_body(platform, brief)
    recipe = RECIPES[platform]
    from app.services import ai_chat
    prompt = (
        f"BRIEF DEL TORNEO:\n{json.dumps(brief, ensure_ascii=False)}\n\n"
        f"PLATAFORMA: {recipe['label']}\n"
        f"RECETA: {recipe['instructions']}\n\n"
    )
    if revision_note and previous_body:
        prompt += (
            f"VERSIÓN ANTERIOR:\n{json.dumps(previous_body, ensure_ascii=False)}\n\n"
            f"REVISIÓN SOLICITADA POR EL EDITOR: {revision_note}. "
            "Reescribí respetándola.\n\n"
        )
    prompt += f"Output con este schema exacto:\n{recipe['schema']}"
    out = ai_chat.complete_json(prompt, system=WRITER_SYSTEM, max_tokens=1400, creative=True)
    if "error" in out and "raw" in out:
        raise RuntimeError(f"Escritor {platform} devolvió JSON inválido")
    return out


# ═══════════════════════════ STATE MACHINE ═══════════════════════════


def process_job(db: Session, *, job: ContentJob) -> ContentJob:
    """Corre el pipeline completo del job: harvest → análisis → 5 piezas."""
    try:
        job.status = "HARVESTING"
        db.flush()
        harvest = harvest_event_data(db, event_id=job.event_id)
        job.harvest_json = json.dumps(harvest, ensure_ascii=False)

        job.status = "ANALYZING"
        db.flush()
        brief = run_analysis(db, harvest=harvest)
        job.brief_json = json.dumps(brief, ensure_ascii=False)
        job.analysis_model = "mock" if _is_mock() else settings.anthropic_model

        job.status = "GENERATING"
        db.flush()
        # Torneo demasiado chico para video: skipea tiktok/shorts
        skip_video = (harvest["evento"]["jugadores"] or 0) < 6
        for platform in PLATFORMS:
            if skip_video and platform in ("tiktok", "youtube_shorts"):
                db.add(ContentPiece(
                    job_id=job.id, event_id=job.event_id, platform=platform,
                    body_json=json.dumps({"skipped": "torneo sin material para video"}),
                    status="SKIPPED",
                    writer_model="mock" if _is_mock() else settings.anthropic_creative_model,
                ))
                continue
            body = generate_piece_body(db, brief=brief, platform=platform)
            db.add(ContentPiece(
                job_id=job.id, event_id=job.event_id, platform=platform,
                body_json=json.dumps(body, ensure_ascii=False),
                status="DRAFT",
                writer_model="mock" if _is_mock() else settings.anthropic_creative_model,
            ))
        job.status = "READY"
        job.error = None
        db.flush()
        log.info("content job %d READY (event %d)", job.id, job.event_id)
    except Exception as e:
        db.rollback()
        job = db.get(ContentJob, job.id)
        job.retries += 1
        job.status = "FAILED" if job.retries >= MAX_RETRIES else "PENDING"
        job.error = f"{type(e).__name__}: {e}"[:500]
        db.flush()
        log.exception("content job %d failed (retry %d)", job.id, job.retries)
    return job


# ═══════════════════════════ SOCIAL IMPACT SCORE ═══════════════════════════


def _raw_engagement(m: ContentMetric) -> float:
    return m.views * 0.1 + m.likes * 1 + m.comments * 3 + m.shares * 5 + m.saves * 4


def compute_sis(db: Session, *, piece: ContentPiece) -> float | None:
    """SIS relativo al baseline propio: 50 = tu promedio, 100 = 2× tu promedio."""
    latest = db.scalar(select(ContentMetric).where(
        ContentMetric.piece_id == piece.id
    ).order_by(desc(ContentMetric.captured_at)))
    if not latest:
        return None
    raw = _raw_engagement(latest)

    # Baseline: mediana de las últimas 10 piezas PUBLISHED de la misma plataforma
    others = list(db.scalars(
        select(ContentPiece).where(
            ContentPiece.platform == piece.platform,
            ContentPiece.status == "PUBLISHED",
            ContentPiece.id != piece.id,
        ).order_by(desc(ContentPiece.published_at)).limit(10)
    ))
    raws = []
    for o in others:
        om = db.scalar(select(ContentMetric).where(
            ContentMetric.piece_id == o.id
        ).order_by(desc(ContentMetric.captured_at)))
        if om:
            raws.append(_raw_engagement(om))
    if len(raws) < 3:
        return None  # calibrando
    baseline = statistics.median(raws) or 1.0
    return round(min(100.0, 50.0 * raw / baseline), 1)


def record_metrics(db: Session, *, piece: ContentPiece, views: int = 0, likes: int = 0,
                   comments: int = 0, shares: int = 0, saves: int = 0) -> dict:
    db.add(ContentMetric(
        piece_id=piece.id, captured_at=datetime.now(timezone.utc),
        views=views, likes=likes, comments=comments, shares=shares, saves=saves,
    ))
    db.flush()
    piece.impact_score = compute_sis(db, piece=piece)
    db.flush()
    return {"impact_score": piece.impact_score}


def harvest_winning_hooks(db: Session) -> int:
    """Piezas SIS ≥ 70 sin hook registrado → memoria de la voz ganadora."""
    candidates = list(db.scalars(select(ContentPiece).where(
        ContentPiece.status == "PUBLISHED",
        ContentPiece.impact_score >= 70,
    )))
    added = 0
    for p in candidates:
        body = json.loads(p.edited_body_json or p.body_json)
        hook = (body.get("hook_2s") or body.get("primera_linea")
                or body.get("titulo_seo") or body.get("mensaje_arriba")
                or (body.get("post") or "")[:120])
        if not hook:
            continue
        exists = db.scalar(select(ContentWinningHook).where(
            ContentWinningHook.platform == p.platform,
            ContentWinningHook.hook_text == hook[:300],
        ))
        if exists:
            continue
        db.add(ContentWinningHook(
            platform=p.platform, hook_text=hook[:300],
            impact_score=p.impact_score, event_id=p.event_id,
        ))
        added += 1
    # Cap: top 10 por plataforma — borrar los de menor SIS que sobren
    for platform in PLATFORMS:
        rows = list(db.scalars(select(ContentWinningHook).where(
            ContentWinningHook.platform == platform
        ).order_by(desc(ContentWinningHook.impact_score))))
        for stale in rows[10:]:
            db.delete(stale)
    db.flush()
    return added
