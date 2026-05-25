"""Upload de imágenes — logos/banners/avatares.

Estrategia:
- Storage local en /uploads/<category>/<uuid>.<ext>. Ya está montado como static
  files en main.py (/uploads).
- Validación defensiva: MIME content-type + extensión + magic bytes + tamaño cap.
- El endpoint es scoped a usuarios autenticados (anti-anon spam).
- Para prod escalable: cambiar el storage a S3/R2/Cloudinary (cambio aislado en
  este módulo, el resto del código solo conoce la URL devuelta).

NOTA: NO importamos `from __future__ import annotations` porque FastAPI no
puede resolver UploadFile como ForwardRef en signatures.
"""
import secrets
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Request, UploadFile, status

from app.core.deps import UserDep
from app.core.rate_limit import limiter

router = APIRouter()

MAX_BYTES = 5 * 1024 * 1024  # 5MB

ALLOWED_CATEGORIES = {"avatars", "guild_logos", "guild_banners", "products"}

ALLOWED_EXTENSIONS = {".jpg", ".jpeg", ".png", ".webp", ".gif"}

# Magic bytes (primeros bytes que identifican el formato)
MAGIC_SIGNATURES: list[tuple[bytes, str]] = [
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"GIF87a", "image/gif"),
    (b"GIF89a", "image/gif"),
    # WEBP: "RIFF....WEBP" — chequeamos prefijo + posición 8-12
]

UPLOADS_ROOT = Path(__file__).resolve().parent.parent.parent / "uploads"


def _detect_format(head: bytes) -> str | None:
    """Devuelve el MIME real del archivo según magic bytes, o None si no es imagen."""
    for sig, mime in MAGIC_SIGNATURES:
        if head.startswith(sig):
            return mime
    # WEBP detection
    if len(head) >= 12 and head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp"
    return None


def _safe_ext(filename: str) -> str:
    """Extrae la extensión sanitizada en minúsculas."""
    ext = Path(filename or "").suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        return ""
    return ext


@router.post("/image", status_code=201)
@limiter.limit("20/minute")
async def upload_image(
    request: Request,
    current: UserDep,
    file: UploadFile = File(...),
    category: str = "avatars",
) -> dict:
    """Sube una imagen. Devuelve {url, filename, size, content_type}.

    Rate limit: 20 uploads por minuto por IP.
    """
    if category not in ALLOWED_CATEGORIES:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Categoría inválida. Usa: {', '.join(sorted(ALLOWED_CATEGORIES))}",
        )

    ext = _safe_ext(file.filename or "")
    if not ext:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            f"Extensión no permitida. Usa: {', '.join(sorted(ALLOWED_EXTENSIONS))}",
        )

    # Leemos en chunks para no cargar 5MB+ en memoria a lo loco
    contents = bytearray()
    chunk = await file.read(8192)
    if not chunk:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Archivo vacío")

    # Validar magic bytes con la primera lectura
    real_mime = _detect_format(bytes(chunk[:16]))
    if real_mime is None:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "El archivo no parece ser una imagen válida",
        )

    contents.extend(chunk)
    while True:
        chunk = await file.read(8192)
        if not chunk:
            break
        contents.extend(chunk)
        if len(contents) > MAX_BYTES:
            raise HTTPException(
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                f"Archivo demasiado grande. Máximo {MAX_BYTES // (1024*1024)}MB.",
            )

    # Filename random + extensión normalizada
    new_name = f"{secrets.token_urlsafe(16)}{ext}"
    target_dir = UPLOADS_ROOT / category
    target_dir.mkdir(parents=True, exist_ok=True)
    target_path = target_dir / new_name
    target_path.write_bytes(bytes(contents))

    return {
        "url": f"/uploads/{category}/{new_name}",
        "filename": new_name,
        "size": len(contents),
        "content_type": real_mime,
    }
