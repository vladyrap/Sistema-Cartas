import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import VerifyEmail from './pages/VerifyEmail';
import Dashboard from './pages/Dashboard';
import Profile from './pages/Profile';
import ProfilePremium from './pages/ProfilePremium';
import RutaDelCampeon from './pages/RutaDelCampeon';
import Ranking from './pages/Ranking';
import Leaderboard from './pages/Leaderboard';
import Events from './pages/Events';
import EventDetail from './pages/EventDetail';
import LiveTournament from './pages/LiveTournament';
import CinematicMode from './pages/CinematicMode';
import EventReplay from './pages/EventReplay';
import Catalog from './pages/Catalog';
import CatalogPremium from './pages/CatalogPremium';
import MyReservations from './pages/MyReservations';
import MyDecks from './pages/MyDecks';
import DeckBuilder from './pages/DeckBuilder';
import Card3DShowcase from './pages/Card3DShowcase';
import Cosmos from './pages/Cosmos';
import ChampionsVision from './pages/ChampionsVision';
import Missions from './pages/Missions';
import HallOfFame from './pages/HallOfFame';
import PublicProfile from './pages/PublicProfile';
import PlayerStats from './pages/PlayerStats';
import Activity from './pages/Activity';
import Guilds from './pages/Guilds';
import GuildLanding from './pages/GuildLanding';
import GuildAdminSettings from './pages/GuildAdminSettings';
import GuildAdminMembers from './pages/GuildAdminMembers';
import GuildAdminActivity from './pages/GuildAdminActivity';
import AdminDashboard from './pages/admin/Dashboard';
import AdminSeasons from './pages/admin/Seasons';
import AdminReservations from './pages/admin/Reservations';
import AdminEventManage from './pages/admin/EventManage';
import AdminEventsList from './pages/admin/EventsList';
import AdminGames from './pages/admin/Games';
import AdminProducts from './pages/admin/Products';
import AdminPlayers from './pages/admin/Players';
import AdminMissions from './pages/admin/Missions';
import AdminAchievements from './pages/admin/Achievements';
import AdminJoinRequests from './pages/admin/JoinRequests';
import AdminCheckin from './pages/admin/Checkin';
import AdminAnnouncements from './pages/admin/Announcements';
import AdminPolls from './pages/admin/Polls';
import SuperAdminGuilds from './pages/super_admin/Guilds';

export default function App() {
  return (
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
    </Routes>
  );
}
