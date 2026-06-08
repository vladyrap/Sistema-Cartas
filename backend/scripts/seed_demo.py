"""Seed dummy URGENTE — schema multi-tenant.
Crea guild default + juegos + 21 users + temporadas + productos + eventos.
NO toca schema. NO usa drop_all. Idempotente (skip si ya existe).

Uso (en container):
  python -m scripts.seed_demo
"""
from __future__ import annotations
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy.orm import Session

from app.core.db import SessionLocal
from app.core.security import hash_password
from app.models import (
    Achievement, Event, EventStatus, EventType, Game, Guild,
    PlayerProfile, Product, ProductAccess, Season, SeasonStatus,
    Title, User, UserRole,
)
from app.services.elite_id import generate_next_elite_id


def main():
    db: Session = SessionLocal()
    try:
        # ===== 1. Guild default =====
        print("→ Guild default...")
        guild = db.query(Guild).filter(Guild.code == "elitecards").first()
        if not guild:
            guild = Guild(
                code="elitecards",
                name="EliteCards",
                tagline="Plataforma TCG insignia",
                accent_color="#7C3AED",
                status="ACTIVE",
                is_public=True,
            )
            db.add(guild)
            db.flush()
        print(f"  guild_id={guild.id}")

        # ===== 2. Juegos =====
        print("→ Juegos TCG...")
        games_data = [
            ("one_piece", "One Piece Card Game", "One Piece"),
            ("pokemon", "Pokémon TCG", "Pokémon"),
            ("union_arena", "Union Arena", "Union Arena"),
            ("hololive", "Hololive TCG", "Hololive"),
        ]
        games = {}
        for code, name, short in games_data:
            g = db.query(Game).filter(Game.code == code).first()
            if not g:
                g = Game(code=code, name=name, short_name=short)
                db.add(g)
                db.flush()
            games[code] = g
        print(f"  {len(games)} juegos")

        # ===== 3. Achievements + Titles =====
        print("→ Medallas y títulos...")
        for code, name, desc in [
            ("first_blood", "Primera Sangre", "Tu primer torneo competitivo"),
            ("survivor", "Sobreviviente", "Asiste a 10 eventos"),
            ("mentor_seal", "Sello del Mentor", "Trae 5 nuevos jugadores"),
            ("trader_master", "Maestro del Trueque", "5 Trade Days"),
            ("perfect_run", "Carrera Perfecta", "Gana torneo sin perder"),
            ("season_marathoner", "Maratonista", "Todas las semanas"),
        ]:
            if not db.query(Achievement).filter(Achievement.code == code).first():
                db.add(Achievement(
                    guild_id=guild.id, code=code, name=name, description=desc,
                    is_seasonal=False, is_secret=False,
                ))
        for code, name, desc in [
            ("champion_t1", "Campeón T1", "Ganaste la primera temporada"),
            ("champion_t2", "Campeón T2", "Ganaste la segunda temporada"),
            ("founder", "Fundador", "Te uniste el primer mes"),
        ]:
            if not db.query(Title).filter(Title.code == code).first():
                db.add(Title(guild_id=guild.id, code=code, name=name, description=desc))
        db.flush()
        print("  medallas + títulos OK")

        # ===== 4. Users =====
        print("→ Admin + 19 players + demo_player...")
        def upsert_user(email: str, pw: str, role: UserRole, alias: str, full_name: str, klass: str, fav_game: str | None):
            u = db.query(User).filter(User.email == email).first()
            if not u:
                u = User(email=email, password_hash=hash_password(pw), role=role, is_active=True)
                db.add(u)
                db.flush()
            if not db.query(PlayerProfile).filter(PlayerProfile.user_id == u.id).first():
                code, num = generate_next_elite_id(db)
                db.add(PlayerProfile(
                    user_id=u.id, alias=alias, full_name=full_name,
                    elite_id_code=code, elite_id_number=num,
                    player_class=klass,
                    favorite_game_id=games[fav_game].id if fav_game else None,
                ))
            return u

        upsert_user("admin@elitecards.cl", "admin123", UserRole.ADMIN, "admin", "Administrador", "DUELISTA", "one_piece")
        upsert_user("player@elitecards.cl", "player123", UserRole.PLAYER, "DemoPlayer", "Demo Player", "DUELISTA", "one_piece")
        players_data = [
            ("ShadowKaiser", "Kaiser Pérez", "DUELISTA", "one_piece"),
            ("PixelMage", "Mauricio Silva", "ESTRATEGA", "pokemon"),
            ("LunaRose", "Luna Rosales", "COLECCIONISTA", "hololive"),
            ("AceVortex", "Andrés Vergara", "DUELISTA", "one_piece"),
            ("KaijuMaster", "Karen Jiménez", "TRADER", "union_arena"),
            ("VortexWolf", "Víctor Olivares", "EXPLORADOR", "pokemon"),
            ("NovaLight", "Nora Liriano", "MENTOR", "hololive"),
            ("RagnarSteel", "Rodrigo Naranjo", "DUELISTA", "union_arena"),
            ("StarCleric", "Sebastián Tapia", "ESTRATEGA", "pokemon"),
            ("DraconisX", "Daniel Rodríguez", "DUELISTA", "one_piece"),
            ("EmberKnight", "Esteban Bravo", "COLECCIONISTA", "one_piece"),
            ("MysticArrow", "Macarena Astudillo", "ESTRATEGA", "hololive"),
            ("PhantomRider", "Pablo Ramírez", "DUELISTA", "union_arena"),
            ("OracleZenith", "Olivia Zúñiga", "MENTOR", "pokemon"),
            ("CrimsonHowl", "Camilo Henríquez", "TRADER", "one_piece"),
            ("FrostFalcon", "Fernanda Figueroa", "EXPLORADOR", "hololive"),
            ("EchoSpark", "Elías Sandoval", "DUELISTA", "pokemon"),
            ("BlazeWisp", "Bárbara Walker", "COLECCIONISTA", "union_arena"),
            ("ZenithRune", "Zacarías Reyes", "ESTRATEGA", "one_piece"),
        ]
        for alias, full_name, klass, fav in players_data:
            upsert_user(f"{alias.lower()}@elitecards.cl", "player123", UserRole.PLAYER, alias, full_name, klass, fav)
        db.flush()
        print(f"  {len(players_data) + 2} usuarios OK")

        # ===== 5. Temporadas =====
        print("→ Temporadas T1 (CLOSED) + T2 (CLOSED) + T3 (ACTIVE)...")
        now = datetime.now(timezone.utc)
        for number, name, start_off, end_off, status, close_off in [
            (1, "Temporada 1 — El Despertar", -270, -180, SeasonStatus.CLOSED, -178),
            (2, "Temporada 2 — El Ascenso", -170, -80, SeasonStatus.CLOSED, -78),
            (3, "Temporada 3 — La Coronación", -70, 20, SeasonStatus.ACTIVE, None),
        ]:
            if db.query(Season).filter(Season.guild_id == guild.id, Season.number == number).first():
                continue
            db.add(Season(
                guild_id=guild.id, number=number, name=name,
                starts_at=now + timedelta(days=start_off),
                ends_at=now + timedelta(days=end_off),
                status=status,
                closed_at=(now + timedelta(days=close_off)) if close_off is not None else None,
                description="Temporada generada por seed demo",
            ))
        db.flush()
        print("  3 temporadas OK")

        # ===== 6. Productos =====
        print("→ Catálogo de productos...")
        products_data = [
            ("One Piece OP-01 Booster", "one_piece", 4990, ProductAccess.NORMAL, 50, 0, False),
            ("One Piece Starter Deck Rojo", "one_piece", 9990, ProductAccess.NORMAL, 30, 0, False),
            ("Pokémon Paldea Evolved Booster", "pokemon", 5490, ProductAccess.NORMAL, 80, 0, False),
            ("Pokémon ETB Obsidian Flames", "pokemon", 54990, ProductAccess.NORMAL, 12, 0, False),
            ("Union Arena Demon Slayer", "union_arena", 4790, ProductAccess.NORMAL, 40, 0, False),
            ("Hololive Gen 0 Booster", "hololive", 5990, ProductAccess.NORMAL, 25, 0, False),
            ("[Preventa] OP-06 Wings of Captain", "one_piece", 4990, ProductAccess.ELITE_ACCESS, 15, 45, True),
            ("[Preventa] Pokémon Twilight Masquerade", "pokemon", 5990, ProductAccess.ELITE_ACCESS, 20, 45, True),
            ("Hololive Promo Card Set (Pro)", "hololive", 19990, ProductAccess.ELITE_PRO, 8, 75, False),
        ]
        for name, game_code, price, access, stock, req_lvl, is_preorder in products_data:
            if db.query(Product).filter(Product.guild_id == guild.id, Product.name == name).first():
                continue
            db.add(Product(
                guild_id=guild.id, name=name,
                game_id=games[game_code].id,
                category="booster" if "Booster" in name else "deck" if "Deck" in name else "other",
                price_clp=Decimal(price),
                stock=stock,
                access=access,
                required_level=req_lvl,
                is_preorder=is_preorder,
                is_active=True,
            ))
        db.flush()
        print(f"  {len(products_data)} productos OK")

        # ===== 7. Eventos =====
        print("→ Eventos próximos...")
        events_data = [
            ("Torneo OP-01 Mensual", EventType.MONTHLY_LEAGUE, 5, "one_piece"),
            ("Pokémon League Weekly", EventType.WEEKLY_LEAGUE, 8, "pokemon"),
            ("Hololive Trade Day", EventType.TRADE_DAY, 12, "hololive"),
            ("Union Arena Sealed", EventType.COMPETITIVE, 18, "union_arena"),
            ("OP Gran Premio T3", EventType.ELITE_CHALLENGE, 25, "one_piece"),
            ("Beginner Friendly Friday", EventType.BEGINNER_EVENT, 3, "pokemon"),
        ]
        for name, etype, days_ahead, game_code in events_data:
            if db.query(Event).filter(Event.guild_id == guild.id, Event.name == name).first():
                continue
            db.add(Event(
                guild_id=guild.id, name=name,
                game_id=games[game_code].id,
                event_type=etype,
                status=EventStatus.OPEN,
                starts_at=now + timedelta(days=days_ahead),
                ends_at=now + timedelta(days=days_ahead, hours=4),
                slots=32,
                price_clp=Decimal(5000),
                description=f"Evento {etype.value} de la comunidad",
            ))
        db.flush()
        print(f"  {len(events_data)} eventos OK")

        db.commit()
        print("")
        print("=" * 60)
        print("✓ SEED DEMO COMPLETO")
        print("=" * 60)
        print(f"  Admin   : admin@elitecards.cl / admin123")
        print(f"  Demo    : player@elitecards.cl / player123")
        print(f"  Otros   : <alias>@elitecards.cl / player123")
        print(f"            ej: shadowkaiser@elitecards.cl")
        print(f"  Guild   : elitecards (id={guild.id})")
        print(f"  Juegos  : {len(games)}")
        print(f"  Usuarios: {len(players_data) + 2}")
        print(f"  Productos: {len(products_data)}")
        print(f"  Eventos : {len(events_data)}")
        print("=" * 60)
    except Exception as e:
        db.rollback()
        print(f"ERROR: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    main()
