"""Mega-seed: population masiva sobre el seed base.

Asume que `scripts.seed` ya corrió. Agrega:
  - 200 jugadores extra con nombres procedurales
  - 5 temporadas históricas (T1-T5) con SeasonHistory rico
  - 50 eventos COMPETITIVE finalizados con 3-5 rondas Swiss reales
    → genera ~3000 MatchResults
    → tournament.report_match dispara apply_match_rating (Glicko-2)
  - Decks ejemplo
  - Variantes (SKU) por producto seleccionado
  - HallOfFame entries

Uso:
  python -m scripts.seed_massive
  (asume DB ya seedeada con scripts.seed)
"""
from __future__ import annotations

import random
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import (
    AttendanceStatus,
    BanlistEntry,
    BanlistStatus,
    Event,
    EventRegistration,
    EventStatus,
    EventType,
    Game,
    GameFormat,
    Guild,
    GuildMembership,
    GuildRole,
    HallOfFameEntry,
    MatchResult,
    PaymentStatus,
    PlayerClass,
    PlayerDeck,
    PlayerProfile,
    PlayerRating,
    Product,
    ProductAccess,
    ProductVariant,
    CardCondition,
    CardLanguage,
    RankName,
    Season,
    SeasonHistory,
    SeasonProgress,
    SeasonStatus,
    User,
    UserRole,
)
from app.services.elite_id import generate_next_elite_id
from app.services import tournament as tour_svc
from app.services import rating as rating_svc


rng = random.Random(7777)


# ============================== Nombres procedurales ==============================


ADJECTIVES = [
    "Crimson", "Astral", "Obsidian", "Spectral", "Verdant", "Frozen", "Solar",
    "Ethereal", "Shadow", "Radiant", "Ironclad", "Mystic", "Phantom", "Vortex",
    "Quantum", "Eclipse", "Nova", "Stellar", "Twilight", "Storm", "Inferno",
    "Glacial", "Lunar", "Cosmic", "Blazing", "Mirage", "Thunder", "Silent",
    "Wild", "Iron", "Velvet", "Neon", "Prismatic", "Void", "Toxic",
    "Volcanic", "Sapphire", "Onyx", "Amber", "Iridescent",
]

NOUNS = [
    "Reaper", "Knight", "Sage", "Hunter", "Phoenix", "Dragon", "Wraith",
    "Witch", "Paladin", "Rogue", "Mage", "Warlock", "Druid", "Necromancer",
    "Ranger", "Cleric", "Berserker", "Sorcerer", "Assassin", "Templar",
    "Spectre", "Falcon", "Wolf", "Tiger", "Serpent", "Raven", "Hawk",
    "Bear", "Lion", "Viper", "Crow", "Owl", "Lynx", "Stag", "Boar",
    "Khaos", "Echo", "Pulse", "Wave", "Flare", "Spark", "Glitch", "Ghost",
]

FIRST_NAMES_CL = [
    "Joaquín", "Matías", "Vicente", "Tomás", "Benjamín", "Lucas", "Diego",
    "Camila", "Francisca", "Constanza", "Antonia", "Catalina", "Isidora",
    "Renato", "Cristóbal", "Felipe", "Sebastián", "Maximiliano", "Agustín",
    "Sofía", "Valentina", "Florencia", "Javiera", "Martina", "Trinidad",
    "Bastián", "Ignacio", "Vicente", "Emilia", "Amparo", "Magdalena",
]

LAST_NAMES_CL = [
    "González", "Rojas", "Muñoz", "Pérez", "Soto", "Contreras", "Silva",
    "Martínez", "Sepúlveda", "Tapia", "Espinoza", "Castillo", "Vargas",
    "Núñez", "Riquelme", "Saavedra", "Pino", "Vergara", "Ortiz", "Ramírez",
    "Cáceres", "Fuentes", "Gutiérrez", "Mella", "Bravo", "Hidalgo",
    "Cisternas", "Lagos", "Pizarro", "Cofré", "Arancibia",
]

CLASSES = ["DUELISTA", "ESTRATEGA", "COLECCIONISTA", "MENTOR", "TRADER", "EXPLORADOR"]


