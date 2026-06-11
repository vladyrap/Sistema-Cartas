import { lazy, Suspense } from 'react';
import { Routes, Route } from 'react-router-dom';
import { Sparkles } from 'lucide-react';
import ComingSoonGate from './components/ComingSoonGate';

// Eager: landing + auth — son la primera pantalla, no las lazyfeeamos
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import NotFound from './pages/NotFound';

// Lazy: el resto. Cada chunk se descarga solo cuando se visita esa ruta.
const ForgotPassword = lazy(() => import('./pages/ForgotPassword'));
const ResetPassword = lazy(() => import('./pages/ResetPassword'));
const VerifyEmail = lazy(() => import('./pages/VerifyEmail'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Profile = lazy(() => import('./pages/Profile'));
const ProfilePremium = lazy(() => import('./pages/ProfilePremium'));
const RutaDelCampeon = lazy(() => import('./pages/RutaDelCampeon'));
const Ranking = lazy(() => import('./pages/Ranking'));
const Leaderboard = lazy(() => import('./pages/Leaderboard'));
const Events = lazy(() => import('./pages/Events'));
const EventDetail = lazy(() => import('./pages/EventDetail'));
const LiveTournament = lazy(() => import('./pages/LiveTournament'));
const CinematicMode = lazy(() => import('./pages/CinematicMode'));
const EventReplay = lazy(() => import('./pages/EventReplay'));
const Catalog = lazy(() => import('./pages/Catalog'));
const CatalogPremium = lazy(() => import('./pages/CatalogPremium'));
const MyReservations = lazy(() => import('./pages/MyReservations'));
const MyDecks = lazy(() => import('./pages/MyDecks'));
const DeckBuilder = lazy(() => import('./pages/DeckBuilder'));
const Card3DShowcase = lazy(() => import('./pages/Card3DShowcase'));
const Cosmos = lazy(() => import('./pages/Cosmos'));
const ChampionsVision = lazy(() => import('./pages/ChampionsVision'));
const WarRoom = lazy(() => import('./pages/WarRoom'));
const SpectatorStream = lazy(() => import('./pages/SpectatorStream'));
const CardHologramLab = lazy(() => import('./pages/CardHologramLab'));
const BracketReplayCinematic = lazy(() => import('./pages/BracketReplayCinematic'));
const PlayerTrailer = lazy(() => import('./pages/PlayerTrailer'));
const ArEliteId = lazy(() => import('./pages/ArEliteId'));
const TradeSimulator = lazy(() => import('./pages/TradeSimulator'));
const DeckDuelSimulator = lazy(() => import('./pages/DeckDuelSimulator'));
const AudioVisualizer = lazy(() => import('./pages/AudioVisualizer'));
const Tour = lazy(() => import('./pages/Tour'));
const Missions = lazy(() => import('./pages/Missions'));
const HallOfFame = lazy(() => import('./pages/HallOfFame'));
const PublicProfile = lazy(() => import('./pages/PublicProfile'));
const PlayerStats = lazy(() => import('./pages/PlayerStats'));
const Activity = lazy(() => import('./pages/Activity'));
const Guilds = lazy(() => import('./pages/Guilds'));
const GuildLanding = lazy(() => import('./pages/GuildLanding'));
const GuildAdminSettings = lazy(() => import('./pages/GuildAdminSettings'));
const GuildAdminMembers = lazy(() => import('./pages/GuildAdminMembers'));
const GuildAdminActivity = lazy(() => import('./pages/GuildAdminActivity'));
const AdminDashboard = lazy(() => import('./pages/admin/Dashboard'));
const AdminSeasons = lazy(() => import('./pages/admin/Seasons'));
const AdminReservations = lazy(() => import('./pages/admin/Reservations'));
const AdminEventManage = lazy(() => import('./pages/admin/EventManage'));
const AdminEventsList = lazy(() => import('./pages/admin/EventsList'));
const AdminGames = lazy(() => import('./pages/admin/Games'));
const AdminProducts = lazy(() => import('./pages/admin/Products'));
const AdminPlayers = lazy(() => import('./pages/admin/Players'));
const AdminMissions = lazy(() => import('./pages/admin/Missions'));
const AdminAchievements = lazy(() => import('./pages/admin/Achievements'));
const AdminJoinRequests = lazy(() => import('./pages/admin/JoinRequests'));
const AdminCheckin = lazy(() => import('./pages/admin/Checkin'));
const AdminAnnouncements = lazy(() => import('./pages/admin/Announcements'));
const AdminPolls = lazy(() => import('./pages/admin/Polls'));
const SuperAdminGuilds = lazy(() => import('./pages/super_admin/Guilds'));
const Spinner = lazy(() => import('./pages/Spinner'));
const CardOfDay = lazy(() => import('./pages/CardOfDay'));
const Bounty = lazy(() => import('./pages/Bounty'));
const Scanner = lazy(() => import('./pages/Scanner'));
const Wrapped = lazy(() => import('./pages/Wrapped'));
const Tinder = lazy(() => import('./pages/Tinder'));
const PackOpening = lazy(() => import('./pages/PackOpening'));
const Wordle = lazy(() => import('./pages/Wordle'));
const Ceiling = lazy(() => import('./pages/Ceiling'));
const SmackTalk = lazy(() => import('./pages/SmackTalk'));
const ShopRadar = lazy(() => import('./pages/ShopRadar'));
const DiscordCallback = lazy(() => import('./pages/DiscordCallback'));
const Cardgrave = lazy(() => import('./pages/Cardgrave'));
const TimelapseReplay = lazy(() => import('./pages/TimelapseReplay'));
const TornadoFate = lazy(() => import('./pages/TornadoFate'));
const BountyContracts = lazy(() => import('./pages/BountyContracts'));
const DeckRoulette = lazy(() => import('./pages/DeckRoulette'));
const DeckDNA = lazy(() => import('./pages/DeckDNA'));
const CardDrama = lazy(() => import('./pages/CardDrama'));
const Devotion = lazy(() => import('./pages/Devotion'));
const Sealed = lazy(() => import('./pages/Sealed'));
const VoiceReport = lazy(() => import('./pages/VoiceReport'));
const ConstellationMap = lazy(() => import('./pages/ConstellationMap'));
const Documentary = lazy(() => import('./pages/Documentary'));
const QuantumDeckPage = lazy(() => import('./pages/QuantumDeck'));
const Quests = lazy(() => import('./pages/Quests'));
const BrainIO = lazy(() => import('./pages/BrainIO'));
const TournamentHealth = lazy(() => import('./pages/admin/TournamentHealth'));
const EventCheckin = lazy(() => import('./pages/EventCheckin'));
const AdminCheckinDesk = lazy(() => import('./pages/admin/AdminCheckinDesk'));
const EventTimeline = lazy(() => import('./pages/admin/EventTimeline'));
const EventSpectate = lazy(() => import('./pages/EventSpectate'));
const PairingControl = lazy(() => import('./pages/admin/PairingControl'));
const TcgNews = lazy(() => import('./pages/TcgNews'));
const AdminComingSoon = lazy(() => import('./pages/admin/AdminComingSoon'));
const TournamentUniverse = lazy(() => import('./pages/TournamentUniverse'));
const Competitive = lazy(() => import('./pages/Competitive'));
const AdminDuels = lazy(() => import('./pages/admin/AdminDuels'));
const BattlePass = lazy(() => import('./pages/BattlePass'));
const AdminBattlePass = lazy(() => import('./pages/admin/AdminBattlePass'));
const MetaCompetitive = lazy(() => import('./pages/MetaCompetitive'));
const AdminEventFinance = lazy(() => import('./pages/admin/AdminEventFinance'));
const Membership = lazy(() => import('./pages/Membership'));
const Loot = lazy(() => import('./pages/Loot'));
const AdminGrowth = lazy(() => import('./pages/admin/AdminGrowth'));
const TradeLog = lazy(() => import('./pages/TradeLog'));
const DeckOCR = lazy(() => import('./pages/DeckOCR'));
const Kiosk = lazy(() => import('./pages/Kiosk'));

function RouteFallback() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-950 via-slate-900 to-violet-950/30 text-white">
      <div className="flex flex-col items-center gap-3">
        <div className="relative">
          <div className="absolute inset-0 rounded-full bg-violet-500/30 blur-xl animate-pulse" />
          <div className="relative w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
            <Sparkles size={20} className="text-white animate-pulse" />
          </div>
        </div>
        <p className="text-xs uppercase tracking-widest text-white/40">Cargando…</p>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<RouteFallback />}>
      <ComingSoonGate>
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/verify-email" element={<VerifyEmail />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/profile/premium" element={<ProfilePremium />} />
        <Route path="/ruta" element={<RutaDelCampeon />} />
        <Route path="/ranking" element={<Ranking />} />
        <Route path="/leaderboard" element={<Leaderboard />} />
        <Route path="/events" element={<Events />} />
        <Route path="/events/:id" element={<EventDetail />} />
        <Route path="/events/:id/live" element={<LiveTournament />} />
        <Route path="/events/:id/cinema" element={<CinematicMode />} />
        <Route path="/events/:id/replay" element={<EventReplay />} />
        <Route path="/catalog" element={<Catalog />} />
        <Route path="/catalog/premium" element={<CatalogPremium />} />
        <Route path="/my-reservations" element={<MyReservations />} />
        <Route path="/decks" element={<MyDecks />} />
        <Route path="/decks/:id/builder" element={<DeckBuilder />} />
        <Route path="/decks/:id/showcase" element={<Card3DShowcase />} />
        <Route path="/cosmos" element={<Cosmos />} />
        <Route path="/players/:id/vision" element={<ChampionsVision />} />
        <Route path="/warroom" element={<WarRoom />} />
        <Route path="/events/:id/table" element={<SpectatorStream />} />
        <Route path="/decks/:id/holo" element={<CardHologramLab />} />
        <Route path="/events/:id/cinema-replay" element={<BracketReplayCinematic />} />
        <Route path="/players/:id/trailer" element={<PlayerTrailer />} />
        <Route path="/ar-id" element={<ArEliteId />} />
        <Route path="/trade" element={<TradeSimulator />} />
        <Route path="/duel" element={<DeckDuelSimulator />} />
        <Route path="/visualizer" element={<AudioVisualizer />} />
        <Route path="/tour" element={<Tour />} />
        <Route path="/missions" element={<Missions />} />
        <Route path="/hall-of-fame" element={<HallOfFame />} />
        <Route path="/players/:id" element={<PublicProfile />} />
        <Route path="/players/:id/stats" element={<PlayerStats />} />
        <Route path="/activity" element={<Activity />} />
        <Route path="/guilds" element={<Guilds />} />
        <Route path="/guilds/:slug" element={<GuildLanding />} />
        <Route path="/guild-admin/settings" element={<GuildAdminSettings />} />
        <Route path="/guild-admin/members" element={<GuildAdminMembers />} />
        <Route path="/guild-admin/activity" element={<GuildAdminActivity />} />
        <Route path="/admin" element={<AdminDashboard />} />
        <Route path="/admin/seasons" element={<AdminSeasons />} />
        <Route path="/admin/reservations" element={<AdminReservations />} />
        <Route path="/admin/events-list" element={<AdminEventsList />} />
        <Route path="/admin/events/:id" element={<AdminEventManage />} />
        <Route path="/admin/games" element={<AdminGames />} />
        <Route path="/admin/products" element={<AdminProducts />} />
        <Route path="/admin/players" element={<AdminPlayers />} />
        <Route path="/admin/missions" element={<AdminMissions />} />
        <Route path="/admin/achievements" element={<AdminAchievements />} />
        <Route path="/admin/join-requests" element={<AdminJoinRequests />} />
        <Route path="/admin/checkin" element={<AdminCheckin />} />
        <Route path="/admin/announcements" element={<AdminAnnouncements />} />
        <Route path="/admin/polls" element={<AdminPolls />} />
        <Route path="/super-admin/guilds" element={<SuperAdminGuilds />} />
        <Route path="/spinner" element={<Spinner />} />
        <Route path="/card-of-day" element={<CardOfDay />} />
        <Route path="/bounty" element={<Bounty />} />
        <Route path="/scanner" element={<Scanner />} />
        <Route path="/wrapped" element={<Wrapped />} />
        <Route path="/tinder" element={<Tinder />} />
        <Route path="/pack" element={<PackOpening />} />
        <Route path="/wordle" element={<Wordle />} />
        <Route path="/ceiling" element={<Ceiling />} />
        <Route path="/smack-talk" element={<SmackTalk />} />
        <Route path="/shop-radar" element={<ShopRadar />} />
        <Route path="/auth/discord/callback" element={<DiscordCallback />} />
        <Route path="/cardgrave" element={<Cardgrave />} />
        <Route path="/events/:id/timelapse" element={<TimelapseReplay />} />
        <Route path="/tornado" element={<TornadoFate />} />
        <Route path="/bounty-contracts" element={<BountyContracts />} />
        <Route path="/deck-roulette" element={<DeckRoulette />} />
        <Route path="/decks/:id/dna" element={<DeckDNA />} />
        <Route path="/card-drama" element={<CardDrama />} />
        <Route path="/devotion" element={<Devotion />} />
        <Route path="/sealed" element={<Sealed />} />
        <Route path="/voice-report" element={<VoiceReport />} />
        <Route path="/constellation" element={<ConstellationMap />} />
        <Route path="/events/:id/documentary" element={<Documentary />} />
        <Route path="/quantum" element={<QuantumDeckPage />} />
        <Route path="/quests" element={<Quests />} />
        <Route path="/events/:id/brain" element={<BrainIO />} />
        <Route path="/admin/events/:id/health" element={<TournamentHealth />} />
        <Route path="/events/:id/checkin" element={<EventCheckin />} />
        <Route path="/admin/events/:id/checkin-desk" element={<AdminCheckinDesk />} />
        <Route path="/admin/events/:id/timeline" element={<EventTimeline />} />
        <Route path="/events/:id/spectate" element={<EventSpectate />} />
        <Route path="/admin/events/:id/pairings" element={<PairingControl />} />
        <Route path="/news" element={<TcgNews />} />
        <Route path="/tcg-news" element={<TcgNews />} />
        <Route path="/admin/coming-soon" element={<AdminComingSoon />} />
        <Route path="/events/:id/universe" element={<TournamentUniverse />} />
        <Route path="/competitive" element={<Competitive />} />
        <Route path="/admin/duels" element={<AdminDuels />} />
        <Route path="/battle-pass" element={<BattlePass />} />
        <Route path="/admin/battle-pass" element={<AdminBattlePass />} />
        <Route path="/meta" element={<MetaCompetitive />} />
        <Route path="/admin/events/:id/finance" element={<AdminEventFinance />} />
        <Route path="/membership" element={<Membership />} />
        <Route path="/loot" element={<Loot />} />
        <Route path="/admin/growth" element={<AdminGrowth />} />
        <Route path="/trade-log" element={<TradeLog />} />
        <Route path="/deck-ocr" element={<DeckOCR />} />
        <Route path="/events/:id/kiosk" element={<Kiosk />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      </ComingSoonGate>
    </Suspense>
  );
}
