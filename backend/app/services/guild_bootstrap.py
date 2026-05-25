"""Seed inicial cuando SuperAdmin crea un Gremio nuevo.

Idempotente: si ya hay temporada/misión/medalla en el Gremio, no duplica.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import Achievement, Mission, Season, SeasonStatus


def seed_initial(db: Session, *, guild_id: int) -> dict:
    """Crea una temporada inicial + misiones default + medallas default.

    Devuelve dict con los conteos de lo creado.
    """
    created = {"season": 0, "missions": 0, "achievements": 0}

    # 1) Temporada T1 activa, si no hay ninguna en el Gremio
    existing_season = db.scalar(
        select(Season).where(Season.guild_id == guild_id)
    )
    if not existing_season:
        now = datetime.now(timezone.utc)
        season = Season(
            guild_id=guild_id,
            number=1,
            name="T1 — Bienvenida",
            description="Temporada inaugural del Gremio. ¡Buena suerte, aventurero!",
            starts_at=now,
            ends_at=now + timedelta(days=90),
            status=SeasonStatus.ACTIVE,
        )
        db.add(season)
        db.flush()
        created["season"] = 1
        season_id = season.id
    else:
        season_id = None

    # 2) 3 misiones default (1 semanal + 2 de temporada)
    default_missions = [
        {
            "code": "weekly-visit",
            "name": "Asiste a una jornada",
            "description": "Participa en cualquier evento esta semana",
            "exp_reward": 100,
            "is_weekly": True,
            "is_active": True,
        },
        {
            "code": "season-3-events",
            "name": "Veterano de la temporada",
            "description": "Inscríbete en 3 eventos durante la temporada",
            "exp_reward": 300,
            "is_weekly": False,
            "is_active": True,
        },
        {
            "code": "season-first-win",
            "name": "Primera victoria",
            "description": "Termina en top 3 de algún torneo",
            "exp_reward": 500,
            "is_weekly": False,
            "is_active": True,
        },
    ]
    for spec in default_missions:
        already = db.scalar(
            select(Mission).where(
                Mission.guild_id == guild_id, Mission.code == spec["code"]
            )
        )
        if already:
            continue
        db.add(Mission(
            guild_id=guild_id,
            season_id=season_id,
            **spec,
        ))
        created["missions"] += 1

    # 3) 5 medallas default. NOTA: Achievement.code es UNIQUE GLOBAL en BD.
    # Usamos un prefix con el guild_id para evitar colisiones entre Gremios.
    prefix = f"g{guild_id}-"
    default_achievements = [
        ("first-event",  "Primer evento",       "Inscríbete a tu primer evento en el Gremio"),
        ("rising-star",  "Estrella ascendente", "Sube 5 niveles en una temporada"),
        ("collector",    "Coleccionista",       "Compra 10 productos del catálogo"),
        ("champion",     "Campeón",             "Gana un torneo de temporada"),
        ("loyal",        "Leal al Gremio",      "Cumple 100 días como miembro"),
    ]
    for code_suffix, name, desc in default_achievements:
        code = prefix + code_suffix
        already = db.scalar(select(Achievement).where(Achievement.code == code))
        if already:
            continue
        db.add(Achievement(
            guild_id=guild_id,
            code=code,
            name=name,
            description=desc,
            is_seasonal=False,
            is_secret=False,
        ))
        created["achievements"] += 1

    db.flush()
    return created
