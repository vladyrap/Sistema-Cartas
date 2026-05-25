"""Schemas Pydantic compartidos."""
from datetime import datetime
from pydantic import BaseModel, ConfigDict, EmailStr, Field

from app.models.base import (
    EventStatus,
    EventType,
    GuildRole,
    GuildStatus,
    PlayerClass,
    ProductAccess,
    RankName,
    ReservationStatus,
    SeasonStatus,
    UserRole,
)


# ============================== Auth ==============================


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class EmailRequest(BaseModel):
    email: EmailStr


class TokenAndPassword(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=6)
    alias: str = Field(min_length=3, max_length=40)
    full_name: str | None = None
    player_class: PlayerClass = PlayerClass.DUELISTA
    favorite_game_id: int | None = None


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"


class RefreshRequest(BaseModel):
    refresh_token: str


# ============================== Player ==============================


class PlayerSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    alias: str
    full_name: str | None = None
    player_class: PlayerClass
    elite_id_code: str
    elite_id_number: int
    avatar_url: str | None = None
    bio: str | None = None
    prestige: int = 0
    favorite_game_id: int | None = None


class MyProfileUpdate(BaseModel):
    """Self-edit del jugador autenticado."""
    full_name: str | None = Field(default=None, max_length=120)
    bio: str | None = Field(default=None, max_length=500)
    avatar_url: str | None = Field(default=None, max_length=500)
    player_class: PlayerClass | None = None
    favorite_game_id: int | None = None


