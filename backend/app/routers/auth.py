from fastapi import APIRouter, HTTPException, status
from sqlalchemy import select

from app.core.deps import DbDep, UserDep
from app.core.security import create_access_token, create_refresh_token, decode_token, hash_password, verify_password
from app.models import PlayerProfile, User, UserRole
from app.schemas.common import LoginRequest, RefreshRequest, RegisterRequest, TokenResponse, UserMe
from app.services.elite_id import generate_next_elite_id

router = APIRouter()


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: DbDep) -> TokenResponse:
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
def register(payload: RegisterRequest, db: DbDep) -> TokenResponse:
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
    db.commit()

    return TokenResponse(
        access_token=create_access_token(user.id, extra_claims={"role": user.role.value}),
        refresh_token=create_refresh_token(user.id),
    )


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
