"""Crea la tabla tcg_news. Idempotente."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.db import engine
from app.models import TcgNews


def main() -> None:
    TcgNews.__table__.create(engine, checkfirst=True)
    print("[ok] tcg_news ready")


if __name__ == "__main__":
    main()
