"""Crea tabla referrals + player_achievement_progress + columnas
achievements.progress_target / trigger_kind. Idempotente.
"""
from sqlalchemy import inspect, text

from app.core.db import engine
from app.models import Referral, PlayerAchievementProgress


def main():
    insp = inspect(engine)

    if "referrals" in insp.get_table_names():
        print("· referrals ya existe")
    else:
        Referral.__table__.create(bind=engine)
        print("✓ referrals creada")

    if "player_achievement_progress" in insp.get_table_names():
        print("· player_achievement_progress ya existe")
    else:
        PlayerAchievementProgress.__table__.create(bind=engine)
        print("✓ player_achievement_progress creada")

    cols = [c["name"] for c in insp.get_columns("achievements")]
    with engine.begin() as conn:
        if "progress_target" not in cols:
            conn.execute(text("ALTER TABLE achievements ADD COLUMN progress_target INTEGER"))
            print("✓ achievements.progress_target agregada")
        else:
            print("· achievements.progress_target ya existe")
        if "trigger_kind" not in cols:
            conn.execute(text("ALTER TABLE achievements ADD COLUMN trigger_kind VARCHAR(40)"))
            print("✓ achievements.trigger_kind agregada")
        else:
            print("· achievements.trigger_kind ya existe")


if __name__ == "__main__":
    main()