def gen_alias(used: set[str]) -> str:
    for _ in range(50):
        alias = rng.choice(ADJECTIVES) + rng.choice(NOUNS) + str(rng.randint(0, 99))
        if alias not in used:
            used.add(alias)
            return alias
    # Fallback con timestamp
    return f"Wanderer{rng.randint(1000, 9999)}"


def gen_full_name() -> str:
    return f"{rng.choice(FIRST_NAMES_CL)} {rng.choice(LAST_NAMES_CL)} {rng.choice(LAST_NAMES_CL)}"


# ============================== Population helpers ==============================


def spawn_players(db: Session, *, count: int, guild: Guild, games: list[Game]) -> list[PlayerProfile]:
    print(f"→ Spawning {count} jugadores procedurales...")
    used_aliases = {p.alias for p in db.scalars(select(PlayerProfile))}
    used_emails = {u.email for u in db.scalars(select(User))}
    new_players: list[PlayerProfile] = []
    now = datetime.now(timezone.utc)
    for i in range(count):
        alias = gen_alias(used_aliases)
        email = f"{alias.lower()}@elitecards.cl"
        if email in used_emails:
            continue
        used_emails.add(email)
        u = User(
            email=email,
            password_hash=hash_password("player123"),
            role=UserRole.PLAYER,
        )
        db.add(u); db.flush()
        db.add(GuildMembership(
            user_id=u.id, guild_id=guild.id,
            role=GuildRole.MEMBER, is_active=True,
            joined_at=now - timedelta(days=rng.randint(1, 180)),
        ))
        code, num = generate_next_elite_id(db)
        klass = rng.choice(CLASSES)
        p = PlayerProfile(
            user_id=u.id,
            alias=alias,
            full_name=gen_full_name(),
            elite_id_code=code,
            elite_id_number=num,
            player_class=klass,
            favorite_game_id=rng.choice(games).id,
            bio=rng.choice([
                None, None,
                f"Jugando desde la T{rng.randint(1,3)}. {rng.choice(['Casual','Competitivo','Casual+Trade','Solo torneos','Streamer'])}.",
                f"Main {rng.choice(['Aggro','Control','Midrange','Combo','Stall'])}.",
                "Vamos por la T3.",
            ]),
        )
        db.add(p)
        new_players.append(p)
        if (i + 1) % 50 == 0:
            db.flush()
            print(f"   · {i + 1}/{count} creados")
    db.flush()
    return new_players


def spawn_historical_seasons(
    db: Session, *, guild: Guild, all_players: list[PlayerProfile]
) -> dict[str, Season]:
    """Crea T4 cerrada con resultados ricos (T1-T3 ya existen del seed base)."""
    print("→ Spawning temporada histórica T4 cerrada...")
    now = datetime.now(timezone.utc)
    t3 = db.scalar(select(Season).where(Season.number == 3, Season.guild_id == guild.id))

    t4 = Season(
        guild_id=guild.id, number=4,
        name="Temporada 4 — Vacío Profundo",
        starts_at=now - timedelta(days=400),
        ends_at=now - timedelta(days=300),
        status=SeasonStatus.CLOSED,
        closed_at=now - timedelta(days=298),
        previous_season_id=t3.id if t3 else None,
        description="Temporada legendaria. Récord de inscritos.",
    )
    db.add(t4); db.flush()

    # SeasonHistory para 80 jugadores random
    sample = rng.sample(all_players, min(80, len(all_players)))
    levels_dist = (
        [(30, 1), (29, 2), (28, 3), (27, 4)] +  # top 4 (campeón + finalistas)
        [(rng.randint(24, 29), pos) for pos in range(5, 11)] +  # top 10 maestros
        [(rng.randint(15, 23), pos) for pos in range(11, 31)] +  # elite/retador
        [(rng.randint(7, 14), pos) for pos in range(31, 60)] +
        [(rng.randint(1, 6), pos) for pos in range(60, 81)]
    )
    levels_dist = levels_dist[:len(sample)]

    from app.services.progression import cumulative_exp_to_reach, rank_from_level
    for player, (level, pos) in zip(sample, levels_dist):
        max_rank = rank_from_level(level)
        db.add(SeasonHistory(
            season_id=t4.id, player_id=player.id,
            final_level=level,
            final_exp_total=cumulative_exp_to_reach(level),
            max_rank=max_rank, final_position=pos,
            prestige_earned=rng.choice([0, 0, 50, 100, 150]),
        ))
        if pos == 1:
            db.add(HallOfFameEntry(
                season_id=t4.id, player_id=player.id,
                category="season_champion", note="Campeón Temporada IV",
            ))
        elif pos <= 8:
            db.add(HallOfFameEntry(
                season_id=t4.id, player_id=player.id,
                category="top_8", note=f"Top 8 T4 · #{pos}",
            ))

    # T5 ACTIVE para que el cosmos tenga datos ricos también
    t5 = Season(
        guild_id=guild.id, number=5,
        name="Temporada 5 — Ascensión Final",
        starts_at=now - timedelta(days=14),
        ends_at=now + timedelta(days=76),
        status=SeasonStatus.DRAFT,  # mantenemos T3 como ACTIVE del seed base
        previous_season_id=t4.id,
        description="La nueva era.",
    )
    db.add(t5); db.flush()

    return {"T4": t4, "T5": t5}


