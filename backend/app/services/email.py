"""Backend de email con tres modos:
- `console` (default dev): imprime al log.
- `smtp`: smtplib clásico (Gmail, AWS SES SMTP, etc.).
- `resend`: API de Resend (free tier 3k/mes, mejor entregabilidad). Recomendado prod.

Se elige vía `EMAIL_BACKEND` en .env. Resend pide `RESEND_API_KEY`.
"""
import logging
import smtplib
from email.message import EmailMessage

import httpx

from app.core.config import settings

log = logging.getLogger("email")

RESEND_API = "https://api.resend.com/emails"


def send(*, to: str, subject: str, body: str, html: str | None = None) -> bool:
    """Manda un email. body=texto plano (fallback), html=opcional para Resend/SMTP."""
    if settings.email_backend == "console":
        log.info("[EMAIL · console] To=%s Subject=%s\n%s", to, subject, body)
        return True

    if settings.email_backend == "resend":
        return _send_resend(to=to, subject=subject, body=body, html=html)

    if settings.email_backend == "smtp":
        return _send_smtp(to=to, subject=subject, body=body, html=html)

    log.error("EMAIL_BACKEND desconocido: %s", settings.email_backend)
    return False


def _send_resend(*, to: str, subject: str, body: str, html: str | None) -> bool:
    if not settings.resend_api_key:
        log.error("RESEND_API_KEY vacío — no se puede enviar")
        return False
    payload = {
        "from": settings.email_from,
        "to": [to],
        "subject": subject,
        "text": body,
    }
    if html:
        payload["html"] = html
    try:
        with httpx.Client(timeout=10.0) as cli:
            r = cli.post(
                RESEND_API,
                json=payload,
                headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            )
        if r.status_code in (200, 202):
            log.info("Email enviado vía Resend a %s (id=%s)", to, r.json().get("id"))
            return True
        log.error("Resend %s: %s", r.status_code, r.text[:300])
    except httpx.RequestError as e:
        log.exception("Resend request error: %s", e)
    return False


def _send_smtp(*, to: str, subject: str, body: str, html: str | None) -> bool:
    if not (settings.smtp_host and settings.smtp_user and settings.smtp_password):
        log.error("SMTP no configurado (host/user/password vacíos). No envío.")
        return False
    msg = EmailMessage()
    msg["From"] = settings.email_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.set_content(body)
    if html:
        msg.add_alternative(html, subtype="html")
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


# ─────────────────────────  Templates  ─────────────────────────

_HTML_BASE = """\
<!DOCTYPE html>
<html><head><meta charset="utf-8">
<style>
  body {{ margin:0; padding:32px 16px; background:#07070c; color:#f5f5fa; font-family:Inter,Arial,sans-serif; }}
  .container {{ max-width:560px; margin:0 auto; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:16px; padding:32px; }}
  h1 {{ color:#fff; margin:0 0 16px; font-size:24px; font-weight:900; letter-spacing:-0.02em; }}
  p {{ color:#bcbcc8; line-height:1.6; margin:8px 0; }}
  .cta {{ display:inline-block; padding:12px 28px; background:linear-gradient(135deg,#7c5cff,#4da3ff); color:white !important; text-decoration:none; border-radius:10px; font-weight:700; margin:20px 0; }}
  .footer {{ color:#666; font-size:12px; text-align:center; margin-top:24px; }}
  .brand {{ color:#a48bff; font-weight:800; letter-spacing:0.4em; font-size:11px; text-transform:uppercase; }}
</style></head>
<body>
  <div class="container">
    <div class="brand">✦ EliteCards</div>
    {body}
    <p class="footer">EliteCards · Plataforma TCG competitiva</p>
  </div>
</body></html>"""


def send_email_verify(*, to: str, alias: str, verify_url: str) -> bool:
    return send(
        to=to,
        subject="Confirma tu cuenta en EliteCards",
        body=(
            f"Hola {alias},\n\nConfirma tu cuenta haciendo clic en este link:\n\n"
            f"{verify_url}\n\nEl link vence en 24 horas. Si no creaste esta cuenta, ignora este mensaje.\n\n— EliteCards"
        ),
        html=_HTML_BASE.format(body=(
            f"<h1>Bienvenido, {alias}</h1>"
            f"<p>Tu Elite ID ya fue generado. Confirmá tu email para desbloquear todas las funcionalidades:</p>"
            f"<p style='text-align:center'><a class='cta' href='{verify_url}'>Confirmar email</a></p>"
            f"<p style='color:#666; font-size:12px'>O copiá este link en tu navegador: <br>{verify_url}</p>"
            f"<p style='color:#666; font-size:12px'>El link vence en 24 horas.</p>"
        )),
    )


def send_password_reset(*, to: str, alias: str, reset_url: str) -> bool:
    return send(
        to=to,
        subject="Restablece tu contraseña en EliteCards",
        body=(
            f"Hola {alias},\n\nPara crear una nueva contraseña, hacé clic acá:\n\n{reset_url}\n\n"
            f"El link vence en 1 hora. Si no solicitaste esto, ignora este mensaje.\n\n— EliteCards"
        ),
        html=_HTML_BASE.format(body=(
            f"<h1>Recuperar contraseña</h1>"
            f"<p>Hola {alias}. Recibimos una solicitud para restablecer tu contraseña.</p>"
            f"<p style='text-align:center'><a class='cta' href='{reset_url}'>Crear nueva contraseña</a></p>"
            f"<p style='color:#666; font-size:12px'>O copiá este link: <br>{reset_url}</p>"
            f"<p style='color:#666; font-size:12px'>El link vence en 1 hora. Si no fuiste vos, ignorá este mensaje — tu contraseña sigue intacta.</p>"
        )),
    )
