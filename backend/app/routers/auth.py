from datetime import datetime, timezone

from fastapi import APIRouter, HTTPException, Request, status
from sqlalchemy import select

from app.core.config import settings
from app.core.deps import DbDep, TokenDep, UserDep
from app.core.rate_limit import limiter
from app.core.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.models import AuthTokenKind, PlayerProfile, User, UserRole
from app.schemas.common import EmailRequest, LoginRequest, RefreshRequest, RegisterRequest, TokenAndPassword, TokenResponse, UserMe
from app.services import auth_tokens as token_svc
from app.services import email as email_svc
from app.services import login_attempts as la_svc
from app.services import password_policy
from app.services import token_blocklist
from app.services.elite_id import generate_next_elite_id

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
def login(request: Request, payload: LoginRequest, db: DbDep) -> TokenResponse:
    email = payload.email.lower()
    client_ip = request.client.host if request.client else None

    # Account lockout check
    locked, mins_left = la_svc.is_locked(db, email)
    if locked:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS,
            f"Cuenta bloqueada por exceso de intentos. Intentá de nuevo en {mins_left} minuto(s).",
        )

    user = db.scalar(select(User).where(User.email == email))
    if not user or not verify_password(payload.password, user.password_hash):
        la_svc.record_attempt(db, email=email, success=False, user_id=user.id if user else None, ip=client_ip)
        db.commit()
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Credenciales inválidas")
    if not user.is_active:
        la_svc.record_attempt(db, email=email, success=False, user_id=user.id, ip=client_ip)
        db.commit()
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Cuenta deshabilitada")

    la_svc.record_attempt(db, email=email, success=True, user_id=user.id, ip=client_ip)
    db.commit()
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
    try:
        password_policy.validate_with_hibp(payload.password, alias=payload.alias, email=payload.email)
    except password_policy.PasswordPolicyError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))

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

    # Procesar referido si vino con referral_code
    if payload.referral_code:
        from app.models import Referral, ReferralStatus
        ref_code = payload.referral_code.strip().upper()
        referrer_profile = db.scalar(
            select(PlayerProfile).where(PlayerProfile.elite_id_code == ref_code)
        )
        if referrer_profile and referrer_profile.user_id != user.id:
            db.add(Referral(
                referrer_user_id=referrer_profile.user_id,
                referred_user_id=user.id,
                status=ReferralStatus.PENDING,
            ))
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
    try:
        password_policy.validate_with_hibp(
            payload.new_password,
            alias=user.profile.alias if user.profile else None,
            email=user.email,
        )
    except password_policy.PasswordPolicyError as e:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, str(e))
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    return None


@router.post("/refresh", response_model=TokenResponse)
@limiter.limit("30/minute")
def refresh(request: Request, payload: RefreshRequest, db: DbDep) -> TokenResponse:
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


@router.post("/logout", status_code=204)
def logout(token: TokenDep, current: UserDep, db: DbDep) -> None:
    """Revoca el access_token actual (server-side) — el cliente debe descartarlo también."""
    if not token:
        return
    try:
        data = decode_token(token)
    except ValueError:
        return
    jti = data.get("jti")
    exp_ts = data.get("exp")
    exp_dt = datetime.fromtimestamp(exp_ts, tz=timezone.utc) if exp_ts else None
    if jti:
        token_blocklist.revoke(db, jti=jti, user_id=current.id, token_exp=exp_dt, reason="logout")
        db.commit()
