"""Migración: endurecer integridad de match_results.

SQLite no soporta ADD CONSTRAINT directo en tablas existentes — la única forma
limpia es crear tabla nueva + copiar + renombrar. Esta migración hace eso si
detecta la versión vieja del schema (sin las nuevas constraints).

Postgres sí soporta ALTER TABLE ADD CONSTRAINT y los aplica directo.

Idempotente: si las constraints ya existen, no hace nada.
"""
from sqlalchemy import inspect, text

from app.core.db import engine


def _is_sqlite() -> bool:
    return engine.dialect.name == "sqlite"


def _has_constraint(insp, table: str, name: str) -> bool:
    # SQLite: las UNIQUE constraints aparecen como índices; las CHECK están en CREATE TABLE
    try:
        for u in insp.get_unique_constraints(table):
            if u.get("name") == name:
                return True
        for c in insp.get_check_constraints(table):
            if c.get("name") == name:
                return True
    except NotImplementedError:
        pass
    return False


def migrate_postgres() -> None:
    """Postgres: ALTER TABLE ADD CONSTRAINT."""
    insp = inspect(engine)
    with engine.begin() as conn:
        if not _has_constraint(insp, "match_results", "uq_match_event_round_pb"):
            conn.execute(text(
                "ALTER TABLE match_results ADD CONSTRAINT uq_match_event_round_pb "
                "UNIQUE (event_id, round_number, player_b_id)"
            ))
            print("+ uq_match_event_round_pb")

        if not _has_constraint(insp, "match_results", "ck_winner_in_players"):
            conn.execute(text(
                "ALTER TABLE match_results ADD CONSTRAINT ck_winner_in_players "
                "CHECK (winner_id IS NULL OR winner_id = player_a_id OR winner_id = player_b_id)"
            ))
            print("+ ck_winner_in_players")

        if not _has_constraint(insp, "match_results", "ck_not_draw_and_bye"):
            conn.execute(text(
                "ALTER TABLE match_results ADD CONSTRAINT ck_not_draw_and_bye "
                "CHECK (NOT (is_draw AND is_bye))"
            ))
            print("+ ck_not_draw_and_bye")

        if not _has_constraint(insp, "match_results", "ck_games_non_negative"):
            conn.execute(text(
                "ALTER TABLE match_results ADD CONSTRAINT ck_games_non_negative "
                "CHECK (games_a >= 0 AND games_b >= 0)"
            ))
            print("+ ck_games_non_negative")

        # Índices
        existing_idx = {i["name"] for i in insp.get_indexes("match_results")}
        if "ix_match_event_pa" not in existing_idx:
            conn.execute(text("CREATE INDEX ix_match_event_pa ON match_results (event_id, player_a_id)"))
            print("+ idx ix_match_event_pa")
        if "ix_match_event_pb" not in existing_idx:
            conn.execute(text("CREATE INDEX ix_match_event_pb ON match_results (event_id, player_b_id)"))
            print("+ idx ix_match_event_pb")


def migrate_sqlite() -> None:
    """SQLite: rebuild de la tabla con las nuevas constraints.

    SQLite es permisivo con CHECK constraints — los aplica en escritura solo si
    están en la definición de CREATE TABLE original. Usamos el approach estándar:
    crear tabla nueva, copiar data, swap.
    """
    from app.models.match_result import MatchResult

    insp = inspect(engine)
    # Detección heurística: si ya existe el índice ix_match_event_pa, asumimos que
    # esta migración ya corrió.
    existing_idx = {i["name"] for i in insp.get_indexes("match_results")}
    if "ix_match_event_pa" in existing_idx:
        print("- migración ya aplicada (idx ix_match_event_pa existe)")
        return

    with engine.begin() as conn:
        # Verificar que no hay datos con winner inválido (sino el CHECK fallaría)
        bad = conn.execute(text(
            "SELECT count(*) FROM match_results "
            "WHERE winner_id IS NOT NULL AND winner_id != player_a_id AND winner_id != player_b_id"
        )).scalar() or 0
        if bad:
            print(f"⚠ {bad} matches con winner_id inválido — limpiando (winner_id=NULL)")
            conn.execute(text(
                "UPDATE match_results SET winner_id = NULL "
                "WHERE winner_id IS NOT NULL AND winner_id != player_a_id AND winner_id != player_b_id"
            ))

        # Verificar duplicados (event, round, player_b) que romperían el UNIQUE
        dupes = conn.execute(text(
            "SELECT event_id, round_number, player_b_id, count(*) c "
            "FROM match_results WHERE player_b_id IS NOT NULL "
            "GROUP BY event_id, round_number, player_b_id HAVING c > 1"
        )).fetchall()
        if dupes:
            print(f"⚠ {len(dupes)} duplicados detectados en (event, round, player_b). Abortando — limpialos manualmente.")
            for d in dupes[:5]:
                print(f"  event_id={d[0]} round={d[1]} player_b={d[2]} count={d[3]}")
            raise RuntimeError("Duplicados en match_results — no se puede aplicar UNIQUE constraint")

        # Rebuild tabla. En SQLite los índices auto-creados (por index=True) se
        # heredan con la tabla al renombrar — debemos dropearlos antes de crear
        # la nueva o la creación falla por nombre colisionado.
        print("Rebuild match_results con nuevas constraints…")
        # Capturar columnas originales para construir el INSERT explícito
        original_cols = [c["name"] for c in insp.get_columns("match_results")]

        # Drop índices nombrados conocidos que SQLAlchemy recrea
        for idx in list(insp.get_indexes("match_results")):
            name = idx.get("name")
            if name:
                conn.execute(text(f"DROP INDEX IF EXISTS {name}"))

        conn.execute(text("ALTER TABLE match_results RENAME TO match_results_old"))
        MatchResult.__table__.create(bind=conn)
        cols_csv = ", ".join(original_cols)
        conn.execute(text(
            f"INSERT INTO match_results ({cols_csv}) SELECT {cols_csv} FROM match_results_old"
        ))
        conn.execute(text("DROP TABLE match_results_old"))
        print("+ match_results rebuilt con UNIQUE compuesta, CHECK constraints, CASCADE, índices")


def main() -> None:
    if _is_sqlite():
        migrate_sqlite()
    else:
        migrate_postgres()


if __name__ == "__main__":
    main()
