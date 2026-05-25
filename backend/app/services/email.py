"""Backend de email con dos modos:
- `console` (default): imprime al log. Útil para dev y para no bloquear el flow
  cuando no hay SMTP configurado.
- `smtp`: manda con smtplib. Lee SMTP_HOST/USER/PASSWORD/etc. del .env.

Se elige vía `EMAIL_BACKEND` en .env.
"""
from __future__ import annotations

import logging
import smtplib
from email.message import EmailMessage

from app.core.config import settings

log = logging.getLogger("email")


def send(*, to: str, subject: str, body: str) -> bool:
    """Manda un email. Devuelve True si fue enviado (o impreso en console)."""
    if settings.email_backend == "console":
        log.info("[EMAIL · console] To=%s Subject=%s\n%s", to, subject, body)
        return True

    if settings.email_backend != "smtp":
        log.error("EMAIL_BACKEND desconocido: %s", settings.email_backend)
        return False

    if not (settings.smtp_host and settings.smtp_user and settings.smtp_password):
        log.error("SMTP no configurado (host/user/password vacíos). No envío.")
        return False

    msg = EmailMessage()
    msg["From"] = settings.email_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=10) as s:
            if settings.smtp_tls:
                s.starttls()
            s.login(settings.smtp_user, settings.smtp_password)
            s.send_message(msg)
        log.info("Email enviado vía SMTP a %s", to)
        return True
    except Exception as e:
        log.exception("Fallo al mandar email vía SMTP: %s", e)
        return False


def send_email_verify(*, to: str, alias: str, verify_url: str) -> bool:
    return send(
        to=to,
        subject="Confirma tu cuenta en EliteCards",
        body=(
            f"Hola {alias},\n\n"
            f"Confirma tu cuenta haciendo clic en este link:\n\n"
            f"{verify_url}\n\n"
            f"El link vence en 24 horas. Si no creaste esta cuenta, ignora este mensaje.\n\n"
            f"— EliteCards"
        ),
    )


def send_password_reset(*, to: str, alias: str, reset_url: str) -> bool:
    return send(
        to=to,
        subject="Restablece tu contraseña en EliteCards",
        body=(
            f"Hola {alias},\n\n"
            f"Para crear una nueva contraseña, hacé clic acá:\n\n"
            f"{reset_url}\n\n"
            f"El link vence en 1 hora. Si no solicitaste esto, ignora este mensaje y "
            f"tu contraseña queda intacta.\n\n"
            f"— EliteCards"
        ),
    )
