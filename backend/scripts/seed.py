"""Seed inicial para EliteCards.

Genera:
  - 4 juegos TCG.
  - Catálogo de medallas y títulos.
  - 20 jugadores (1 admin + 19 players).
  - Temporada T1 (CLOSED) con jugadores que llegaron a Maestro/Campeón.
  - Temporada T2 (CLOSED).
  - Temporada T3 (ACTIVE) — aplica regla de reset:
      * Maestros/Campeones de T2 comienzan como Duelista N10.
      * El resto como Iniciado N1.
  - Productos normales, pro y preventas.
  - Reservas en distintos estados.
  - Eventos próximos.

Uso:
  python -m scripts.seed
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.db import SessionLocal, engine
from app.core.security import hash_password
from app.models import (
    Achievement,
    AttendanceStatus,
    Base,
    Event,
    EventRegistration,
    EventStatus,
    EventType,
    Game,
    HallOfFameEntry,
    PaymentStatus,
    PlayerProfile,
    PrestigeTransaction,
    Product,
    ProductAccess,
    RankName,
    Reservation,
    ReservationStatus,
    Season,
    SeasonHistory,
    SeasonProgress,
    SeasonStatus,
    Title,
    User,
    UserRole,
)
from app.services.elite_id import generate_next_elite_id
from app.services.progression import (
    PROMOTED_STARTING_LEVEL,
    cumulative_exp_to_reach,
    rank_from_level,
    starting_level_for_new_season,
)


def reset_db() -> None:
    print("→ Drop & create all tables...")
    Base.metadata.drop_all(bind=engine)
    Base.metadata.create_all(bind=engine)


def seed_games(db: Session) -> dict[str, Game]:
    print("→ Seeding games...")
    games_data = [
        ("one_piece", "One Piece Card Game", "One Piece"),
        ("pokemon", "Pokémon TCG", "Pokémon"),
        ("union_arena", "Union Arena", "Union Arena"),
        ("hololive", "Hololive TCG", "Hololive"),
    ]
    games = {}
    for code, name, short in games_data:
        g = Game(code=code, name=name, short_name=short)
        db.add(g)
        games[code] = g
    db.flush()
    return games


def seed_achievements_titles(db: Session) -> None:
    print("→ Seeding catálogo de medallas y títulos...")
    achievements = [
        ("first_blood", "Primera Sangre", "Tu primer torneo competitivo"),
        ("survivor", "Sobreviviente", "Asiste a 10 eventos en una temporada"),
        ("mentor_seal", "Sello del Mentor", "Trae a 5 nuevos jugadores"),
        ("trader_master", "Maestro del Trueque", "Participa en 5 Trade Days"),
        ("perfect_run", "Carrera Perfecta", "Gana un torneo sin perder rondas"),
        ("season_marathoner", "Maratonista de Temporada", "Participa todas las semanas de una temporada"),
    ]
    for code, name, desc in achievements:
        db.add(Achievement(code=code, name=name, description=desc))

    titles = [
        ("champion_t1", "Campeón Temporada I", "Ganaste la primera temporada de EliteCards"),
        ("champion_t2", "Campeón Temporada II", "Ganaste la segunda temporada"),
        ("founder", "Fundador", "Te uniste durante el primer mes de la plataforma"),
    ]
    for code, name, desc in titles:
        db.add(Title(code=code, name=name, description=desc))
    db.flush()


def seed_users_and_players(db: Session, games: dict[str, Game]) -> list[PlayerProfile]:
    print("→ Seeding usuarios y perfiles (1 admin + 19 players)...")
    # Admin
    admin = User(
        email="admin@elitecards.cl",
        password_hash=hash_password("admin123"),
        role=UserRole.ADMIN,
    )
    db.add(admin)
    db.flush()
    code, num = generate_next_elite_id(db)
    db.add(PlayerProfile(
        user_id=admin.id, alias="admin", full_name="Administrador",
        elite_id_code=code, elite_id_number=num, player_class="DUELISTA",
    ))

    players_data = [
        # (alias, full_name, class, favorite_game_code)
        ("ShadowKaiser", "Kaiser Pérez",       "DUELISTA",      "one_piece"),
        ("PixelMage",    "Mauricio Silva",     "ESTRATEGA",     "pokemon"),
        ("LunaRose",     "Luna Rosales",       "COLECCIONISTA", "hololive"),
        ("AceVortex",    "Andrés Vergara",     "DUELISTA",      "one_piece"),
        ("KaijuMaster",  "Karen Jiménez",      "TRADER",        "union_arena"),
        ("VortexWolf",   "Víctor Olivares",    "EXPLORADOR",    "pokemon"),
        ("NovaLight",    "Nora Liriano",       "MENTOR",        "hololive"),
        ("RagnarSteel",  "Rodrigo Naranjo",    "DUELISTA",      "union_arena"),
        ("StarCleric",   "Sebastián Tapia",    "ESTRATEGA",     "pokemon"),
        ("DraconisX",    "Daniel Rodríguez",   "DUELISTA",      "one_piece"),
        ("EmberKnight",  "Esteban Bravo",      "COLECCIONISTA", "one_piece"),
        ("MysticArrow",  "Macarena Astudillo", "ESTRATEGA",     "hololive"),
        ("PhantomRider", "Pablo Ramírez",      "DUELISTA",      "union_arena"),
        ("OracleZenith", "Olivia Zúñiga",      "MENTOR",        "pokemon"),
        ("CrimsonHowl",  "Camilo Henríquez",   "TRADER",        "one_piece"),
        ("FrostFalcon",  "Fernanda Figueroa",  "EXPLORADOR",    "hololive"),
        ("EchoSpark",    "Elías Sandoval",     "DUELISTA",      "pokemon"),
        ("BlazeWisp",    "Bárbara Walker",     "COLECCIONISTA", "union_arena"),
        ("ZenithRune",   "Zacarías Reyes",     "ESTRATEGA",     "one_piece"),
    ]
    players: list[PlayerProfile] = []
    for alias, full_name, klass, game_code in players_data:
        u = User(
            email=f"{alias.lower()}@elitecards.cl",
            password_hash=hash_password("player123"),
            role=UserRole.PLAYER,
        )
        db.add(u)
        db.flush()
        code, num = generate_next_elite_id(db)
        p = PlayerProfile(
            user_id=u.id,
            alias=alias,
            full_name=full_name,
            elite_id_code=code,
            elite_id_number=num,
            player_class=klass,
            favorite_game_id=games[game_code].id,
        )
        db.add(p)
        players.append(p)
    db.flush()
    return players


def seed_seasons_and_history(db: Session, players: list[PlayerProfile]) -> dict[str, Season]:
    """Crea T1 + T2 cerradas con resultados, y T3 ACTIVE aplicando la regla."""
    print("→ Seeding 2 temporadas cerradas (T1, T2) + 1 ACTIVE (T3)...")

    now = datetime.now(timezone.utc)
    seasons: dict[str, Season] = {}

    # ----- T1 -----
    t1 = Season(
        number=1,
        name="Temporada 1 — El Despertar",
        starts_at=now - timedelta(days=270),
        ends_at=now - timedelta(days=180),
        status=SeasonStatus.CLOSED,
        closed_at=now - timedelta(days=178),
        description="Primera temporada. La leyenda comienza.",
    )
    db.add(t1)
    db.flush()
    seasons["T1"] = t1

    # En T1 marcamos a 3 players como Campeón/Maestro y otros distribuidos
    t1_results = _distribute_results(players, top_count=2, master_count=2)
    for player_id, (final_level, position) in t1_results.items():
        max_rank = rank_from_level(final_level)
        db.add(SeasonHistory(
            season_id=t1.id, player_id=player_id,
            final_level=final_level, final_exp_total=cumulative_exp_to_reach(final_level),
            max_rank=max_rank, final_position=position,
            prestige_earned=0,
        ))

    # ----- T2 -----
    t2 = Season(
        number=2,
        name="Temporada 2 — Forja del Reto",
        starts_at=now - timedelta(days=180),
        ends_at=now - timedelta(days=10),
        status=SeasonStatus.CLOSED,
        closed_at=now - timedelta(days=8),
        previous_season_id=t1.id,
        description="Segunda temporada. Reto del campeón.",
    )
    db.add(t2)
    db.flush()
    seasons["T2"] = t2

    # En T2 distribuimos resultados — algunos suben a Maestro/Campeón, otros bajan
    t2_results = _distribute_results(players, top_count=1, master_count=3, shuffle_seed=42)
    for player_id, (final_level, position) in t2_results.items():
        max_rank = rank_from_level(final_level)
        db.add(SeasonHistory(
            season_id=t2.id, player_id=player_id,
            final_level=final_level, final_exp_total=cumulative_exp_to_reach(final_level),
            max_rank=max_rank, final_position=position,
            prestige_earned=0,
        ))

    # Hall of Fame entries para T1 y T2 (top 3 y campeón)
    for season_id, results in [(t1.id, t1_results), (t2.id, t2_results)]:
        ranked = sorted(results.items(), key=lambda kv: kv[1][1])  # por position asc
        if ranked:
            db.add(HallOfFameEntry(
                season_id=season_id, player_id=ranked[0][0],
                category="season_champion", note="Campeón de temporada",
            ))
            for pid, (_, pos) in ranked[:8]:
                if pos > 1:
                    db.add(HallOfFameEntry(
                        season_id=season_id, player_id=pid,
                        category="top_8", note=f"Top 8 (#{pos})",
                    ))

    db.flush()

    # ----- T3 ACTIVE (aplica regla de reset) -----
    t3 = Season(
        number=3,
        name="Temporada 3 — Era del Acero",
        starts_at=now - timedelta(days=2),
        ends_at=now + timedelta(days=85),
        status=SeasonStatus.ACTIVE,
        previous_season_id=t2.id,
        description="Temporada actual. La Ruta del Campeón sigue.",
    )
    db.add(t3)
    db.flush()
    seasons["T3"] = t3

    # Crear SeasonProgress para cada jugador aplicando la regla:
    promoted_count = 0
    for player in players:
        prev_max = db.query(SeasonHistory.max_rank).filter_by(
            season_id=t2.id, player_id=player.id
        ).scalar()
        starting = starting_level_for_new_season(prev_max)
        was_promoted = starting == PROMOTED_STARTING_LEVEL
        starting_rank = rank_from_level(starting)

        # Algunos progresos ya con algo de EXP para que el dashboard se vea poblado
        bonus = random.choice([0, 50, 150, 320, 700])
        from app.services.progression import apply_exp_delta
        new_level, new_exp_in, _ = apply_exp_delta(starting, 0, bonus)

        from app.services.exp import _rank_index
        current_rank = rank_from_level(new_level)
        max_r = starting_rank if _rank_index(starting_rank) >= _rank_index(current_rank) else current_rank

        db.add(SeasonProgress(
            season_id=t3.id, player_id=player.id,
            starting_level=starting, was_promoted_start=was_promoted,
            level=new_level, exp_in_level=new_exp_in,
            exp_total=bonus,
            max_rank=max_r, current_rank=current_rank,
        ))
        if was_promoted:
            promoted_count += 1

    print(f"   ✓ {promoted_count} jugadores comienzan como Duelista N10 por mérito en T2")

    db.flush()
    return seasons


def seed_products(db: Session, games: dict[str, Game]) -> None:
    print("→ Seeding productos del catálogo...")
    products = [
        # Catálogo Normal
        ("Sobre One Piece OP-09", games["one_piece"].id, "Booster", 4990, 50, ProductAccess.NORMAL, 1, False),
        ("Sobre Pokémon Surging Sparks", games["pokemon"].id, "Booster", 5990, 80, ProductAccess.NORMAL, 1, False),
        ("Sobre Union Arena Bleach", games["union_arena"].id, "Booster", 4490, 30, ProductAccess.NORMAL, 1, False),
        ("Deck Hololive Starter", games["hololive"].id, "Deck", 12990, 20, ProductAccess.NORMAL, 1, False),
        # Elite Access (req nivel 15+)
        ("Caja Sellada Pokémon 151", games["pokemon"].id, "Sealed Box", 89990, 15, ProductAccess.ELITE_ACCESS, 15, False),
        ("Box Premium One Piece", games["one_piece"].id, "Sealed Box", 74990, 10, ProductAccess.ELITE_ACCESS, 15, False),
        # Elite Pro (req nivel 25+)
        ("Carta Promo Holográfica Pokémon", games["pokemon"].id, "Promo", 24990, 5, ProductAccess.ELITE_PRO, 25, False),
        ("Display Edición Limitada Union Arena", games["union_arena"].id, "Display", 199990, 3, ProductAccess.ELITE_PRO, 25, False),
        # Preventas
        ("Preventa Sobre Hololive Wave 3", games["hololive"].id, "Booster", 5490, 100, ProductAccess.NORMAL, 1, True),
        ("Preventa One Piece OP-10", games["one_piece"].id, "Booster", 4990, 200, ProductAccess.NORMAL, 1, True),
    ]
    for name, game_id, category, price, stock, access, req_level, is_preorder in products:
        db.add(Product(
            name=name, game_id=game_id, category=category,
            price_clp=Decimal(price), stock=stock,
            access=access, required_level=req_level,
            is_preorder=is_preorder, is_active=True,
        ))
    db.flush()


def seed_events(db: Session, games: dict[str, Game], seasons: dict[str, Season], players: list[PlayerProfile]) -> None:
    print("→ Seeding 8 eventos próximos en T3...")
    now = datetime.now(timezone.utc)
    t3 = seasons["T3"]
    events_data = [
        ("Torneo Casual One Piece — Sábado", games["one_piece"].id, EventType.CASUAL, 7, 16, 5000),
        ("Liga Semanal Pokémon", games["pokemon"].id, EventType.WEEKLY_LEAGUE, 4, 24, 3000),
        ("Elite Challenge Union Arena", games["union_arena"].id, EventType.ELITE_CHALLENGE, 14, 8, 8000),
        ("Trade Day — Todos los juegos", games["one_piece"].id, EventType.TRADE_DAY, 10, 50, 0),
        ("Torneo Competitivo Pokémon", games["pokemon"].id, EventType.COMPETITIVE, 21, 32, 10000),
        ("Liga Mensual One Piece", games["one_piece"].id, EventType.MONTHLY_LEAGUE, 30, 32, 15000),
        ("Evento Novatos Hololive", games["hololive"].id, EventType.BEGINNER_EVENT, 5, 12, 2000),
        ("Final Elite T3 (futuro)", games["one_piece"].id, EventType.FINAL_ELITE, 80, 16, 25000),
    ]
    for name, game_id, etype, days_ahead, slots, price in events_data:
        ev = Event(
            name=name, game_id=game_id, season_id=t3.id,
            event_type=etype, status=EventStatus.OPEN,
            starts_at=now + timedelta(days=days_ahead),
            slots=slots, price_clp=Decimal(price),
            description=f"Evento de {name}.",
        )
        db.add(ev)
        db.flush()
        # Inscribir 3 jugadores random en cada uno
        for player in random.sample(players, min(3, len(players))):
            db.add(EventRegistration(
                event_id=ev.id, player_id=player.id,
                payment_status=PaymentStatus.PAID if price else PaymentStatus.PENDING,
                attendance_status=AttendanceStatus.PENDING,
                registered_at=now - timedelta(hours=random.randint(1, 48)),
            ))
    db.flush()


def seed_reservations(db: Session, players: list[PlayerProfile]) -> None:
    print("→ Seeding reservas demo...")
    from app.models import Product
    products = list(db.query(Product).all())
    statuses = [ReservationStatus.PENDING, ReservationStatus.APPROVED, ReservationStatus.PAID, ReservationStatus.EXPIRED]
    for i, status in enumerate(statuses):
        player = players[i % len(players)]
        product = random.choice(products)
        db.add(Reservation(
            player_id=player.id, product_id=product.id,
            quantity=1, status=status,
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
            note=f"Reserva demo #{i + 1}",
        ))
    db.flush()


def _distribute_results(
    players: list[PlayerProfile],
    *,
    top_count: int,
    master_count: int,
    shuffle_seed: int = 0,
) -> dict[int, tuple[int, int]]:
    """Devuelve mapa player_id → (final_level, final_position).

    `top_count` = cuántos terminan con final_level 30 (Campeón)
    `master_count` = cuántos terminan entre niveles 25-29 (Maestro)
    El resto se reparten entre 1-24 con distribución decreciente.
    """
    rng = random.Random(shuffle_seed)
    ordered = list(players)
    rng.shuffle(ordered)

    results: dict[int, tuple[int, int]] = {}
    pos = 1
    # Top tier (Campeón) — nivel 30
    for p in ordered[:top_count]:
        results[p.id] = (30, pos)
        pos += 1
    # Maestros — niveles 25-29
    for p in ordered[top_count:top_count + master_count]:
        results[p.id] = (rng.randint(25, 29), pos)
        pos += 1
    # Resto — distribución
    remaining = ordered[top_count + master_count:]
    for i, p in enumerate(remaining):
        # Niveles progresivamente más bajos: primeros llegan a Retador/Elite, últimos a Iniciado
        if i < len(remaining) * 0.3:
            level = rng.randint(15, 24)
        elif i < len(remaining) * 0.6:
            level = rng.randint(7, 14)
        else:
            level = rng.randint(1, 6)
        results[p.id] = (level, pos)
        pos += 1
    return results


def main() -> None:
    print("=" * 60)
    print("EliteCards — Seed inicial")
    print("=" * 60)

    reset_db()
    db: Session = SessionLocal()
    try:
        games = seed_games(db)
        seed_achievements_titles(db)
        players = seed_users_and_players(db, games)
        seasons = seed_seasons_and_history(db, players)
        seed_products(db, games)
        seed_events(db, games, seasons, players)
        seed_reservations(db, players)
        db.commit()
        print()
        print("=" * 60)
        print("✓ Seed completado.")
        print(f"  - Admin: admin@elitecards.cl / admin123")
        print(f"  - Players: <alias_minuscula>@elitecards.cl / player123")
        print(f"  - Temporada activa: T3 (Era del Acero)")
        print("=" * 60)
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
