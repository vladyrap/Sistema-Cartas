"""Servicio de IA con backend pluggable.

- `anthropic`: usa Claude API real. Requiere ANTHROPIC_API_KEY.
- `mock`: devuelve respuestas canned para dev sin API key. Útil para CI y
  para que el feature funcione "ok" antes de configurar billing.

Patrón Strategy: el caller invoca `complete()` con un prompt + system + JSON
schema opcional, el backend resuelve.
"""
from __future__ import annotations

import json
import logging
from typing import Any

from app.core.config import settings

log = logging.getLogger("ai")


def _mock_response(prompt: str, system: str | None) -> str:
    """Mock determinístico — útil para tests y para dev sin API key."""
    if "decklist" in prompt.lower() or "deck" in (system or "").lower():
        return json.dumps({
            "game": "Magic: The Gathering",
            "archetype": "Aggro (mock)",
            "strengths": [
                "Curva baja con presión temprana",
                "Card draw consistente",
            ],
            "weaknesses": [
                "Vulnerable a sweepers en mid-game",
                "Poca interacción con threats grandes",
            ],
            "suggestions": [
                "Considerar 2 copias de Skullcrack",
                "Aumentar la línea de tierras a 22",
            ],
            "summary": "[MOCK] Análisis simulado. Configura ANTHROPIC_API_KEY para análisis real.",
        })
    if "summary" in (system or "").lower() or "resumen" in prompt.lower():
        return (
            "[MOCK] Esta semana en tu Gremio: nuevos miembros, eventos activos y "
            "EXP repartida. Configura ANTHROPIC_API_KEY para resúmenes reales con Claude."
        )
    return "[MOCK] AI response. Configura ANTHROPIC_API_KEY para usar Claude API real."


def complete(prompt: str, *, system: str | None = None, max_tokens: int = 1024) -> str:
    """Llama al LLM y devuelve el texto de la respuesta."""
    if settings.ai_backend == "mock" or not settings.anthropic_api_key:
        return _mock_response(prompt, system)

    if settings.ai_backend != "anthropic":
        log.error("AI_BACKEND desconocido: %s", settings.ai_backend)
        return _mock_response(prompt, system)

    try:
        # Import lazy: si la lib no está instalada y el backend es mock, no crashea.
        import anthropic
    except ImportError:
        log.error("anthropic package no instalado pero AI_BACKEND=anthropic")
        return _mock_response(prompt, system)

    client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
    try:
        msg = client.messages.create(
            model=settings.anthropic_model,
            max_tokens=max_tokens,
            system=system or "",
            messages=[{"role": "user", "content": prompt}],
        )
        # La respuesta de la SDK trae content como list de blocks
        parts = []
        for block in msg.content:
            text = getattr(block, "text", None)
            if text:
                parts.append(text)
        return "".join(parts) or "(respuesta vacía)"
    except Exception as e:
        log.exception("Fallo llamada a Claude API: %s", e)
        return f"[Error AI] {type(e).__name__}: {e}"


def complete_json(prompt: str, *, system: str | None = None, max_tokens: int = 1024) -> dict[str, Any]:
    """Igual que complete() pero parsea la respuesta como JSON.

    Si falla el parsing, devuelve {"raw": text, "error": "parse"}.
    """
    text = complete(prompt, system=system, max_tokens=max_tokens)
    # Defensa: a veces Claude envuelve el JSON en ```json ... ```
    t = text.strip()
    if t.startswith("```"):
        # Remove triple-backtick fence
        lines = t.split("\n")
        if lines[0].startswith("```"):
            lines = lines[1:]
        if lines and lines[-1].startswith("```"):
            lines = lines[:-1]
        t = "\n".join(lines).strip()
    try:
        return json.loads(t)
    except json.JSONDecodeError:
        return {"raw": text, "error": "parse"}
