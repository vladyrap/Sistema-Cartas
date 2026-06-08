"""game_formats + game_sets + banlist_entries

Revision ID: 0002_tcg_robust
Revises: 1ed686273e87
Create Date: 2026-06-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0002_tcg_robust"
down_revision: Union[str, None] = "1ed686273e87"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "game_formats",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("game_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=40), nullable=False),
        sa.Column("name", sa.String(length=120), nullable=False),
        sa.Column("description", sa.String(length=500), nullable=True),
        sa.Column("min_main", sa.Integer(), nullable=False, server_default="60"),
        sa.Column("max_main", sa.Integer(), nullable=True),
        sa.Column("min_side", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_side", sa.Integer(), nullable=False, server_default="15"),
        sa.Column("min_extra", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_extra", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("max_copies", sa.Integer(), nullable=False, server_default="4"),
        sa.Column("has_leader", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_singleton", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("is_rotating", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("rotation_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="100"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["game_id"], ["games.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("game_id", "code", name="uq_game_format_code"),
    )
    with op.batch_alter_table("game_formats", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_game_formats_game_id"), ["game_id"], unique=False)

    op.create_table(
        "game_sets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("game_id", sa.Integer(), nullable=False),
        sa.Column("code", sa.String(length=20), nullable=False),
        sa.Column("name", sa.String(length=160), nullable=False),
        sa.Column("released_at", sa.Date(), nullable=True),
        sa.Column("total_cards", sa.Integer(), nullable=True),
        sa.Column("rotates_out_at", sa.Date(), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["game_id"], ["games.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("game_id", "code", name="uq_game_set_code"),
    )
    with op.batch_alter_table("game_sets", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_game_sets_game_id"), ["game_id"], unique=False)

    op.create_table(
        "banlist_entries",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("format_id", sa.Integer(), nullable=False),
        sa.Column("card_name", sa.String(length=160), nullable=False),
        sa.Column("card_name_norm", sa.String(length=160), nullable=False),
        sa.Column(
            "status",
            sa.Enum("BANNED", "RESTRICTED", "LIMITED", "SEMI_LIMITED", "WATCHLIST", name="banlist_status"),
            nullable=False,
            server_default="BANNED",
        ),
        sa.Column("notes", sa.String(length=500), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["format_id"], ["game_formats.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("format_id", "card_name_norm", name="uq_banlist_format_card"),
    )
    with op.batch_alter_table("banlist_entries", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_banlist_entries_format_id"), ["format_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_banlist_entries_card_name_norm"), ["card_name_norm"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("banlist_entries", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_banlist_entries_card_name_norm"))
        batch_op.drop_index(batch_op.f("ix_banlist_entries_format_id"))
    op.drop_table("banlist_entries")

    with op.batch_alter_table("game_sets", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_game_sets_game_id"))
    op.drop_table("game_sets")

    with op.batch_alter_table("game_formats", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_game_formats_game_id"))
    op.drop_table("game_formats")
