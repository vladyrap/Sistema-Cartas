import re
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile, status
from sqlalchemy import select

from app.core.deps import DbDep, UserDep
from app.models import PlayerProfile, Season, SeasonHistory, SeasonProgress, SeasonStatus
from app.schemas.common import (
    AchievementOut,
    BenefitOut,
    MyProfileUpdate,
    PlayerAchievementOut,
    PlayerMeOut,
    PlayerStatsOut,
    PlayerSummary,
    ProgressToNextOut,
    PublicProfileOut,
    SeasonHistoryOut,
    SeasonProgressOut,
)
from app.services import gamification as gm


UPLOADS_DIR = Path(__file__).resolve().parent.parent.parent / "uploads" / "avatars"
UPLOADS_DIR.mkdir(parents=True, exist_ok=True)
MAX_AVATAR_BYTES = 3 * 1024 * 1024  # 3 MB
ALLOWED_AVATAR_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif"}
from app.services.progression import progress_to_next_level, unlocked_benefits

router = APIRouter()


@router.get("/me", response_model=PlayerMeOut)
def me(current: UserDep, db: DbDep) -> PlayerMeOut:
    profile = current.profile
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "El usuario no tiene perfil de jugador")

    active = db.scalar(select(Season).where(Season.status == SeasonStatus.ACTIVE))

    progress_obj = None
    progress_to_next = None
    benefits: list[BenefitOut] = []
    season_id = None
    season_name = None

    if active is not None:
        season_id = active.id
        season_name = active.name
        sp = db.scalar(
            select(SeasonProgress).where(
                SeasonProgress.season_id == active.id,
                SeasonProgress.player_id == profile.id,
            )
        )
        if sp is not None:
            progress_obj = SeasonProgressOut.model_validate(sp)
            ptn = progress_to_next_level(sp.level, sp.exp_in_level)
            progress_to_next = ProgressToNextOut(**ptn)
            benefits = [BenefitOut(**b) for b in unlocked_benefits(sp.level)]

    return PlayerMeOut(
        player=PlayerSummary.model_validate(profile),
        season_id=season_id,
        season_name=season_name,
        progress=progress_obj,
        progress_to_next=progress_to_next,
        benefits=benefits,
    )