def spawn_events_with_matches(
    db: Session, *, guild: Guild, games: list[Game],
    players: list[PlayerProfile], event_count: int = 50,
) -> int:
    """Crea N eventos FINISHED competitivos con 3-5 rondas Swiss reales.
    Devuelve cantidad de matches generados (debería ser ~event_count * avg_rounds * avg_pairs).
    """
    print(f"→ Spawning {event_count} eventos competitivos finalizados con matches…")
    now = datetime.now(timezone.utc)
    total_matches = 0

    season_active = db.scalar(
        select(Season).where(Season.guild_id == guild.id, Season.status == SeasonStatus.ACTIVE)
    )

    competitive_types = [
        EventType.COMPETITIVE,
        EventType.ELITE_CHALLENGE,
        EventType.WEEKLY_LEAGUE,
        EventType.MONTHLY_LEAGUE,
    ]

    for i in range(event_count):
        game = rng.choice(games)
        etype = rng.choice(competitive_types)
        # Eventos pasados con timestamps distribuidos en los últimos 6 meses
        days_ago = rng.randint(5, 180)
        starts = now - timedelta(days=days_ago, hours=rng.randint(0, 23))
        ends = starts + timedelta(hours=rng.choice([4, 6, 8]))

        ev = Event(
            guild_id=guild.id,
            name=f"{rng.choice(['Liga', 'Copa', 'Torneo', 'Open', 'Challenge', 'Cup'])} "
                 f"{game.short_name or game.name} #{i + 100}",
            game_id=game.id,
            season_id=season_active.id if season_active else None,
            event_type=etype,
            status=EventStatus.FINISHED,
            starts_at=starts, ends_at=ends,
            slots=rng.choice([8, 16, 24, 32]),
            price_clp=Decimal(rng.choice([0, 3000, 5000, 8000, 10000])),
            description=f"Evento competitivo #{i + 100}.",
        )
        db.add(ev); db.flush()

        # Inscribir 8-16 jugadores random
        roster_size = rng.choice([8, 12, 16])
        roster = rng.sample(players, min(roster_size, len(players)))
        regs = []
        for p in roster:
            reg = EventRegistration(
                event_id=ev.id, player_id=p.id,
                payment_status=PaymentStatus.PAID,
                attendance_status=AttendanceStatus.ATTENDED,
                registered_at=starts - timedelta(hours=rng.randint(1, 72)),
            )
            db.add(reg); regs.append(reg)
        db.flush()

        # Correr 3-5 rondas Swiss reales con tour_svc
        rounds = rng.choice([3, 4, 5])
        for round_num in range(rounds):
            pairings = tour_svc.generate_pairings(db, event_id=ev.id)
            if not pairings:
                break
            matches = tour_svc.persist_pairings(db, event_id=ev.id, pairings=pairings)
            for m in matches:
                if m.is_bye:
                    total_matches += 1
                    continue
                # Resultado pseudo-aleatorio influenciado por rating actual
                ra = db.scalar(select(PlayerRating).where(
                    PlayerRating.player_id == m.player_a_id,
                    PlayerRating.game_id == game.id,
                ))
                rb = db.scalar(select(PlayerRating).where(
                    PlayerRating.player_id == m.player_b_id,
                    PlayerRating.game_id == game.id,
                ))
                # Probabilidad de que A gane: sigmoid del rating diff
                ra_val = ra.rating if ra else 1500
                rb_val = rb.rating if rb else 1500
                p_a = 1.0 / (1.0 + 10 ** ((rb_val - ra_val) / 400))
                # Tirar resultado (BO3)
                if rng.random() < p_a:
                    winner = m.player_a_id
                    ga, gb = 2, rng.choice([0, 1])
                else:
                    winner = m.player_b_id
                    ga, gb = rng.choice([0, 1]), 2
                # 8% empate
                is_draw = rng.random() < 0.08
                if is_draw:
                    winner = None
                    ga, gb = 1, 1

                tour_svc.report_match(
                    db, match_id=m.id,
                    winner_id=winner, is_draw=is_draw,
                    games_a=ga, games_b=gb,
                )
                total_matches += 1

        # Asignar posiciones finales
        try:
            tour_svc.finalize_positions(db, event_id=ev.id)
        except Exception:
            pass

        if (i + 1) % 10 == 0:
            db.commit()
            print(f"   · {i + 1}/{event_count} eventos — {total_matches} matches acumulados")

    db.commit()
    return total_matches


