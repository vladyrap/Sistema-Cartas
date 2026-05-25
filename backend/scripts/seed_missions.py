"""Seed idempotente de misiones trigger-ables.

Inserta misiones si no existen. No toca otros datos. Útil para correr
después de un seed inicial sin perder el estado actual.

Misiones creadas:
  Semanales (resetables manualmente):
    - register_3_events     Inscríbete a 3 eventos
    - attend_events         Asiste a 2 eventos
    - reserve_product       Haz tu primera reserva semanal

  De temporada:
    - register_events       Inscríbete a 10 eventos durante la temporada
    - win_3_rounds          Gana 3 rondas en un solo evento
    - champion_event        Llega a campeón de un evento
    - trade_day_attend      Participa en 3 Trade Days
"""
from __future__ import annotations

from sqlalchemy import select

from app.core.db import SessionLocal
from app.models import Mission, Season, SeasonStatus


MISSIONS = [
    # semanales
    ("register_3_events", "Inscríbete a 3 eventos esta semana", 150, True, 3),
    ("attend_events", "Asiste a 2 eventos esta semana", 200, True, 2),
    ("reserve_product", "Haz al menos 1 reserva esta semana", 75, True, 1),
    # de temporada
    ("register_events", "Inscríbete a 10 eventos en la temporada", 400, False, 10),
    ("win_3_rounds", "Gana 3 rondas en un solo evento", 250, False, 1),
    ("champion_event", "Conviértete en campeón de un evento", 600, False, 1),
    ("trade_day_attend", "Participa en 3 Trade Days", 300, False, 3),
]


def run():
    db = SessionLocal()
    try:
        active = db.scalar(select(Season).where(Season.status == SeasonStatus.ACTIVE))
        season_id_for_seasonal = active.id if active else None

        existing_codes = set(
            db.scalars(select(Mission.code).where(Mission.code.in_([m[0] for m in MISSIONS])))
        )

        created = 0
        for code, name, exp_reward, is_weekly, _target in MISSIONS:
            if code in existing_codes:
                continue
            db.add(Mission(
                code=code,
                name=name,
                description=None,
                exp_reward=exp_reward,
                is_weekly=is_weekly,
                is_active=True,
                season_id=None if is_weekly else season_id_for_seasonal,
            ))
            created += 1
        db.commit()
        print(f"OK · {created} misiones creadas · {len(existing_codes)} ya existían")
    finally:
        db.close()


if __name__ == "__main__":
    run()