class UserMe(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    email: EmailStr
    role: UserRole
    email_verified_at: datetime | None = None
    profile: PlayerSummary | None = None


class SeasonProgressOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    season_id: int
    starting_level: int
    was_promoted_start: bool
    level: int
    exp_in_level: int
    exp_total: int
    current_rank: RankName
    max_rank: RankName


class BenefitOut(BaseModel):
    level: int
    label: str
    unlocked: bool


class ProgressToNextOut(BaseModel):
    current_level: int
    current_rank: RankName
    next_level: int | None = None
    next_rank: RankName | None = None
    exp_in_level: int
    exp_required_for_next: int | None = None
    exp_remaining_for_next: int | None = None
    percent_to_next: float


class PlayerMeOut(BaseModel):
    """Respuesta de /api/players/me — todo lo que el dashboard necesita."""
    player: PlayerSummary
    season_id: int | None = None
    season_name: str | None = None
    progress: SeasonProgressOut | None = None
    progress_to_next: ProgressToNextOut | None = None
    benefits: list[BenefitOut] = []


# ============================== Season ==============================


class SeasonOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    number: int
    name: str
    starts_at: datetime
    ends_at: datetime
    status: SeasonStatus
    closed_at: datetime | None = None
    previous_season_id: int | None = None
    description: str | None = None


class SeasonHistoryOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    season_id: int
    season_name: str
    season_number: int
    final_level: int
    final_exp_total: int
    max_rank: RankName
    final_position: int | None = None
    prestige_earned: int


# ============================== Ranking ==============================


class RankingRow(BaseModel):
    position: int
    player_id: int
    alias: str
    player_class: PlayerClass
    level: int
    current_rank: RankName
    exp_total: int
    prestige: int
    was_promoted_start: bool = False


class RankingResponse(BaseModel):
    season_id: int
    season_name: str
    rows: list[RankingRow]


# ============================== Event ==============================


class EventOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    game_id: int
    event_type: EventType
    status: EventStatus
    starts_at: datetime
    ends_at: datetime | None = None
    slots: int
    registered_count: int = 0
    price_clp: int
    description: str | None = None
    is_registered: bool = False  # True si el jugador autenticado está inscrito


class EventRegistrationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    event_id: int
    player_id: int
    payment_status: str
    attendance_status: str
    final_position: int | None = None
    rounds_won: int
    rounds_lost: int


class EventRegistrationWithPlayer(BaseModel):
    registration: EventRegistrationOut
    player_alias: str
    player_elite_id: str
    player_level: int | None = None


class ResultRow(BaseModel):
    player_id: int
    final_position: int | None = None
    rounds_won: int | None = None
    rounds_lost: int | None = None


class RecordResultsRequest(BaseModel):
    results: list[ResultRow]


class AwardExpResponse(BaseModel):
    event_id: int
    registrations_processed: int
    players_awarded: int
    total_exp_distributed: int


class AttendancePayload(BaseModel):
    attendance_status: str  # "ATTENDED" | "NO_SHOW" | "PENDING"


class PaymentPayload(BaseModel):
    payment_status: str  # "PAID" | "PENDING" | "CANCELLED" | "REFUNDED"


# ============================== Missions / Achievements / HoF ==============================


class MissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    description: str | None = None
    exp_reward: int
    is_weekly: bool
    is_active: bool
    season_id: int | None = None


class PlayerMissionOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    mission_id: int
    is_completed: bool
    completed_at: datetime | None = None
    progress: int
    target: int


class PlayerMissionWithMission(BaseModel):
    mission: MissionOut
    state: PlayerMissionOut


class AchievementOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    description: str | None = None
    icon: str | None = None
    is_seasonal: bool
    is_secret: bool


class PlayerAchievementOut(BaseModel):
    achievement: AchievementOut
    season_id: int | None = None
    earned_at: datetime | None = None


class HallOfFameRow(BaseModel):
    entry_id: int
    season_id: int
    season_number: int
    season_name: str
    guild_id: int | None = None
    guild_name: str | None = None
    guild_code: str | None = None
    guild_accent_color: str | None = None
    player_id: int
    player_alias: str
    player_elite_id: str
    category: str
    note: str | None = None


class GrantAchievementRequest(BaseModel):
    player_id: int
    achievement_id: int
    season_id: int | None = None


# ============================== Admin / Seasons ==============================


class SeasonCreateRequest(BaseModel):
    name: str = Field(min_length=3, max_length=120)
    starts_at: datetime
    ends_at: datetime
    description: str | None = None
    previous_season_id: int | None = None


class ResetPreviewRow(BaseModel):
    player_id: int
    alias: str
    previous_max_rank: str | None = None
    starting_level: int
    starting_rank: str
    was_promoted_start: bool


class ResetPreviewResponse(BaseModel):
    target_season_id: int
    target_season_name: str
    previous_season_id: int | None = None
    rows: list[ResetPreviewRow]
    promoted_count: int
    regular_count: int


class ActivateSeasonResponse(BaseModel):
    season_id: int
    season_number: int
    players_initialized: int
    promoted_to_duelista: int


class CloseSeasonResponse(BaseModel):
    season_id: int
    total_players: int
    champions: list[int]
    top_8_players: list[int]
    prestige_awarded_total: int


# ============================== Admin / EXP ==============================


class ExpAdjustRequest(BaseModel):
    player_id: int
    amount: int  # puede ser negativo
    reason: str = Field(min_length=3, max_length=120)


class ExpAdjustResponse(BaseModel):
    transaction_id: int
    new_level: int
    new_exp_in_level: int
    new_exp_total: int


# ============================== Game ==============================


class GameOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    short_name: str | None = None
    logo_url: str | None = None
    is_active: bool


# ============================== Catalog / Products ==============================


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


class ProductEligibilityOut(BaseModel):
    """Producto enriquecido con info de si el jugador actual puede reservarlo."""
    product: ProductOut
    can_reserve: bool
    reason: str | None = None
    player_level: int


# ============================== Reservations ==============================


class ReservationCreate(BaseModel):
    product_id: int
    quantity: int = Field(default=1, ge=1, le=10)
    note: str | None = None


class ReservationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    player_id: int
    product_id: int
    quantity: int
    status: ReservationStatus
    expires_at: datetime | None = None
    note: str | None = None
    created_at: datetime
    updated_at: datetime


class ReservationWithProduct(BaseModel):
    reservation: ReservationOut
    product: ProductOut


class ReservationAdminRow(BaseModel):
    reservation: ReservationOut
    product_name: str
    product_access: ProductAccess
    player_alias: str
    player_elite_id: str
    player_level: int | None = None


# ============================== CRUD Admin ==============================


class GameCreate(BaseModel):
    code: str = Field(min_length=2, max_length=40)
    name: str = Field(min_length=2, max_length=120)
    short_name: str | None = None
    logo_url: str | None = None
    description: str | None = None
    is_active: bool = True


class GameUpdate(BaseModel):
    name: str | None = None
    short_name: str | None = None
    logo_url: str | None = None
    description: str | None = None
    is_active: bool | None = None


class EventCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    game_id: int
    event_type: EventType
    starts_at: datetime
    ends_at: datetime | None = None
    slots: int = Field(default=16, ge=1, le=512)
    price_clp: int = Field(default=0, ge=0)
    description: str | None = None
    rules: str | None = None
    prizes: str | None = None
    season_id: int | None = None
    status: EventStatus = EventStatus.DRAFT


class EventUpdate(BaseModel):
    name: str | None = None
    game_id: int | None = None
    event_type: EventType | None = None
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    slots: int | None = None
    price_clp: int | None = None
    description: str | None = None
    rules: str | None = None
    prizes: str | None = None
    status: EventStatus | None = None


class ProductCreate(BaseModel):
    name: str = Field(min_length=2, max_length=160)
    game_id: int | None = None
    category: str | None = None
    price_clp: int = Field(default=0, ge=0)
    stock: int = Field(default=0, ge=0)
    image_url: str | None = None
    description: str | None = None
    access: ProductAccess = ProductAccess.NORMAL
    required_level: int = Field(default=1, ge=1, le=30)
    per_player_limit: int | None = Field(default=None, ge=1)
    is_preorder: bool = False
    is_active: bool = True


class ProductUpdate(BaseModel):
    name: str | None = None
    game_id: int | None = None
    category: str | None = None
    price_clp: int | None = None
    stock: int | None = None
    image_url: str | None = None
    description: str | None = None
    access: ProductAccess | None = None
    required_level: int | None = None
    per_player_limit: int | None = None
    is_preorder: bool | None = None
    is_active: bool | None = None


class MissionCreate(BaseModel):
    code: str = Field(min_length=2, max_length=60)
    name: str = Field(min_length=2, max_length=160)
    description: str | None = None
    exp_reward: int = Field(default=0, ge=0)
    is_weekly: bool = False
    is_active: bool = True
    season_id: int | None = None


class MissionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    exp_reward: int | None = None
    is_weekly: bool | None = None
    is_active: bool | None = None
    season_id: int | None = None


class AchievementCreate(BaseModel):
    code: str = Field(min_length=2, max_length=60)
    name: str = Field(min_length=2, max_length=120)
    description: str | None = None
    icon: str | None = None
    is_seasonal: bool = False
    is_secret: bool = False


class AchievementUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    icon: str | None = None
    is_seasonal: bool | None = None
    is_secret: bool | None = None


class PlayerAdminUpdate(BaseModel):
    """Admin-only edit del PlayerProfile."""
    alias: str | None = Field(default=None, min_length=3, max_length=40)
    full_name: str | None = None
    avatar_url: str | None = None
    player_class: PlayerClass | None = None
    favorite_game_id: int | None = None


class UserAdminUpdate(BaseModel):
    role: UserRole | None = None
    is_active: bool | None = None
    new_password: str | None = Field(default=None, min_length=6, max_length=120)


# ============================== Guilds ==============================


class GuildOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    name: str
    tagline: str | None = None
    description: str | None = None
    logo_url: str | None = None
    banner_url: str | None = None
    accent_color: str | None = None
    owner_user_id: int | None = None
    status: GuildStatus
    is_public: bool
    member_count: int = 0


class GuildCreate(BaseModel):
    code: str = Field(min_length=3, max_length=40, pattern=r"^[a-z0-9_-]+$")
    name: str = Field(min_length=3, max_length=120)
    tagline: str | None = Field(default=None, max_length=200)
    description: str | None = None
    logo_url: str | None = None
    banner_url: str | None = None
    accent_color: str | None = Field(default=None, max_length=20)
    owner_user_id: int | None = None
    is_public: bool = True
    seed_initial: bool = Field(
        default=False,
        description="Si true, crea temporada T1 activa + 3 misiones + 5 medallas como punto de partida",
    )


class GuildUpdate(BaseModel):
    name: str | None = None
    tagline: str | None = None
    description: str | None = None
    logo_url: str | None = None
    banner_url: str | None = None
    accent_color: str | None = None
    is_public: bool | None = None
    status: GuildStatus | None = None


class GuildSettingsUpdate(BaseModel):
    """Subset editable por el GUILD_ADMIN: solo branding y visibilidad.

    No incluye `status` (eso es de SUPER_ADMIN) ni `code` (inmutable).
    """
    name: str | None = Field(default=None, min_length=3, max_length=120)
    tagline: str | None = Field(default=None, max_length=200)
    description: str | None = None
    logo_url: str | None = None
    banner_url: str | None = None
    accent_color: str | None = Field(default=None, max_length=20)
    is_public: bool | None = None


class GuildMembershipOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    guild_id: int
    role: GuildRole
    is_active: bool
    joined_at: datetime | None = None


class MyGuildEntry(BaseModel):
    """Un Gremio + el rol que tengo en él."""
    guild: GuildOut
    role: GuildRole
    joined_at: datetime | None = None


# ============================== Join requests ==============================


class JoinRequestCreate(BaseModel):
    message: str | None = Field(default=None, max_length=500)


class JoinRequestDecision(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class JoinRequestOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    guild_id: int
    status: str
    message: str | None = None
    decided_by_user_id: int | None = None
    decided_at: datetime | None = None
    decision_note: str | None = None
    created_at: datetime | None = None


class JoinRequestWithUser(BaseModel):
    """Vista admin: la solicitud + datos del solicitante."""
    request: JoinRequestOut
    user_alias: str | None = None
    user_email: str | None = None
    user_elite_id: str | None = None


class GuildMemberOut(BaseModel):
    """Miembro de un Gremio enriquecido con datos del usuario."""
    user_id: int
    role: GuildRole
    is_active: bool
    joined_at: datetime | None = None
    alias: str | None = None
    full_name: str | None = None
    elite_id_code: str | None = None
    email: str | None = None


class MemberRoleUpdate(BaseModel):
    role: GuildRole


class StreakOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    guild_id: int
    current_streak: int
    longest_streak: int
    last_attended_at: datetime | None = None
    exp_multiplier: float = 1.0
    next_milestone: int | None = None


class CheckinResolveOut(BaseModel):
    player_id: int
    alias: str
    elite_id: str
    avatar_url: str | None = None


class CheckinResult(BaseModel):
    action: str  # 'already_attended' | 'marked' | 'registered_and_marked'
    player_id: int
    alias: str
    registration_id: int


class PageMeta(BaseModel):
    page: int
    page_size: int
    total: int
    pages: int


class LeaderboardRow(BaseModel):
    rank: int
    player_id: int
    player_alias: str
    player_elite_id: str | None = None
    level: int
    rank_name: str
    exp_total: int
    exp_in_level: int
    delta_24h: int = 0  # EXP ganada en las últimas 24h


class ActivityEntry(BaseModel):
    id: int
    action: str
    admin_id: int
    admin_alias: str | None = None
    admin_email: str | None = None
    target_kind: str | None = None
    target_id: int | None = None
    payload: str | None = None
    created_at: datetime


class PlayerFullOut(BaseModel):
    """Vista admin: jugador + usuario + nivel actual."""
    id: int
    user_id: int
    email: EmailStr
    role: UserRole
    is_active: bool
    alias: str
    full_name: str | None = None
    avatar_url: str | None = None
    player_class: PlayerClass
    elite_id_code: str
    elite_id_number: int
    prestige: int
    favorite_game_id: int | None = None
    current_level: int | None = None
    current_rank: RankName | None = None


class NotificationOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    guild_id: int | None = None
    type: str
    title: str
    body: str | None = None
    link: str | None = None
    is_read: bool
    read_at: datetime | None = None
    created_at: datetime


class NotificationListOut(BaseModel):
    notifications: list[NotificationOut]
    unread_count: int


class ActivityRow(BaseModel):
    """Item del feed público de actividad."""
    kind: str  # "level_up", "event_registration", "season_close", "achievement", "champion"
    at: datetime
    player_id: int
    player_alias: str
    description: str
    link: str | None = None


class PlayerStatsOut(BaseModel):
    player_id: int
    alias: str
    # Histórico
    total_seasons: int
    total_events_registered: int
    total_events_attended: int
    total_no_shows: int
    total_rounds_won: int
    total_rounds_lost: int
    win_rate: float  # 0-100
    # Resultados destacados
    championships: int  # final_position == 1 en eventos
    podiums: int  # final_position 1..3
    top_8_finishes: int
    # Misiones
    missions_completed: int
    # Medallas
    achievements_earned: int
    # Mejores rangos
    best_max_rank: str | None = None
    current_prestige: int


class PublicProfileOut(BaseModel):
    """Vista pública de un jugador — visible para cualquiera."""
    id: int
    alias: str
    avatar_url: str | None = None
    bio: str | None = None
    player_class: PlayerClass
    elite_id_code: str
    elite_id_number: int
    prestige: int
    current_level: int | None = None
    current_rank: RankName | None = None
    current_position: int | None = None
    season_count: int
    achievements: list[PlayerAchievementOut] = []
    history: list[SeasonHistoryOut] = []
