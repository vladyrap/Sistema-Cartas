import logging
import secrets
from pydantic_settings import BaseSettings, SettingsConfigDict

log = logging.getLogger(__name__)

# Secretos débiles que NUNCA deben usarse fuera de dev.
_WEAK_SECRETS = {
    "dev-secret",
    "dev-secret-not-for-production",
    "change-me-please",
    "change-me",
    "secret",
}


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str
    redis_url: str = "redis://localhost:6379/0"
    jwt_secret: str = "dev-secret"
    jwt_algorithm: str = "HS256"
    jwt_access_ttl_min: int = 15
    jwt_refresh_ttl_days: int = 7
    env: str = "dev"
    allowed_origins: str = "http://localhost:5173"
    # Email backend: "console" (imprime al log, default), "smtp" (manda real)
    email_backend: str = "console"
    email_from: str = "noreply@elitecards.local"
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_tls: bool = True
    # Base URL pública del frontend para construir links en emails
    frontend_url: str = "http://localhost:5173"

    @property
    def cors_origins(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",") if o.strip()]

    @property
    def is_prod(self) -> bool:
        return self.env.lower() in ("prod", "production")

    def validate_security(self) -> None:
        """Llamado al boot. Falla rápido en prod con configuración insegura."""
        if self.jwt_secret.strip().lower() in _WEAK_SECRETS or len(self.jwt_secret) < 32:
            if self.is_prod:
                raise RuntimeError(
                    "JWT_SECRET es débil o default. En producción usa un secreto "
                    "aleatorio de >=32 chars. Generá uno con: "
                    f"python -c 'import secrets;print(secrets.token_urlsafe(48))'"
                )
            log.warning(
                "⚠ JWT_SECRET parece ser default/débil. OK para dev, fatal en prod. "
                "Token sugerido: %s",
                secrets.token_urlsafe(48),
            )
        if self.is_prod and "localhost" in self.allowed_origins:
            log.warning(
                "⚠ ALLOWED_ORIGINS contiene 'localhost' en producción. "
                "Reemplazá por dominios reales."
            )


settings = Settings()
settings.validate_security()
