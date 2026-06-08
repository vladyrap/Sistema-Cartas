"""product_variants + preorder slots + reservation.variant_id

Revision ID: 0004_tcg_robust
Revises: 0003_tcg_robust
Create Date: 2026-06-07
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = "0004_tcg_robust"
down_revision: Union[str, None] = "0003_tcg_robust"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "product_variants",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("product_id", sa.Integer(), nullable=False),
        sa.Column("sku", sa.String(length=60), nullable=False),
        sa.Column("set_id", sa.Integer(), nullable=True),
        sa.Column("collector_number", sa.String(length=20), nullable=True),
        sa.Column(
            "condition",
            sa.Enum("NM", "LP", "MP", "HP", "DMG", "SEALED", name="card_condition"),
            nullable=False, server_default="NM",
        ),
        sa.Column("is_foil", sa.Boolean(), nullable=False, server_default=sa.text("0")),
        sa.Column(
            "language",
            sa.Enum("ES", "EN", "JP", "PT", "FR", "DE", "KR", "ZH", name="card_language"),
            nullable=False, server_default="ES",
        ),
        sa.Column("price_clp", sa.Numeric(precision=10, scale=0), nullable=True),
        sa.Column("stock", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("image_url", sa.String(length=500), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.text("1")),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("(CURRENT_TIMESTAMP)"), nullable=False),
        sa.ForeignKeyConstraint(["product_id"], ["products.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["set_id"], ["game_sets.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("sku", name="uq_product_variant_sku"),
    )
    with op.batch_alter_table("product_variants", schema=None) as batch_op:
        batch_op.create_index(batch_op.f("ix_product_variants_product_id"), ["product_id"], unique=False)
        batch_op.create_index(batch_op.f("ix_product_variants_sku"), ["sku"], unique=False)
        batch_op.create_index(batch_op.f("ix_product_variants_set_id"), ["set_id"], unique=False)

    with op.batch_alter_table("products", schema=None) as batch_op:
        batch_op.add_column(sa.Column("preorder_slots_normal", sa.Integer(), nullable=False, server_default="40"))
        batch_op.add_column(sa.Column("preorder_slots_elite", sa.Integer(), nullable=False, server_default="40"))
        batch_op.add_column(sa.Column("preorder_slots_pro", sa.Integer(), nullable=False, server_default="20"))
        batch_op.add_column(sa.Column("has_variants", sa.Boolean(), nullable=False, server_default=sa.text("0")))

    with op.batch_alter_table("reservations", schema=None) as batch_op:
        batch_op.add_column(sa.Column("variant_id", sa.Integer(), nullable=True))
        batch_op.create_foreign_key(
            "fk_reservations_variant", "product_variants",
            ["variant_id"], ["id"], ondelete="SET NULL",
        )
        batch_op.create_index(batch_op.f("ix_reservations_variant_id"), ["variant_id"], unique=False)


def downgrade() -> None:
    with op.batch_alter_table("reservations", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_reservations_variant_id"))
        batch_op.drop_constraint("fk_reservations_variant", type_="foreignkey")
        batch_op.drop_column("variant_id")

    with op.batch_alter_table("products", schema=None) as batch_op:
        batch_op.drop_column("has_variants")
        batch_op.drop_column("preorder_slots_pro")
        batch_op.drop_column("preorder_slots_elite")
        batch_op.drop_column("preorder_slots_normal")

    with op.batch_alter_table("product_variants", schema=None) as batch_op:
        batch_op.drop_index(batch_op.f("ix_product_variants_set_id"))
        batch_op.drop_index(batch_op.f("ix_product_variants_sku"))
        batch_op.drop_index(batch_op.f("ix_product_variants_product_id"))
    op.drop_table("product_variants")
