import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Calendar, Users, Sparkles, ChevronRight, Trophy, Package, Award, Zap, Gamepad2, ShoppingBag, UserPlus, Crown, Settings, Activity } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { api } from '../../lib/api';
import { useAuth } from '../../lib/useAuth';
import { useGuild } from '../../lib/useGuild';
import { describeAction, formatPayload } from '../../lib/activityActions';
import AiSummaryWidget from '../../components/AiSummaryWidget';

const GUILD_SCOPED_CARDS = [
  { to: '/admin/seasons', icon: Trophy, label: 'Temporadas', desc: 'Cerrar, crear y activar con regla de reset', color: 'text-elite-violet' },
  { to: '/admin/events-list', icon: Calendar, label: 'Eventos', desc: 'Crear torneos · gestionar inscritos · EXP automática', color: 'text-elite-blue' },
  { to: '/admin/products', icon: Package, label: 'Productos', desc: 'Catálogo Normal · Elite Access · Pro · Preventas', color: 'text-elite-gold' },
  { to: '/admin/reservations', icon: ShoppingBag, label: 'Reservas', desc: 'Aprobar, rechazar y marcar pagadas', color: 'text-elite-magenta' },
  { to: '/admin/join-requests', icon: UserPlus, label: 'Solicitudes', desc: 'Aprobar nuevos miembros del Gremio', color: 'text-amber-300' },
  { to: '/admin/missions', icon: Zap, label: 'Misiones', desc: 'Semanales y de temporada con recompensa EXP', color: 'text-elite-blue' },
  { to: '/admin/achievements', icon: Award, label: 'Medallas', desc: 'Crear medallas y otorgarlas manualmente', color: 'text-elite-magenta' },
];

const GLOBAL_CARDS = [
  { to: '/admin/players', icon: Users, label: 'Jugadores', desc: 'Editar perfil · cambiar rol · ajustar EXP', color: 'text-emerald-400' },
  { to: '/admin/games', icon: Gamepad2, label: 'Juegos', desc: 'TCG soportados', color: 'text-white/70' },
];

const MAESTRO_CARDS = [
  { to: '/guild-admin/members', icon: Crown, label: 'Miembros', desc: 'Lista, roles y gestión de la comunidad', color: 'text-elite-gold' },
  { to: '/guild-admin/settings', icon: Settings, label: 'Ajustes Gremio', desc: 'Logo, banner, accent color, descripción', color: 'text-elite-gold' },
];

