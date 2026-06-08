"""player_ratings + event_brackets + bracket_nodes

Revision ID: 0005_tcg_advanced
Revises: 0004_tcg_robust
Create Date: 2026-06-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0005_tcg_advanced"
down_revision: Union[str, None] = "0004_tcg_robust"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "player_ratings",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("player_id", sa.Integer(), nullable=False),
        sa.Column("game_id", sa.Integer(), nullable=False),
        sa.Column("rating", sa.Float(), nullable=False, server_default="1500"),
        sa.Column("rd", sa.Float(), nullable=False, server_default="350"),
        sa.Column("volatility", sa.Float(), nullable=False, server_default="0.06"),
        sa.Column("matches_played", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("last_match_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("peak_rating", sa.Float(), nullable=False, server_default="1500"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["player_id"], ["player_profiles.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["game_id"], ["games.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("player_id", "game_id", name="uq_player_rating_game"),
    )
    with op.batch_alter_table("player_ratings", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_player_ratings_player_id"), ["player_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_player_ratings_game_id"), ["game_id"], unique=False)

    op.create_table(
        "event_brackets",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("event_id", sa.Integer(), nullable=False),
        sa.Column("size", sa.Integer(), nullable=False, server_default="8"),
        sa.Column("is_complete", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["event_id"], ["events.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("event_id", name="uq_event_bracket"),
    )

    op.create_table(
        "bracket_nodes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("bracket_id", sa.Integer(), nullable=False),
        sa.Column("level", sa.Integer(), nullable=False),
        sa.Column("slot", sa.Integer(), nullable=False),
        sa.Column("player_a_id", sa.Integer(), nullable=True),
        sa.Column("player_b_id", sa.Integer(), nullable=True),
        sa.Column("winner_id", sa.Integer(), nullable=True),
        sa.Column("seed_a", sa.Integer(), nullable=True),
        sa.Column("seed_b", sa.Integer(), nullable=True),
        sa.Column("games_a", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("games_b", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["bracket_id"], ["event_brackets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["player_a_id"], ["player_profiles.id"]),
        sa.ForeignKeyConstraint(["player_b_id"], ["player_profiles.id"]),
        sa.ForeignKeyConstraint(["winner_id"], ["player_profiles.id"]),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("bracket_id", "level", "slot", name="uq_bracket_node_pos"),
    )
    with op.batch_alter_table("bracket_nodes", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_bracket_nodes_bracket_id"), ["bracket_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("bracket_nodes", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_bracket_nodes_bracket_id"))
    op.drop_table("bracket_nodes")
    op.drop_table("event_brackets")

    with op.batch_alter_table("player_ratings", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_player_ratings_game_id"))
        batch_op.drop_index(batch_op.f("ix_player_ratings_player_id"))
    op.drop_table("player_ratings")
