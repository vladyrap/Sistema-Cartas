import { useEffect, useState } from 'react';
import { Navigate, NavLink } from 'react-router-dom';
import { Shield, Calendar, Users, Trophy, Package, Award, Sparkles, ShoppingBag, Zap, Gamepad2, UserPlus, Crown, Settings, Activity, ScanLine, Megaphone } from 'lucide-react';
import Layout from './Layout';
import { useAuth } from '../lib/useAuth';
import { useGuild } from '../lib/useGuild';
import { api } from '../lib/api';

const SECTIONS = [
  { to: '/admin', icon: Shield, label: 'Dashboard', exact: true },
  { to: '/admin/seasons', icon: Trophy, label: 'Temporadas' },
  { to: '/admin/events-list', icon: Calendar, label: 'Eventos' },
  { to: '/admin/checkin', icon: ScanLine, label: 'Check-in QR' },
  { to: '/admin/announcements', icon: Megaphone, label: 'Anuncios' },
  { to: '/admin/products', icon: Package, label: 'Productos' },
  { to: '/admin/reservations', icon: ShoppingBag, label: 'Reservas' },
  { to: '/admin/players', icon: Users, label: 'Jugadores', globalOnly: true },
  { to: '/admin/join-requests', icon: UserPlus, label: 'Solicitudes', badgeKey: 'joinRequests' },
  { to: '/admin/games', icon: Gamepad2, label: 'Juegos', globalOnly: true },
  { to: '/admin/missions', icon: Zap, label: 'Misiones' },
  { to: '/admin/achievements', icon: Award, label: 'Medallas' },
  { to: '/guild-admin/members', icon: Crown, label: 'Miembros', guildAdminOnly: true },
  { to: '/guild-admin/activity', icon: Activity, label: 'Actividad', guildAdminOnly: true },
  { to: '/guild-admin/settings', icon: Settings, label: 'Ajustes Gremio', guildAdminOnly: true },
];

const cls = ({ isActive }) =>
  `flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition ${
    isActive
      ? 'bg-elite-violet/15 text-elite-violet border border-elite-violet/30'
      : 'text-white/60 hover:text-white hover:bg-white/5 border border-transparent'
  }`;

export default function AdminLayout({ children, title, subtitle, actions }) {
  const { user, loading, isAuthed } = useAuth();
  const { current } = useGuild();
  const [badges, setBadges] = useState({});

  useEffect(() => {
    if (!isAuthed || !current) return;
    api.get(`/guilds/${current.guild.id}/join-requests/count`)
      .then((r) => setBadges((b) => ({ ...b, joinRequests: r.data.pending })))
      .catch(() => {});
  }, [isAuthed, current?.guild?.id]);

  if (loading) return <Layout><div className="p-10 text-white/40">Cargando…</div></Layout>;
  if (!isAuthed) return <Navigate to="/login" replace />;

  const isGlobalAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isGuildAdminHere = current?.role === 'GUILD_ADMIN';
  const canAccess = isGlobalAdmin || isGuildAdminHere;

  if (!canAccess) {
    return <Layout><div className="p-10 text-rose-400">Acceso solo para administradores o Maestros del Gremio.</div></Layout>;
  }

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
        <div className="grid lg:grid-cols-[220px_1fr] gap-6">
          <aside className="lg:sticky lg:top-20 lg:self-start">
            <div className="p-3 rounded-2xl bg-bg-surface border border-bg-border">
              <div className="px-3 py-2 mb-2 flex items-center gap-2">
                <Shield size={14} className="text-elite-gold" />
                <span className="text-[10px] tracking-widest uppercase text-elite-gold font-semibold">Admin</span>
              </div>
              <nav className="space-y-1">
                {SECTIONS
                  .filter((s) => !s.globalOnly || isGlobalAdmin)
                  .filter((s) => !s.guildAdminOnly || isGuildAdminHere)
                  .map(({ to, icon: Icon, label, exact, badgeKey }) => {
                  const badge = badgeKey ? badges[badgeKey] : 0;
                  return (
                    <NavLink key={to} to={to} end={exact} className={cls}>
                      <Icon size={14} />
                      <span className="flex-grow">{label}</span>
                      {badge > 0 && (
                        <span className="ml-auto inline-flex items-center justify-center min-w-[18px] h-[18px] px-1.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[10px] font-bold">
                          {badge}
                        </span>
                      )}
                    </NavLink>
                  );
                })}
              </nav>
              {!isGlobalAdmin && (
                <p className="mt-3 text-[10px] text-white/40 leading-relaxed">
                  Eres Maestro de <span className="text-elite-gold">{current?.guild?.name}</span>. Solo ves y gestionas los datos de este Gremio.
                </p>
              )}
            </div>
          </aside>
          <main>
            {(title || actions) && (
              <header className="mb-6 flex items-end justify-between gap-3 flex-wrap">
                <div>
                  {title && <h1 className="font-display text-2xl sm:text-3xl font-bold">{title}</h1>}
                  {subtitle && <p className="text-white/50 mt-1 text-sm">{subtitle}</p>}
                </div>
                {actions}
              </header>
            )}
            {children}
          </main>
        </div>
      </div>
    </Layout>
  );
}
