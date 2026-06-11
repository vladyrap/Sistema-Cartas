"""Crea la tabla coming_soon_pages. Idempotente."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.db import engine
from app.models import ComingSoonPage


def main() -> None:
    ComingSoonPage.__table__.create(engine, checkfirst=True)
    print("[ok] coming_soon_pages ready")


if __name__ == "__main__":
    main()
