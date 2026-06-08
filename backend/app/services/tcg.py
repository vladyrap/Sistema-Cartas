"""Servicio TCG: normalización + parser de decklists + validador contra
GameFormat + banlist.

Parser soporta los formatos más comunes:
  - "4 Lightning Bolt"
  - "4x Lightning Bolt"
  - "Lightning Bolt x4"
  - "4 Lightning Bolt (M11)"          ← ignora set entre paréntesis
  - "4 Lightning Bolt | M11 | 142"    ← ignora set/collector después de pipe
  - "LEADER: Monkey D. Luffy"         ← carta líder (One Piece / Hololive)
  - "// Sideboard" o "Sideboard:"     ← delimitador
  - "// Extra Deck" o "Extra Deck:"   ← delimitador (YGO)
  - Líneas vacías o que arrancan con "#" se ignoran (comentarios).
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Iterable


_PUNCT_RE = re.compile(r"[^a-z0-9 ]+")
_WS_RE = re.compile(r"\s+")

# Líneas de cantidad+nombre. Capturamos:
#   - "4 Lightning Bolt"           → qty=4, name="Lightning Bolt"
#   - "4x Lightning Bolt"          → qty=4, name="Lightning Bolt"
#   - "Lightning Bolt x4"          → qty=4, name="Lightning Bolt"
_QTY_PREFIX_RE = re.compile(r"^\s*(\d{1,2})\s*[xX]?\s+(.+?)\s*$")
_QTY_SUFFIX_RE = re.compile(r"^\s*(.+?)\s+[xX]\s*(\d{1,2})\s*$")


def normalize_card_name(raw: str) -> str:
    """Forma comparable: minúsculas, sin acentos, sin puntuación, espacios colapsados."""
    if not raw:
        return ""
    s = unicodedata.normalize("NFKD", raw).encode("ascii", "ignore").decode("ascii")
    s = s.lower()
    s = _PUNCT_RE.sub(" ", s)
    s = _WS_RE.sub(" ", s).strip()
    return s


def _clean_card_name(raw: str) -> str:
    """Despoja set/collector codes del nombre: 'Lightning Bolt (M11) 142' → 'Lightning Bolt'."""
    s = raw.strip()
    # Quitar todo después del primer "|"
    if "|" in s:
        s = s.split("|", 1)[0].strip()
    # Quitar paréntesis con set codes: "(M11)", "[M11]"
    s = re.sub(r"\s*[\(\[][^)\]]{1,30}[\)\]]\s*", " ", s)
    # Quitar collector numbers al final: " 142", " 142/350"
    s = re.sub(r"\s+\d{1,4}(/\d{1,4})?\s*$", "", s)
    return s.strip()


SECTION_RE = re.compile(r"^\s*(?://+\s*)?(sideboard|side|extra\s*deck|extra|maindeck|main|deck)\s*:?\s*$", re.I)
LEADER_RE = re.compile(r"^\s*(?:leader|oshi|líder|lider)\s*:?\s*(.+?)\s*$", re.I)


@dataclass
class ParsedDeck:
    """Resultado del parseo de un decklist crudo."""
    main: list[tuple[int, str]] = field(default_factory=list)  # [(qty, name), ...]
    side: list[tuple[int, str]] = field(default_factory=list)
    extra: list[tuple[int, str]] = field(default_factory=list)
    leader: str | None = None
    parse_errors: list[str] = field(default_factory=list)

    @property
    def main_count(self) -> int:
        return sum(q for q, _ in self.main)

    @property
    def side_count(self) -> int:
        return sum(q for q, _ in self.side)

    @property
    def extra_count(self) -> int:
        return sum(q for q, _ in self.extra)

    @property
    def total_cards(self) -> int:
        return self.main_count + self.side_count + self.extra_count


def parse_decklist(text: str) -> ParsedDeck:
    """Convierte un decklist crudo a ParsedDeck. No falla nunca: si una línea
    no calza, la mete en `parse_errors`."""
    deck = ParsedDeck()
    if not text:
        return deck

    section = "main"
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if line.startswith("#"):
            continue

        # Sección
        m_section = SECTION_RE.match(line)
        if m_section:
            tag = m_section.group(1).lower().replace(" ", "")
            if "side" in tag:
                section = "side"
            elif "extra" in tag:
                section = "extra"
            else:
                section = "main"
            continue

        # Líder
        m_leader = LEADER_RE.match(line)
        if m_leader:
            deck.leader = _clean_card_name(m_leader.group(1))
            continue

        # Cantidad+nombre (prefijo)
        m = _QTY_PREFIX_RE.match(line)
        if m:
            qty = int(m.group(1))
            name = _clean_card_name(m.group(2))
            if not name or qty <= 0:
                deck.parse_errors.append(f"Línea inválida: {raw_line!r}")
                continue
            _push(deck, section, qty, name)
            continue

        # Cantidad+nombre (sufijo)
        m = _QTY_SUFFIX_RE.match(line)
        if m:
            name = _clean_card_name(m.group(1))
            qty = int(m.group(2))
            if not name or qty <= 0:
                deck.parse_errors.append(f"Línea inválida: {raw_line!r}")
                continue
            _push(deck, section, qty, name)
            continue

        # No matchea ningún patrón
        deck.parse_errors.append(f"No pude interpretar: {raw_line!r}")

    return deck


def _push(deck: ParsedDeck, section: str, qty: int, name: str) -> None:
    target = {"main": deck.main, "side": deck.side, "extra": deck.extra}[section]
    # Si la carta ya está, suma cantidades (tolerante a líneas duplicadas).
    name_norm = normalize_card_name(name)
    for i, (q, n) in enumerate(target):
        if normalize_card_name(n) == name_norm:
            target[i] = (q + qty, n)
            return
    target.append((qty, name))


# ============================== Validación ==============================


@dataclass
class DeckValidationIssue:
    severity: str  # "error" o "warning"
    code: str
    message: str


@dataclass
class DeckValidationResult:
    is_legal: bool
    issues: list[DeckValidationIssue] = field(default_factory=list)

    @property
    def errors(self) -> list[DeckValidationIssue]:
        return [i for i in self.issues if i.severity == "error"]

    @property
    def warnings(self) -> list[DeckValidationIssue]:
        return [i for i in self.issues if i.severity == "warning"]


def validate_deck(
    parsed: ParsedDeck,
    *,
    min_main: int,
    max_main: int | None,
    min_side: int,
    max_side: int,
    min_extra: int,
    max_extra: int,
    max_copies: int,
    has_leader: bool,
    is_singleton: bool,
    banlist: Iterable[tuple[str, str]] = (),  # iterable de (norm_name, status_value)
) -> DeckValidationResult:
    """Valida un deck parseado contra los límites de un formato.

    `banlist` es un iterable de tuplas (card_name_norm, status). El validador
    aplica:
      - BANNED → error (0 copias permitidas)
      - LIMITED → max 1 copia
      - SEMI_LIMITED → max 2 copias
      - RESTRICTED → max 1 copia
      - WATCHLIST → warning (legal pero observada)
    """
    issues: list[DeckValidationIssue] = []

    # 1) Counts de cada sección.
    if parsed.main_count < min_main:
        issues.append(DeckValidationIssue(
            "error", "main_too_few",
            f"Mainboard tiene {parsed.main_count} cartas, mínimo {min_main}.",
        ))
    if max_main is not None and parsed.main_count > max_main:
        issues.append(DeckValidationIssue(
            "error", "main_too_many",
            f"Mainboard tiene {parsed.main_count} cartas, máximo {max_main}.",
        ))
    if parsed.side_count < min_side:
        issues.append(DeckValidationIssue(
            "error", "side_too_few",
            f"Sideboard tiene {parsed.side_count} cartas, mínimo {min_side}.",
        ))
    if parsed.side_count > max_side:
        issues.append(DeckValidationIssue(
            "error", "side_too_many",
            f"Sideboard tiene {parsed.side_count} cartas, máximo {max_side}.",
        ))
    if parsed.extra_count < min_extra:
        issues.append(DeckValidationIssue(
            "error", "extra_too_few",
            f"Extra deck tiene {parsed.extra_count} cartas, mínimo {min_extra}.",
        ))
    if parsed.extra_count > max_extra:
        issues.append(DeckValidationIssue(
            "error", "extra_too_many",
            f"Extra deck tiene {parsed.extra_count} cartas, máximo {max_extra}.",
        ))

    # 2) Leader requerido.
    if has_leader and not parsed.leader:
        issues.append(DeckValidationIssue(
            "error", "leader_missing",
            "Este formato requiere una carta líder (LEADER: <nombre>).",
        ))

    # 3) max_copies por nombre (acumulando main+side+extra). Singleton = 1 copia.
    effective_max = 1 if is_singleton else max_copies
    totals: dict[str, tuple[int, str]] = {}  # norm → (count, display_name)
    for qty, name in parsed.main + parsed.side + parsed.extra:
        key = normalize_card_name(name)
        cur, display = totals.get(key, (0, name))
        totals[key] = (cur + qty, display)
    for norm, (count, display) in totals.items():
        if count > effective_max:
            issues.append(DeckValidationIssue(
                "error", "max_copies",
                f"'{display}' aparece {count} veces, máximo {effective_max}.",
            ))

    # 4) Banlist.
    banlist_map = {norm: status for norm, status in banlist}
    for norm, (count, display) in totals.items():
        status = banlist_map.get(norm)
        if status is None:
            continue
        if status == "BANNED":
            issues.append(DeckValidationIssue(
                "error", "banned",
                f"'{display}' está prohibida en este formato.",
            ))
        elif status == "RESTRICTED":
            if count > 1:
                issues.append(DeckValidationIssue(
                    "error", "restricted",
                    f"'{display}' está restringida (máx 1 copia), tienes {count}.",
                ))
        elif status == "LIMITED":
            if count > 1:
                issues.append(DeckValidationIssue(
                    "error", "limited",
                    f"'{display}' está limitada (máx 1 copia), tienes {count}.",
                ))
        elif status == "SEMI_LIMITED":
            if count > 2:
                issues.append(DeckValidationIssue(
                    "error", "semi_limited",
                    f"'{display}' está semi-limitada (máx 2 copias), tienes {count}.",
                ))
        elif status == "WATCHLIST":
            issues.append(DeckValidationIssue(
                "warning", "watchlist",
                f"'{display}' está bajo observación en este formato.",
            ))

    # 5) Errores de parser bajados como warnings.
    for err in parsed.parse_errors:
        issues.append(DeckValidationIssue("warning", "parse", err))

    has_errors = any(i.severity == "error" for i in issues)
    return DeckValidationResult(is_legal=not has_errors, issues=issues)
