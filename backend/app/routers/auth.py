from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import DbDep, UserDep
from app.core.rate_limit import limiter
from app.core.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.models import AuthTokenKind, PlayerProfile, User, UserRole
from app.schemas.common import EmailRequest, LoginRequest, RefreshRequest, RegisterRequest, TokenAndPassword, TokenResponse, UserMe
from app.services import auth_tokens as token_svc
from app.services import email as email_svc
from app.services.elite_id import generate_next_elite_id

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, payload: LoginRequest, db: DbDep) -> TokenResponse:
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Credenciales inválidas")
    if not user.is_active:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Cuenta deshabilitada")
    return TokenResponse(
        access_token=create_access_token(user.id, extra_claims={"role": user.role.value}),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/register", response_model=TokenResponse)
@limiter.limit("5/hour")
def register(request: Request, payload: RegisterRequest, db: DbDep) -> TokenResponse:
    if db.scalar(select(User).where(User.email == payload.email.lower())):
        raise HTTPException(status.HTTP_409_CONFLICT, "El email ya está registrado")
    if db.scalar(select(PlayerProfile).where(PlayerProfile.alias == payload.alias)):
        raise HTTPException(status.HTTP_409_CONFLICT, "El alias ya está en uso")

    user = User(
        email=payload.email.lower(),
        password_hash=hash_password(payload.password),
        role=UserRole.PLAYER,
    )
    db.add(user)
    db.flush()

    code, num = generate_next_elite_id(db)
    profile = PlayerProfile(
        user_id=user.id,
        alias=payload.alias,
        full_name=payload.full_name,
        player_class=payload.player_class,
        elite_id_code=code,
        elite_id_number=num,
        favorite_game_id=payload.favorite_game_id,
    )
    db.add(profile)
    db.flush()

    # Generar token de verificación y mandarlo. No bloqueamos el registro si el
    # email falla — el usuario puede pedir reenvío después.
    plain_token = token_svc.issue(db, user_id=user.id, kind=AuthTokenKind.EMAIL_VERIFY)
    verify_url = f"{settings.frontend_url.rstrip('/')}/verify-email?token={plain_token}"
    email_svc.send_email_verify(to=user.email, alias=profile.alias, verify_url=verify_url)

    db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id, extra_claims={"role": user.role.value}),
        refresh_token=create_refresh_token(user.id),
    )


@router.post("/email/verify-request", status_code=204)
@limiter.limit("3/hour")
def request_email_verification(request: Request, current: UserDep, db: DbDep) -> None:
    """Reenvía el email de verificación al usuario autenticado."""
    if current.email_verified_at is not None:
        return None  # ya verificado, no hacemos nada
    plain_token = token_svc.issue(db, user_id=current.id, kind=AuthTokenKind.EMAIL_VERIFY)
    verify_url = f"{settings.frontend_url.rstrip('/')}/verify-email?token={plain_token}"
    alias = current.profile.alias if current.profile else current.email
    email_svc.send_email_verify(to=current.email, alias=alias, verify_url=verify_url)
    db.commit()
    return None


@router.post("/email/verify", status_code=204)
@limiter.limit("20/hour")
def confirm_email_verification(request: Request, payload: dict, db: DbDep) -> None:
    """Consume el token del link del email. Marca el usuario como verificado."""
    token = (payload or {}).get("token", "")
    if not token:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Token requerido")
    user = token_svc.consume(db, token=token, kind=AuthTokenKind.EMAIL_VERIFY)
    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Token inválido o vencido")
    if user.email_verified_at is None:
        from datetime import datetime, timezone
        user.email_verified_at = datetime.now(timezone.utc)
    db.commit()
    return None


@router.post("/password/forgot", status_code=204)
@limiter.limit("5/hour")
def request_password_reset(request: Request, payload: EmailRequest, db: DbDep) -> None:
    """Inicia flow de reset. Devuelve 204 siempre para no filtrar si el email existe."""
    user = db.scalar(select(User).where(User.email == payload.email.lower()))
    if user and user.is_active:
        plain_token = token_svc.issue(db, user_id=user.id, kind=AuthTokenKind.PASSWORD_RESET)
        reset_url = f"{settings.frontend_url.rstrip('/')}/reset-password?token={plain_token}"
        alias = user.profile.alias if user.profile else user.email
        email_svc.send_password_reset(to=user.email, alias=alias, reset_url=reset_url)
        db.commit()
    # Respuesta uniforme para evitar enumeration de emails
    return None


@router.post("/password/reset", status_code=204)
@limiter.limit("10/hour")
def confirm_password_reset(request: Request, payload: TokenAndPassword, db: DbDep) -> None:
    """Cambia el password con un token válido."""
    user = token_svc.consume(db, token=payload.token, kind=AuthTokenKind.PASSWORD_RESET)
    if not user:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Token inválido o vencido")
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return None


@router.post("/refresh", response_model=TokenResponse)
def refresh(payload: RefreshRequest, db: DbDep) -> TokenResponse:
    try:
        data = decode_token(payload.refresh_token)
    except ValueError:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Refresh token inválido")
    if data.get("type") != "refresh":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Tipo de token inválido")
    user = db.get(User, int(data["sub"]))
    if not user or not user.is_active:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Usuario no encontrado")
    return TokenResponse(
        access_token=create_access_token(user.id, extra_claims={"role": user.role.value}),
        refresh_token=create_refresh_token(user.id),
    )


@router.get("/me", response_model=UserMe)
def me(current: UserDep) -> UserMe:
    return UserMe.model_validate(current)
