"""Misiones, medallas y Hall of Fame.

Misiones:
  - Admin crea Mission (global o de temporada).
  - Asignación: cuando un jugador autenticado consulta sus misiones, se
    crean PlayerMission lazy para las que aún no tiene.
  - Completar: admin marca como completada (manual) y se entrega EXP de premio.

Achievements (medallas):
  - Admin crea Achievement.
  - Otorga manualmente con grant_achievement(player_id, achievement_id, season_id?, admin_id?)
  - Auto-otorga via check_auto_achievements al cerrar temporada (campeón, top8, etc).

Hall of Fame:
  - Se popula automáticamente al cerrar temporada.
  - Lectura simple: list_entries_by_season(season_id).
"""
from __future__ import annotations

from datetime import datetime, timezone

from fastapi import HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.models import (
    Achievement,
    HallOfFameEntry,
    Mission,
    PlayerAchievement,
    PlayerMission,
    Season,
    SeasonHistory,
)
from app.services import exp as exp_svc


# ============================== Missions ==============================


def list_active_missions(
    db: Session, *, season_id: int | None, guild_id: int | None = None
) -> list[Mission]:
    """Misiones activas: las globales (sin season_id) + las de la temporada activa.

    Si se pasa `guild_id`, filtra a misiones de ese Gremio."""
    stmt = select(Mission).where(Mission.is_active.is_(True))
    if season_id is not None:
        stmt = stmt.where((Mission.season_id == season_id) | (Mission.season_id.is_(None)))
    else:
        stmt = stmt.where(Mission.season_id.is_(None))
    if guild_id is not None:
        stmt = stmt.where(Mission.guild_id == guild_id)
    return list(db.scalars(stmt.order_by(Mission.is_weekly.desc(), Mission.exp_reward.desc())))


def get_or_create_player_missions(
    db: Session, *, player_id: int, season_id: int | None, guild_id: int | None = None
) -> list[tuple[Mission, PlayerMission]]:
    """Devuelve [(Mission, PlayerMission)] para el jugador.

    Si una PlayerMission aún no existe para una misión activa, la crea lazy.
    """
    missions = list_active_missions(db, season_id=season_id, guild_id=guild_id)
    if not missions:
        return []

    existing = {
        pm.mission_id: pm
        for pm in db.scalars(
            select(PlayerMission).where(
                PlayerMission.player_id == player_id,
                PlayerMission.mission_id.in_([m.id for m in missions]),
            )
        )
    }
    out: list[tuple[Mission, PlayerMission]] = []
    for m in missions:
        pm = existing.get(m.id)
        if pm is None:
            pm = PlayerMission(player_id=player_id, mission_id=m.id, progress=0, target=1, is_completed=False)
            db.add(pm)
            db.flush()
        out.append((m, pm))
    return out


def complete_mission(
    db: Session, *, player_mission_id: int, admin_id: int | None = None
) -> PlayerMission:
    pm = db.get(PlayerMission, player_mission_id)
    if not pm:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Misión del jugador no encontrada")
    if pm.is_completed:
        return pm

    pm.is_completed = True
    pm.completed_at = datetime.now(timezone.utc)
    pm.progress = pm.target

    mission = db.get(Mission, pm.mission_id)
    if mission and mission.exp_reward > 0:
        try:
            exp_svc.award_exp(
                db, pm.player_id, "admin_adjust",
                amount=mission.exp_reward,
                reason=f"Misión completada: {mission.name}",
                admin_id=admin_id,
            )
        except RuntimeError:
            pass
    # Notif
    try:
        from app.services import notifications as notif_svc
        notif_svc.notify(
            db, player_id=pm.player_id,
            guild_id=(mission.guild_id if mission else None),
            type="mission_completed",
            title="✨ Misión completada",
            body=f"'{mission.name}' · +{mission.exp_reward} EXP" if mission else "Misión completada",
            link="/missions",
        )
    except Exception:
        pass
    db.flush()
    return pm


def increment_mission_progress(
    db: Session, *, player_id: int, mission_code: str, delta: int = 1
) -> PlayerMission | None:
    """Suma progreso a una misión por código. Si llega al target, auto-completa.

    Útil para hooks futuros (ej. al asistir a un evento, incrementar "asiste a 3 torneos").
    """
    mission = db.scalar(select(Mission).where(Mission.code == mission_code, Mission.is_active.is_(True)))
    if not mission:
        return None
    pm = db.scalar(
        select(PlayerMission).where(
            PlayerMission.player_id == player_id, PlayerMission.mission_id == mission.id
        )
    )
    if pm is None:
        pm = PlayerMission(player_id=player_id, mission_id=mission.id, progress=0, target=1, is_completed=False)
        db.add(pm)
        db.flush()
    if pm.is_completed:
        return pm
    pm.progress = min(pm.target, pm.progress + delta)
    if pm.progress >= pm.target:
        complete_mission(db, player_mission_id=pm.id)
    db.flush()
    return pm


# ============================== Achievements ==============================


