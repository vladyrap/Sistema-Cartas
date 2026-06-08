"""decks robustos + event_registration robusta + match_results detallados

Revision ID: 0003_tcg_robust
Revises: 0002_tcg_robust
Create Date: 2026-06-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0003_tcg_robust"
down_revision: Union[str, None] = "0002_tcg_robust"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ------------------ player_decks ------------------
    with op.batch_alter_table("player_decks", schema=None) as batch_op:
        batch_op.add_column(sa.Column("format_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("leader_card", sa.String(length=160), nullable=True))
        batch_op.add_column(sa.Column("main_count", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("side_count", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("extra_count", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("is_legal", sa.Boolean(), nullable=True))
        batch_op.add_column(sa.Column("validation_notes", sa.Text(), nullable=True))
        batch_op.add_column(sa.Column("is_public", sa.Boolean(), nullable=False, server_default=sa.text("0")))
        batch_op.add_column(sa.Column("is_locked", sa.Boolean(), nullable=False, server_default=sa.text("0")))
        batch_op.create_foreign_key(
            "fk_player_decks_format", "game_formats", ["format_id"], ["id"], ondelete="SET NULL"
        )
        batch_op.create_index(batch_op.f("ix_player_decks_format_id"), ["format_id"], unique=False)

    # ------------------ event_registrations ------------------
    with op.batch_alter_table("event_registrations", schema=None) as batch_op:
        batch_op.add_column(sa.Column("deck_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("rounds_draw", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("games_won", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("games_lost", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("match_points", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("dropped", sa.Boolean(), nullable=False, server_default=sa.text("0")))
        batch_op.add_column(sa.Column("dropped_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_foreign_key(
            "fk_event_regs_deck", "player_decks", ["deck_id"], ["id"], ondelete="SET NULL"
        )
        batch_op.create_index(batch_op.f("ix_event_registrations_deck_id"), ["deck_id"], unique=False)

    # ------------------ match_results ------------------
    with op.batch_alter_table("match_results", schema=None) as batch_op:
        batch_op.add_column(sa.Column("table_number", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("is_draw", sa.Boolean(), nullable=False, server_default=sa.text("0")))
        batch_op.add_column(sa.Column("is_bye", sa.Boolean(), nullable=False, server_default=sa.text("0")))
        batch_op.add_column(sa.Column("games_a", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("games_b", sa.Integer(), nullable=False, server_default="0"))
        batch_op.add_column(sa.Column("reported_by_id", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("reported_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.create_foreign_key(
            "fk_match_results_reporter", "users", ["reported_by_id"], ["id"]
        )
        batch_op.create_index(batch_op.f("ix_match_results_round_number"), ["round_number"], unique=False)
        batch_op.create_unique_constraint(
            "uq_match_event_round_pa", ["event_id", "round_number", "player_a_id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("match_results", schema=None) as batch_op:
        batch_op.drop_constraint("uq_match_event_round_pa", type_="unique")
        batch_op.drop_index(batch_op.f("ix_match_results_round_number"))
        batch_op.drop_constraint("fk_match_results_reporter", type_="foreignkey")
        batch_op.drop_column("reported_at")
        batch_op.drop_column("reported_by_id")
        batch_op.drop_column("games_b")
        batch_op.drop_column("games_a")
        batch_op.drop_column("is_bye")
        batch_op.drop_column("is_draw")
        batch_op.drop_column("table_number")

    with op.batch_alter_table("event_registrations", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_event_registrations_deck_id"))
        batch_op.drop_constraint("fk_event_regs_deck", type_="foreignkey")
        batch_op.drop_column("dropped_at")
        batch_op.drop_column("dropped")
        batch_op.drop_column("match_points")
        batch_op.drop_column("games_lost")
        batch_op.drop_column("games_won")
        batch_op.drop_column("rounds_draw")
        batch_op.drop_column("deck_id")

    with op.batch_alter_table("player_decks", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_player_decks_format_id"))
        batch_op.drop_constraint("fk_player_decks_format", type_="foreignkey")
        batch_op.drop_column("is_locked")
        batch_op.drop_column("is_public")
        batch_op.drop_column("validation_notes")
        batch_op.drop_column("is_legal")
        batch_op.drop_column("extra_count")
        batch_op.drop_column("side_count")
        batch_op.drop_column("main_count")
        batch_op.drop_column("leader_card")
        batch_op.drop_column("format_id")
