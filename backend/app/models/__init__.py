"""SQLAlchemy ORM models for EliteCards.

Import order matters for relationship resolution — keep it consistent.
"""
from app.models.base import (
    AttendanceStatus,
    Base,
    EventStatus,
    EventType,
    GuildRole,
    GuildStatus,
    PaymentStatus,
    PlayerClass,
    ProductAccess,
    RankName,
    ReservationStatus,
    SeasonStatus,
    UserRole,
)
from app.models.user import User
from app.models.guild import Guild, GuildMembership
from app.models.guild_join_request import GuildJoinRequest, JoinRequestStatus
from app.models.player import PlayerProfile
from app.models.game import Game
from app.models.season import Season
from app.models.season_progress import SeasonProgress
from app.models.season_history import SeasonHistory
from app.models.event import Event
from app.models.event_registration import EventRegistration
from app.models.match_result import MatchResult
from app.models.exp_transaction import ExpTransaction
from app.models.prestige_transaction import PrestigeTransaction
from app.models.achievement import Achievement, PlayerAchievement
from app.models.title import Title, PlayerTitle
from app.models.mission import Mission, PlayerMission
from app.models.product import Product
from app.models.reservation import Reservation
from app.models.hall_of_fame import HallOfFameEntry
from app.models.admin_action_log import AdminActionLog
from app.models.notification import Notification

__all__ = [
    "Base",
    "UserRole",
    "GuildRole",
    "GuildStatus",
    "Guild",
    "GuildMembership",
    "GuildJoinRequest",
    "JoinRequestStatus",
    "PlayerClass",
    "EventType",
    "EventStatus",
    "PaymentStatus",
    "AttendanceStatus",
    "ProductAccess",
    "ReservationStatus",
    "SeasonStatus",
    "RankName",
    "User",
    "PlayerProfile",
    "Game",
    "Season",
    "SeasonProgress",
    "SeasonHistory",
    "Event",
    "EventRegistration",
    "MatchResult",
    "ExpTransaction",
    "PrestigeTransaction",
    "Achievement",
    "PlayerAchievement",
    "Title",
    "PlayerTitle",
    "Mission",
    "PlayerMission",
    "Product",
    "Reservation",
    "HallOfFameEntry",
    "AdminActionLog",
    "Notification",
]