@router.patch("/me/profile", response_model=PlayerSummary)
def update_my_profile(payload: MyProfileUpdate, current: UserDep, db: DbDep) -> PlayerSummary:
    """El jugador edita sus propios datos (no alias ni email — esos requieren admin)."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    p = current.profile
    data = payload.model_dump(exclude_unset=True)
    if "avatar_url" in data and data["avatar_url"]:
        # Validar formato básico: URL o ruta absoluta /uploads/...
        url = data["avatar_url"].strip()
        if not (url.startswith("http://") or url.startswith("https://") or url.startswith("/uploads/")):
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "URL de avatar inválida")
        data["avatar_url"] = url
    for k, v in data.items():
        setattr(p, k, v)
    db.commit()
    db.refresh(p)
    return PlayerSummary.model_validate(p)


@router.post("/me/avatar", response_model=PlayerSummary)
async def upload_my_avatar(
    file: UploadFile = File(...), current: UserDep = None, db: DbDep = None
) -> PlayerSummary:
    """Sube una imagen como avatar. Guarda en uploads/avatars y actualiza avatar_url."""
    if not current.profile:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Sin perfil")
    if not file.filename:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Archivo sin nombre")
    ext = Path(file.filename).suffix.lower()
    if ext not in ALLOWED_AVATAR_EXT:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Formato no soportado. Usa: {', '.join(sorted(ALLOWED_AVATAR_EXT))}",
        )

    content = await file.read()
    if len(content) > MAX_AVATAR_BYTES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Imagen demasiado grande (máx {MAX_AVATAR_BYTES // 1024 // 1024} MB)",
        )

    safe_alias = re.sub(r"[^a-zA-Z0-9_-]", "", current.profile.alias)[:20] or "player"
    fname = f"{current.profile.id}_{safe_alias}_{uuid.uuid4().hex[:8]}{ext}"
    path = UPLOADS_DIR / fname
    path.write_bytes(content)

    url = f"/uploads/avatars/{fname}"
    current.profile.avatar_url = url
    db.commit()
    db.refresh(current.profile)
    return PlayerSummary.model_validate(current.profile)


@router.get("/me/history", response_model=list[SeasonHistoryOut])
def my_history(current: UserDep, db: DbDep) -> list[SeasonHistoryOut]:
    profile = current.profile
    if profile is None:
        return []
    rows = db.execute(
        select(
            SeasonHistory.season_id,
            Season.name,
            Season.number,
            SeasonHistory.final_level,
            SeasonHistory.final_exp_total,
            SeasonHistory.max_rank,
            SeasonHistory.final_position,
            SeasonHistory.prestige_earned,
        )
        .join(Season, Season.id == SeasonHistory.season_id)
        .where(SeasonHistory.player_id == profile.id)
        .order_by(Season.number.desc())
    ).all()
    return [
        SeasonHistoryOut(
            season_id=r[0], season_name=r[1], season_number=r[2],
            final_level=r[3], final_exp_total=r[4], max_rank=r[5],
            final_position=r[6], prestige_earned=r[7],
        )
        for r in rows
    ]


@router.get("/{player_id}", response_model=PlayerSummary)
def get_player(player_id: int, db: DbDep) -> PlayerSummary:
    p = db.get(PlayerProfile, player_id)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jugador no encontrado")
    return PlayerSummary.model_validate(p)


@router.get("/{player_id}/stats", response_model=PlayerStatsOut)
def player_stats(player_id: int, db: DbDep) -> PlayerStatsOut:
    """Estadísticas históricas del jugador."""
    from sqlalchemy import func
    from app.models import (
        AttendanceStatus,
        EventRegistration,
        PlayerAchievement,
        PlayerMission,
    )

    p = db.get(PlayerProfile, player_id)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jugador no encontrado")

    # Eventos
    total_registered = db.scalar(
        select(func.count(EventRegistration.id)).where(EventRegistration.player_id == player_id)
    ) or 0
    total_attended = db.scalar(
        select(func.count(EventRegistration.id)).where(
            EventRegistration.player_id == player_id,
            EventRegistration.attendance_status == AttendanceStatus.ATTENDED,
        )
    ) or 0
    total_no_shows = db.scalar(
        select(func.count(EventRegistration.id)).where(
            EventRegistration.player_id == player_id,
            EventRegistration.attendance_status == AttendanceStatus.NO_SHOW,
        )
    ) or 0

    # Rondas y posiciones
    regs = list(
        db.scalars(select(EventRegistration).where(EventRegistration.player_id == player_id))
    )
    rounds_won = sum(r.rounds_won for r in regs)
    rounds_lost = sum(r.rounds_lost for r in regs)
    total_rounds = rounds_won + rounds_lost
    win_rate = round((rounds_won / total_rounds) * 100, 1) if total_rounds > 0 else 0.0

    championships = sum(1 for r in regs if r.final_position == 1)
    podiums = sum(1 for r in regs if r.final_position and 1 <= r.final_position <= 3)
    top_8 = sum(1 for r in regs if r.final_position and 1 <= r.final_position <= 8)

    # Misiones y medallas
    missions_done = db.scalar(
        select(func.count(PlayerMission.id)).where(
            PlayerMission.player_id == player_id, PlayerMission.is_completed.is_(True)
        )
    ) or 0
    achievements = db.scalar(
        select(func.count(PlayerAchievement.id)).where(PlayerAchievement.player_id == player_id)
    ) or 0

    # Temporadas y mejor rango
    histories = list(db.scalars(select(SeasonHistory).where(SeasonHistory.player_id == player_id)))
    total_seasons = len(histories)
    from app.services.exp import _rank_index
    best_rank = None
    if histories:
        best = max(histories, key=lambda h: _rank_index(h.max_rank))
        best_rank = best.max_rank.value if hasattr(best.max_rank, "value") else best.max_rank

    return PlayerStatsOut(
        player_id=p.id, alias=p.alias,
        total_seasons=total_seasons,
        total_events_registered=total_registered,
        total_events_attended=total_attended,
        total_no_shows=total_no_shows,
        total_rounds_won=rounds_won,
        total_rounds_lost=rounds_lost,
        win_rate=win_rate,
        championships=championships,
        podiums=podiums,
        top_8_finishes=top_8,
        missions_completed=missions_done,
        achievements_earned=achievements,
        best_max_rank=best_rank,
        current_prestige=p.prestige,
    )


@router.get("/{player_id}/public", response_model=PublicProfileOut)
def public_profile(player_id: int, db: DbDep) -> PublicProfileOut:
    from sqlalchemy import func, select

    p = db.get(PlayerProfile, player_id)
    if not p:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Jugador no encontrado")

    # Temporada activa: nivel + rango + posición en ranking
    active = db.scalar(select(Season).where(Season.status == SeasonStatus.ACTIVE))
    current_level = None
    current_rank = None
    current_position = None
    if active is not None:
        sp = db.scalar(
            select(SeasonProgress).where(
                SeasonProgress.season_id == active.id, SeasonProgress.player_id == p.id
            )
        )
        if sp is not None:
            current_level = sp.level
            current_rank = sp.current_rank
            # posición = #jugadores con más exp_total + 1
            higher = db.scalar(
                select(func.count(SeasonProgress.id)).where(
                    SeasonProgress.season_id == active.id,
                    SeasonProgress.exp_total > sp.exp_total,
                )
            ) or 0
            current_position = higher + 1

    # Historial
    rows = db.execute(
        select(
            SeasonHistory.season_id,
            Season.name,
            Season.number,
            SeasonHistory.final_level,
            SeasonHistory.final_exp_total,
            SeasonHistory.max_rank,
            SeasonHistory.final_position,
            SeasonHistory.prestige_earned,
        )
        .join(Season, Season.id == SeasonHistory.season_id)
        .where(SeasonHistory.player_id == p.id)
        .order_by(Season.number.desc())
    ).all()
    history = [
        SeasonHistoryOut(
            season_id=r[0], season_name=r[1], season_number=r[2],
            final_level=r[3], final_exp_total=r[4], max_rank=r[5],
            final_position=r[6], prestige_earned=r[7],
        )
        for r in rows
    ]

    # Medallas
    items = gm.list_player_achievements(db, player_id=p.id)
    achievements = [
        PlayerAchievementOut(
            achievement=AchievementOut.model_validate(ach),
            season_id=pa.season_id,
            earned_at=pa.earned_at,
        )
        for ach, pa in items
    ]

    return PublicProfileOut(
        id=p.id, alias=p.alias, avatar_url=p.avatar_url, bio=p.bio,
        player_class=p.player_class,
        elite_id_code=p.elite_id_code, elite_id_number=p.elite_id_number,
        prestige=p.prestige, current_level=current_level, current_rank=current_rank,
        current_position=current_position, season_count=len(history),
        achievements=achievements, history=history,
    )
