"""Crea tablas announcements + product_wishlists. Idempotente."""
from sqlalchemy import inspect

from app.core.db import engine
from app.models import Announcement, ProductWishlist


def main():
    insp = inspect(engine)
    for tbl, model in [
        ("announcements", Announcement),
        ("product_wishlists", ProductWishlist),
    ]:
        if tbl in insp.get_table_names():
            print(f"· {tbl} ya existe")
        else:
            model.__table__.create(bind=engine)
            print(f"✓ {tbl} creada")


if __name__ == "__main__":
    main()
