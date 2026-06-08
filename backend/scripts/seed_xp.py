"""Asigna XP en la temporada activa a todos los jugadores.

Distribución pensada para la demo:
- demo_player en N20 (Aprendiz alto)
- 1 Campeón (N100), 2 Maestros (~N90), varios Élite/Retador, base de Aprendiz/Iniciado
"""
from __future__ import annotations
from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.models import (
    ExpTransaction, PlayerProfile, Season, SeasonProgress, SeasonStatus, User,
)
from app.services.progression import cumulative_exp_to_reach, rank_from_level


# alias → nivel objetivo en la temporada activa
TARGETS = {
    "DemoPlayer": 20,         # player@elitecards.cl
    "BlazeWisp": 100,         # ← CAMPEÓN
    "DraconisX": 92,          # Maestro top
    "ZenithRune": 88,         # Maestro
    "ShadowKaiser": 78,       # Élite top
    "LunaRose": 65,           # Élite
    "RagnarSteel": 60,        # Élite bajo
    "PixelMage": 55,          # Retador top
    "NovaLight": 50,          # Retador
    "EchoSpark": 45,          # Retador
    "KaijuMaster": 42,        # Retador bajo
    "VortexWolf": 38,         # Duelista top
    "StarCleric": 35,         # Duelista
    "EmberKnight": 30,        # Aprendiz top
    "MysticArrow": 28,        # Aprendiz
    "PhantomRider": 25,       # Aprendiz
    "OracleZenith": 22,       # Aprendiz
    "CrimsonHowl": 18,        # Iniciado top
    "FrostFalcon": 15,        # Iniciado
    "AceVortex": 12,          # Iniciado
}


def main():
    db: Session = SessionLocal()
    try:
        season = db.query(Season).filter(Season.status == SeasonStatus.ACTIVE).order_by(Season.number.desc()).first()
        if not season:
            print("ERROR: no hay temporada ACTIVE")
            return
        print(f"→ Temporada activa: T{season.number} '{season.name}' (id={season.id})")

        # limpiar SeasonProgress + ExpTransaction existentes de esta temporada
        deleted = db.query(SeasonProgress).filter(SeasonProgress.season_id == season.id).delete()
        deleted_tx = db.query(ExpTransaction).filter(ExpTransaction.season_id == season.id).delete()
        if deleted or deleted_tx:
            print(f"  limpieza: {deleted} progresos + {deleted_tx} transacciones previas")
        db.flush()

        ok = 0
        skipped = 0
        for alias, target_level in TARGETS.items():
            profile = db.query(PlayerProfile).filter(PlayerProfile.alias == alias).first()
            if not profile:
                print(f"  ! sin profile para {alias}, skip")
                skipped += 1
                continue

            total_xp = cumulative_exp_to_reach(target_level)
            xp_at_level_start = cumulative_exp_to_reach(target_level)
            xp_at_next = cumulative_exp_to_reach(target_level + 1) if target_level < 100 else total_xp
            exp_in_level = 0  # le ponemos arriba justo del breakpoint del nivel
            rank = rank_from_level(target_level)
            rank_value = rank.value if hasattr(rank, "value") else str(rank)

            sp = SeasonProgress(
                season_id=season.id,
                player_id=profile.id,
                starting_level=1,
                was_promoted_start=False,
                level=target_level,
                exp_in_level=exp_in_level,
                exp_total=total_xp,
                max_rank=rank_value,
                current_rank=rank_value,
            )
            db.add(sp)

            # 1 transacción "Seed demo" con el total
            db.add(ExpTransaction(
                season_id=season.id,
                player_id=profile.id,
                amount=total_xp,
                reason="Carga inicial demo (seed)",
                reason_code="SEED_DEMO",
            ))
            ok += 1
            print(f"  ✓ {alias:14s} → N{target_level:3d} · {total_xp:>7d} XP · {rank_value}")

        db.commit()
        print(f"\n✓ {ok} jugadores con XP, {skipped} sin profile")
    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
