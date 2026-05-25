"""Schemas Pydantic para catálogo y reservas."""
from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

from app.models.base import ProductAccess, ReservationStatus


class ProductOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    game_id: int | None = None
    category: str | None = None
    price_clp: int
    stock: int
    image_url: str | None = None
    description: str | None = None
    access: ProductAccess
    required_level: int
    per_player_limit: int | None = None
    is_preorder: bool
    is_active: bool


class ReservationCreateRequest(BaseModel):
    product_id: int
    quantity: int = Field(default=1, ge=1, le=20)
    note: str | None = Field(default=None, max_length=500)


class ReservationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    player_id: int
    player_alias: str | None = None
    product_id: int
    product_name: str | None = None
    quantity: int
    status: ReservationStatus
    expires_at: datetime | None = None
    note: str | None = None
    created_at: datetime
    updated_at: datetime


class ReservationValidationOut(BaseModel):
    """Respuesta del endpoint GET /catalog/{id}/can-reserve.

    Indica si el jugador autenticado puede reservar y por qué."""
    can_reserve: bool
    reason: str | None = None
    player_level: int
    required_level: int
    access_required: ProductAccess