def spawn_decks(
    db: Session, *, players: list[PlayerProfile], games: list[Game], per_player: int = 2,
) -> int:
    print(f"→ Spawning decks (~{per_player} por jugador)…")
    archetypes_per_game = {
        "one_piece":   ["Red Luffy Aggro", "Blue Doflamingo Control", "Green Bonney Midrange", "Black Lucci Tempo"],
        "pokemon":     ["Charizard ex", "Lugia VSTAR", "Mew VMAX", "Pidgey Control", "Iron Hands"],
        "union_arena": ["Bleach Aggro", "JJK Combo", "Hunter x Hunter Tempo", "Demon Slayer Burn"],
        "hololive":    ["Sora Pure", "Calliope Reaper", "Korone OTK", "Pekora Burn"],
    }
    formats = {f.game_id: f for f in db.scalars(select(GameFormat))}
    games_by_id = {g.id: g for g in games}
    count = 0
    for p in players:
        for _ in range(per_player):
            game = rng.choice(games)
            archs = archetypes_per_game.get(game.code, ["Generic Midrange"])
            archetype = rng.choice(archs)
            fmt = formats.get(game.id)
            deck = PlayerDeck(
                player_id=p.id,
                game_id=game.id,
                format_id=fmt.id if fmt else None,
                name=f"{archetype} {rng.choice(['v1','v2','v3','Tier1','Champ'])}",
                archetype=archetype,
                list_text=None,
                main_count=rng.choice([50, 60]),
                side_count=rng.choice([0, 15]),
                extra_count=0,
                is_public=rng.random() < 0.3,
                is_legal=rng.random() < 0.85,
            )
            db.add(deck); count += 1
    db.flush()
    return count


def spawn_product_variants(db: Session) -> int:
    print("→ Spawning variantes de productos seleccionados…")
    # Tomar 8 productos al azar y darles 3-5 variantes
    products = list(db.scalars(select(Product).limit(40)))
    sample = rng.sample(products, min(8, len(products)))
    conditions = [CardCondition.NM, CardCondition.LP, CardCondition.MP]
    langs = [CardLanguage.ES, CardLanguage.EN, CardLanguage.JP]
    count = 0
    used_skus = {v.sku for v in db.scalars(select(ProductVariant))}
    for p in sample:
        for _ in range(rng.randint(3, 5)):
            cond = rng.choice(conditions)
            lang = rng.choice(langs)
            foil = rng.random() < 0.3
            sku = f"SKU-{p.id}-{cond.value}-{lang.value}{'F' if foil else ''}-{rng.randint(100,999)}"
            if sku in used_skus:
                continue
            used_skus.add(sku)
            base_price = int(p.price_clp or 5000)
            mult = {CardCondition.NM: 1.0, CardCondition.LP: 0.85, CardCondition.MP: 0.65}[cond]
            if foil:
                mult *= 1.8
            db.add(ProductVariant(
                product_id=p.id,
                sku=sku,
                condition=cond,
                language=lang,
                is_foil=foil,
                price_clp=Decimal(int(base_price * mult)),
                stock=rng.randint(1, 12),
            ))
            count += 1
        p.has_variants = True
    db.flush()
    return count