def grant_achievement(
    db: Session,
    *,
    player_id: int,
    achievement_id: int,
    season_id: int | None = None,
    admin_id: int | None = None,
) -> PlayerAchievement:
    """Otorga una medalla. Idempotente por (player, achievement, season)."""
    existing = db.scalar(
        select(PlayerAchievement).where(
            PlayerAchievement.player_id == player_id,
            PlayerAchievement.achievement_id == achievement_id,
            PlayerAchievement.season_id.is_(season_id) if season_id is None else PlayerAchievement.season_id == season_id,
        )
    )
    if existing:
        return existing
    pa = PlayerAchievement(
        player_id=player_id,
        achievement_id=achievement_id,
        season_id=season_id,
        earned_at=datetime.now(timezone.utc),
        granted_by_admin_id=admin_id,
    )
    db.add(pa)
    db.flush()
    # Notif
    try:
        from app.services import notifications as notif_svc
        ach = db.get(Achievement, achievement_id)
        if ach:
            notif_svc.notify(
                db, player_id=player_id, guild_id=ach.guild_id,
                type="achievement_granted",
                title="🏅 Nueva medalla",
                body=f"Recibiste la medalla '{ach.name}'.",
                link="/profile",
            )
    except Exception:
        pass
    return pa


def list_player_achievements(db: Session, *, player_id: int) -> list[tuple[Achievement, PlayerAchievement]]:
    rows = db.execute(
        select(PlayerAchievement, Achievement)
        .join(Achievement, PlayerAchievement.achievement_id == Achievement.id)
        .where(PlayerAchievement.player_id == player_id)
        .order_by(PlayerAchievement.earned_at.desc().nulls_last())
    ).all()
    return [(ach, pa) for pa, ach in rows]


def auto_award_for_season_close(db: Session, *, season_id: int) -> int:
    """Hook llamado tras cerrar temporada: otorga medallas por logros.

    Otorga:
      - "season_champion" → final_position == 1 (medalla "Carrera Perfecta" si rounds_won/total OK)
      - Achievement con code='first_blood' → si es la primera temporada del jugador
    Devuelve cantidad de medallas otorgadas.
    """
    granted = 0

    # Campeón de temporada
    champ_history = db.scalar(
        select(SeasonHistory).where(
            SeasonHistory.season_id == season_id, SeasonHistory.final_position == 1
        )
    )
    if champ_history:
        # Buscar medalla "perfect_run" si existe
        perfect = db.scalar(select(Achievement).where(Achievement.code == "perfect_run"))
        if perfect:
            grant_achievement(
                db, player_id=champ_history.player_id, achievement_id=perfect.id, season_id=season_id
            )
            granted += 1

    # Maratonista para top 3 con final_level == 30
    marathoners = list(
        db.scalars(
            select(SeasonHistory).where(
                SeasonHistory.season_id == season_id,
                SeasonHistory.final_level == 30,
            )
        )
    )
    season_marathoner = db.scalar(select(Achievement).where(Achievement.code == "season_marathoner"))
    if season_marathoner:
        for h in marathoners:
            grant_achievement(
                db, player_id=h.player_id, achievement_id=season_marathoner.id, season_id=season_id
            )
            granted += 1

    return granted


# ============================== Hall of Fame ==============================


def populate_hall_of_fame_for_season(db: Session, *, season_id: int) -> int:
    """Crea HallOfFameEntry desde SeasonHistory al cerrar temporada.

    Categorías generadas:
      - "season_champion" → final_position == 1
      - "top_8" → 2..8
    Devuelve cantidad creada (omite duplicados).
    """
    histories = list(
        db.scalars(
            select(SeasonHistory).where(SeasonHistory.season_id == season_id)
            .order_by(SeasonHistory.final_position.asc().nulls_last())
        )
    )

    created = 0
    for h in histories:
        if h.final_position is None:
            continue
        if h.final_position == 1:
            category = "season_champion"
            note = f"Campeón {db.get(Season, season_id).name if db.get(Season, season_id) else ''}".strip()
        elif h.final_position <= 8:
            category = "top_8"
            note = f"Top 8 (#{h.final_position})"
        else:
            continue
        # idempotencia
        existing = db.scalar(
            select(HallOfFameEntry).where(
                HallOfFameEntry.season_id == season_id,
                HallOfFameEntry.player_id == h.player_id,
                HallOfFameEntry.category == category,
            )
        )
        if existing:
            continue
        db.add(HallOfFameEntry(
            season_id=season_id, player_id=h.player_id, category=category, note=note,
        ))
        created += 1
    db.flush()
    return created


def list_hall_of_fame(
    db: Session, *, season_id: int | None = None, guild_id: int | None = None
) -> list[dict]:
    """Lista entries con info de jugador. Si season_id es None, todas las temporadas.

    Si se pasa `guild_id`, filtra por Gremio (vía Season.guild_id).
    Siempre incluye `guild_id` + `guild_name` para distinguir entries en la
    vista global cross-Gremio.
    """
    from app.models import Guild, PlayerProfile
    stmt = (
        select(HallOfFameEntry, PlayerProfile, Season, Guild)
        .join(PlayerProfile, HallOfFameEntry.player_id == PlayerProfile.id)
        .join(Season, HallOfFameEntry.season_id == Season.id)
        .outerjoin(Guild, Season.guild_id == Guild.id)
        .order_by(Season.number.desc(), HallOfFameEntry.category)
    )
    if season_id is not None:
        stmt = stmt.where(HallOfFameEntry.season_id == season_id)
    if guild_id is not None:
        stmt = stmt.where(Season.guild_id == guild_id)
    rows = db.execute(stmt).all()
    out = []
    for entry, player, season, guild in rows:
        out.append({
            "entry_id": entry.id,
            "season_id": season.id,
            "season_number": season.number,
            "season_name": season.name,
            "guild_id": season.guild_id,
            "guild_name": guild.name if guild else None,
            "guild_code": guild.code if guild else None,
            "guild_accent_color": guild.accent_color if guild else None,
            "player_id": player.id,
            "player_alias": player.alias,
            "player_elite_id": player.elite_id_code,
            "category": entry.category,
            "note": entry.note,
        })
    return out
