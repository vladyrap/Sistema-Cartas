"""Política de contraseñas + chequeo opcional contra HaveIBeenPwned.

HIBP usa k-anonymity: enviamos los primeros 5 chars del SHA1, nunca el password
entero. Si la API falla o es lenta, no bloquea el register (fail-open).
"""
import hashlib
import logging
import re

import httpx

log = logging.getLogger("password_policy")

MIN_LENGTH = 8
MAX_LENGTH = 128
COMMON = {
    "password", "12345678", "qwerty12", "abc12345", "password1",
    "11111111", "iloveyou", "admin123", "letmein1", "welcome1",
    "monkey123", "dragon01", "master12", "passw0rd", "qwertyui",
}


class PasswordPolicyError(ValueError):
    """Excepción cuando el password no cumple. mensaje = explicación al user."""


def validate(password: str, *, alias: str | None = None, email: str | None = None) -> None:
    """Levanta PasswordPolicyError si el password no cumple. None si OK."""
    if not password or not isinstance(password, str):
        raise PasswordPolicyError("Contraseña requerida")
    if len(password) < MIN_LENGTH:
        raise PasswordPolicyError(f"Mínimo {MIN_LENGTH} caracteres")
    if len(password) > MAX_LENGTH:
        raise PasswordPolicyError(f"Máximo {MAX_LENGTH} caracteres")
    if password.lower() in COMMON:
        raise PasswordPolicyError("Esa contraseña está en la lista de las más comunes")
    if alias and alias.lower() in password.lower():
        raise PasswordPolicyError("La contraseña no puede contener tu alias")
    if email:
        local = email.split("@", 1)[0].lower()
        if len(local) >= 4 and local in password.lower():
            raise PasswordPolicyError("La contraseña no puede contener tu email")
    # Requiere al menos 1 letra y 1 dígito (relativamente laxo, no es enterprise)
    if not re.search(r"[A-Za-z]", password) or not re.search(r"\d", password):
        raise PasswordPolicyError("La contraseña debe incluir letras y al menos un número")


def hibp_pwned_count(password: str, *, timeout: float = 2.0) -> int:
    """Devuelve cuántas veces el password aparece en HIBP. 0 si no está / falló.

    Usa k-anonymity: solo envía los 5 primeros chars del SHA1.
    """
    if not password:
        return 0
    sha1 = hashlib.sha1(password.encode("utf-8")).hexdigest().upper()
    prefix, suffix = sha1[:5], sha1[5:]
    try:
        with httpx.Client(timeout=timeout) as cli:
            r = cli.get(
                f"https://api.pwnedpasswords.com/range/{prefix}",
                headers={"Add-Padding": "true", "User-Agent": "EliteCards/1.0"},
            )
        if r.status_code != 200:
            return 0
    except httpx.RequestError as e:
        log.info("HIBP check skip (network): %s", e)
        return 0

    for line in r.text.splitlines():
        h, _, count = line.strip().partition(":")
        if h == suffix:
            try:
                return int(count)
            except ValueError:
                return 1
    return 0


def validate_with_hibp(password: str, *, alias: str | None = None, email: str | None = None) -> None:
    """validate() + chequeo HIBP. Si el password apareció >100 veces, lo rechazamos."""
    validate(password, alias=alias, email=email)
    count = hibp_pwned_count(password)
    if count >= 100:
        raise PasswordPolicyError(
            f"Esta contraseña apareció en {count:,} brechas de datos públicas. "
            f"Usá una distinta."
        )