def spawn_banlist_extras(db: Session) -> int:
    """Más entradas de banlist para que se vea poblado."""
    print("→ Spawning banlist entries extra…")
    formats = list(db.scalars(select(GameFormat)))
    cards_per_format = {
        "one_piece": [("Yamato", "BANNED"), ("Crocodile", "RESTRICTED"), ("Sanji", "WATCHLIST")],
        "pokemon":   [("Klefki", "BANNED"), ("Iono", "WATCHLIST"), ("Path to the Peak", "RESTRICTED")],
        "union_arena": [("Ulquiorra", "BANNED"), ("Gojo Satoru", "RESTRICTED")],
        "hololive":  [("Calliope OTK", "BANNED")],
    }
    from app.services.tcg import normalize_card_name
    count = 0
    for f in formats:
        game = db.get(Game, f.game_id)
        if not game: continue
        for card, status in cards_per_format.get(game.code, []):
            norm = normalize_card_name(card)
            existing = db.scalar(select(BanlistEntry).where(
                BanlistEntry.format_id == f.id, BanlistEntry.card_name_norm == norm
            ))
            if existing: continue
            db.add(BanlistEntry(
                format_id=f.id,
                card_name=card,
                card_name_norm=norm,
                status=BanlistStatus[status],
                notes=f"Banlist {game.short_name} — actualización ago 2026.",
            ))
            count += 1
    db.flush()
    return count


# ============================== Main ==============================


def main() -> None:
    print("=" * 70)
    print("EliteCards — MEGA SEED (population masiva)")
    print("=" * 70)
    db: Session = SessionLocal()
    try:
        guild = db.scalar(select(Guild).limit(1))
        if not guild:
            print("⚠ Primero corré `python -m scripts.seed`")
            return
        games = list(db.scalars(select(Game)))
        if not games:
            print("⚠ No hay games seedeados")
            return

        # 1. Players procedurales
        existing_players = list(db.scalars(select(PlayerProfile)))
        print(f"   Existentes antes: {len(existing_players)} jugadores")
        new_players = spawn_players(db, count=200, guild=guild, games=games)
        all_players = existing_players + new_players
        print(f"   Total tras spawn: {len(all_players)} jugadores")

        # 2. Temporadas históricas
        spawn_historical_seasons(db, guild=guild, all_players=all_players)
        db.commit()

        # 3. Decks
        deck_count = spawn_decks(db, players=new_players, games=games, per_player=2)
        db.commit()
        print(f"   ✓ {deck_count} decks creados")

        # 4. Banlist extras
        bl_count = spawn_banlist_extras(db)
        db.commit()
        print(f"   ✓ {bl_count} entradas banlist extra")

        # 5. Variantes producto
        var_count = spawn_product_variants(db)
        db.commit()
        print(f"   ✓ {var_count} variantes (SKU) creadas")

        # 6. EVENTOS con MATCHES REALES (lo más costoso — ratings Glicko convergen)
        total_matches = spawn_events_with_matches(
            db, guild=guild, games=games,
            players=all_players, event_count=50,
        )

        # 7. Stats finales
        from sqlalchemy import func as _f
        print()
        print("=" * 70)
        print("✓ MEGA SEED completado")
        print(f"  Jugadores totales: {db.scalar(select(_f.count(PlayerProfile.id)))}")
        print(f"  Eventos totales: {db.scalar(select(_f.count(Event.id)))}")
        print(f"  Matches totales: {db.scalar(select(_f.count(MatchResult.id)))}")
        print(f"  Ratings calculados: {db.scalar(select(_f.count(PlayerRating.id)))}")
        print(f"  Decks: {db.scalar(select(_f.count(PlayerDeck.id)))}")
        print(f"  Product variants: {db.scalar(select(_f.count(ProductVariant.id)))}")
        print(f"  HallOfFame: {db.scalar(select(_f.count(HallOfFameEntry.id)))}")
        print("=" * 70)
    finally:
        db.close()


if __name__ == "__main__":
    main()
