"""SQLAlchemy ORM models for EliteCards.

Import order matters for relationship resolution — keep it consistent.
"""
from app.models.base import (
    AttendanceStatus,
    BanlistStatus,
    Base,
    CardCondition,
    CardLanguage,
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
from app.models.auth_token import AuthToken, AuthTokenKind
from app.models.player import PlayerProfile
from app.models.game import Game
from app.models.game_format import GameFormat
from app.models.game_set import GameSet
from app.models.banlist_entry import BanlistEntry
from app.models.season import Season
from app.models.season_progress import SeasonProgress
from app.models.season_history import SeasonHistory
from app.models.event import Event
from app.models.event_registration import EventRegistration
from app.models.match_result import MatchResult
from app.models.exp_transaction import ExpTransaction
from app.models.prestige_transaction import PrestigeTransaction
from app.models.achievement import Achievement, PlayerAchievement, PlayerAchievementProgress
from app.models.title import Title, PlayerTitle
from app.models.mission import Mission, PlayerMission
from app.models.product import Product
from app.models.product_variant import ProductVariant
from app.models.reservation import Reservation
from app.models.hall_of_fame import HallOfFameEntry
from app.models.admin_action_log import AdminActionLog
from app.models.notification import Notification
from app.models.player_streak import PlayerStreak
from app.models.announcement import Announcement
from app.models.wishlist import ProductWishlist
from app.models.referral import Referral, ReferralStatus
from app.models.deck import PlayerDeck
from app.models.poll import Poll, PollOption, PollVote
from app.models.player_rating import PlayerRating
from app.models.bracket import EventBracket, BracketNode
from app.models.payment_event import PaymentEvent
from app.models.daily_spin import DailySpin
from app.models.daily_card import DailyCard
from app.models.bounty_kill import BountyKill
from app.models.pack_opening import PackOpening
from app.models.wordle import WordlePuzzle, WordleAttempt
from app.models.card_swipe import CardSwipe
from app.models.token_blocklist import RevokedToken
from app.models.login_attempt import LoginAttempt

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
    "GameFormat",
    "GameSet",
    "BanlistEntry",
    "BanlistStatus",
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
    "ProductVariant",
    "CardCondition",
    "CardLanguage",
    "Reservation",
    "HallOfFameEntry",
    "AdminActionLog",
    "Notification",
    "AuthToken",
    "AuthTokenKind",
    "PlayerStreak",
    "Announcement",
    "ProductWishlist",
    "PlayerAchievementProgress",
    "Referral",
    "ReferralStatus",
    "PlayerDeck",
    "Poll",
    "PollOption",
    "PollVote",
    "PlayerRating",
    "EventBracket",
    "BracketNode",
    "PaymentEvent",
    "DailySpin",
    "DailyCard",
    "BountyKill",
    "PackOpening",
    "WordlePuzzle",
    "WordleAttempt",
    "CardSwipe",
    "RevokedToken",
    "LoginAttempt",
]