export default function AdminDashboard() {
  const { user } = useAuth();
  const { current } = useGuild();
  const isGlobalAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
  const isMaestro = current?.role === 'GUILD_ADMIN';

  const [stats, setStats] = useState({
    members: 0, seasons: 0, active: null, promoted: 0,
    products: 0, events: 0, pendingRequests: 0,
  });
  const [recentActivity, setRecentActivity] = useState([]);

  useEffect(() => {
    const guildId = current?.guild?.id;
    Promise.all([
      // Miembros del Gremio actual (en lugar de jugadores globales)
      guildId ? api.get(`/guilds/${guildId}/members`).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
      api.get('/seasons').catch(() => ({ data: [] })),
      api.get('/seasons/active').catch(() => ({ data: null })),
      api.get('/admin/seasons/active/promoted-players').catch(() => ({ data: [] })),
      api.get('/admin/products').catch(() => ({ data: [] })),
      api.get('/admin/events').catch(() => ({ data: [] })),
      guildId && isMaestro
        ? api.get(`/guilds/${guildId}/join-requests/count`).catch(() => ({ data: { pending: 0 } }))
        : Promise.resolve({ data: { pending: 0 } }),
    ]).then(([mem, s, a, pr, prod, ev, jr]) => {
      setStats({
        members: mem.data.length,
        seasons: s.data.length,
        active: a.data,
        promoted: pr.data.length,
        products: prod.data.length,
        events: ev.data.length,
        pendingRequests: jr.data.pending,
      });
    });
  }, [current?.guild?.id, isMaestro]);

  useEffect(() => {
    const guildId = current?.guild?.id;
    if (!guildId || !isMaestro) { setRecentActivity([]); return; }
    api.get(`/guilds/${guildId}/activity?limit=5`)
      .then((r) => setRecentActivity(r.data))
      .catch(() => setRecentActivity([]));
  }, [current?.guild?.id, isMaestro]);

  const cards = [
    ...GUILD_SCOPED_CARDS,
    ...(isGlobalAdmin ? GLOBAL_CARDS : []),
    ...(isMaestro ? MAESTRO_CARDS : []),
  ];

  return (
    <AdminLayout
      title={current ? `Panel · ${current.guild.name}` : 'Panel administrativo'}
      subtitle={
        isGlobalAdmin
          ? 'Gestión global + scoped al Gremio actual.'
          : `Gestión del Gremio donde eres Maestro.`
      }
    >
      <div className="grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <Stat label="Miembros" value={stats.members} icon={Users} />
        <Stat label="Temporadas" value={stats.seasons} icon={Calendar} />
        <Stat label="T activa" value={stats.active ? `T${stats.active.number}` : '—'} icon={Trophy} highlight={!!stats.active} />
        <Stat label="Promovidos" value={stats.promoted} icon={Sparkles} highlight={stats.promoted > 0} />
        <Stat label="Productos" value={stats.products} icon={Package} />
        <Stat label="Eventos" value={stats.events} icon={Zap} />
      </div>

      {stats.pendingRequests > 0 && (
        <Link to="/admin/join-requests"
          className="flex items-center gap-3 p-4 mb-5 rounded-xl bg-amber-500/10 border border-amber-500/30 hover:bg-amber-500/15 transition">
          <UserPlus size={18} className="text-amber-300" />
          <div className="flex-grow">
            <p className="font-semibold text-amber-300">
              {stats.pendingRequests} solicitud{stats.pendingRequests !== 1 ? 'es' : ''} pendiente{stats.pendingRequests !== 1 ? 's' : ''} de revisar
            </p>
            <p className="text-xs text-white/60">Nuevos aventureros quieren unirse a {current?.guild?.name || 'tu Gremio'}.</p>
          </div>
          <ChevronRight size={14} className="text-amber-300" />
        </Link>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => (
          <Link key={c.to} to={c.to}
            className="p-5 rounded-2xl bg-bg-surface border border-bg-border hover:border-elite-violet/40 transition group">
            <c.icon size={20} className={`${c.color} mb-3`} />
            <p className="font-display font-semibold mb-1">{c.label}</p>
            <p className="text-xs text-white/50 leading-snug">{c.desc}</p>
            <ChevronRight size={14} className="mt-3 text-white/30 group-hover:text-white group-hover:translate-x-1 transition-transform" />
          </Link>
        ))}
      </div>

      {isMaestro && (
        <div className="mt-8">
          <AiSummaryWidget />
        </div>
      )}

      {isMaestro && recentActivity.length > 0 && (
        <div className="mt-8 p-5 rounded-2xl bg-bg-surface border border-bg-border">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-display font-semibold flex items-center gap-2">
              <Activity size={14} className="text-elite-violet" /> Actividad reciente
            </h2>
            <Link to="/guild-admin/activity" className="text-xs text-elite-violet hover:text-white">
              Ver todo →
            </Link>
          </div>
          <div className="space-y-1">
            {recentActivity.map((e) => {
              const meta = describeAction(e);
              const detail = formatPayload(e);
              const date = new Date(e.created_at);
              return (
                <div key={e.id} className="flex items-center gap-2.5 py-1.5 text-sm">
                  <meta.Icon size={12} className={`${meta.color} flex-shrink-0`} />
                  <span className="text-white/80 truncate">
                    <span className="font-semibold">{e.admin_alias || e.admin_email}</span>
                    <span className="text-white/50"> {meta.verb}</span>
                    {detail && <span className="font-semibold"> {detail}</span>}
                  </span>
                  <span className="ml-auto text-[10px] text-white/30 font-mono flex-shrink-0">
                    {date.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </AdminLayout>
  );
}

function Stat({ label, value, icon: Icon, highlight }) {
  return (
    <div className={`p-3 rounded-xl border ${highlight ? 'bg-elite-gold/5 border-elite-gold/30' : 'bg-bg-surface border-bg-border'}`}>
      <Icon size={14} className={highlight ? 'text-elite-gold' : 'text-white/60'} />
      <p className="text-[9px] tracking-widest uppercase text-white/40 mt-2">{label}</p>
      <p className={`font-mono text-xl font-bold mt-0.5 ${highlight ? 'text-elite-gold' : 'text-white'}`}>{value}</p>
    </div>
  );
}
