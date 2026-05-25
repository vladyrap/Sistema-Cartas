import { Link, NavLink, useNavigate } from 'react-router-dom';
import { Sparkles, LogOut, User as UserIcon, Shield, Crown } from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import { useGuild } from '../lib/useGuild';
import NotificationsBell from './NotificationsBell';
import GuildSwitcher from './GuildSwitcher';

const linkCls = ({ isActive }) =>
  `text-sm transition-colors ${isActive ? 'text-white' : 'text-white/60 hover:text-white'}`;

export default function Navbar() {
  const { user, isAuthed, logout } = useAuth();
  const { current } = useGuild();
  const navigate = useNavigate();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN' || current?.role === 'GUILD_ADMIN';
  const isSuperAdmin = user?.role === 'SUPER_ADMIN';
  const accent = current?.guild?.accent_color || null;

  return (
    <header
      className="sticky top-0 z-40 border-b border-bg-border bg-bg/80 backdrop-blur-xl"
      style={accent ? { boxShadow: `inset 0 -1px 0 ${accent}` } : undefined}
    >
      {accent && (
        <div
          className="h-0.5 w-full"
          style={{ background: `linear-gradient(90deg, transparent, ${accent}, transparent)` }}
          aria-hidden="true"
        />
      )}
      <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between gap-6">
        <Link to="/" className="flex items-center gap-2">
          {current?.guild?.logo_url ? (
            <img src={current.guild.logo_url} alt="" className="w-7 h-7 rounded-md object-cover" />
          ) : (
            <div
              className={`w-7 h-7 rounded-md flex items-center justify-center ${accent ? '' : 'bg-gradient-to-br from-elite-violet to-elite-blue'}`}
              style={accent ? { background: `linear-gradient(135deg, ${accent}, ${accent}aa)` } : undefined}
            >
              <Sparkles size={14} className="text-white" />
            </div>
          )}
          <span className="font-display font-bold tracking-tight">
            {current?.guild?.name || 'EliteCards'}
          </span>
        </Link>

        <nav className="hidden md:flex items-center gap-6">
          <NavLink to="/ruta" className={linkCls}>Ruta</NavLink>
          <NavLink to="/ranking" className={linkCls}>Ranking</NavLink>
          <NavLink to="/events" className={linkCls}>Eventos</NavLink>
          <NavLink to="/catalog" className={linkCls}>Catálogo</NavLink>
          <NavLink to="/hall-of-fame" className={linkCls}>Hall of Fame</NavLink>
          <NavLink to="/activity" className={linkCls}>Actividad</NavLink>
          <NavLink to="/guilds" className={linkCls}>Gremios</NavLink>
          {isAuthed && <NavLink to="/dashboard" className={linkCls}>Mi Dashboard</NavLink>}
          {isAuthed && <NavLink to="/missions" className={linkCls}>Misiones</NavLink>}
          {isAuthed && <NavLink to="/my-reservations" className={linkCls}>Mis reservas</NavLink>}
          {isAdmin && (
            <NavLink to="/admin" className={({ isActive }) => `${linkCls({ isActive })} text-elite-gold`}>
              <span className="inline-flex items-center gap-1"><Shield size={12} /> Admin</span>
            </NavLink>
          )}
          {isSuperAdmin && (
            <NavLink to="/super-admin/guilds" className={({ isActive }) => `${linkCls({ isActive })} text-elite-gold`}>
              <span className="inline-flex items-center gap-1"><Crown size={12} /> SuperAdmin</span>
            </NavLink>
          )}
        </nav>

        <div className="flex items-center gap-3">
          {isAuthed ? (
            <>
              <GuildSwitcher />
              <NotificationsBell />
              <span className="hidden sm:inline-flex items-center gap-1.5 text-xs text-white/60">
                <UserIcon size={12} /> {user?.profile?.alias || user?.email}
              </span>
              <button onClick={logout} className="inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white">
                <LogOut size={14} /> Salir
              </button>
            </>
          ) : (
            <>
              <button onClick={() => navigate('/login')} className="text-sm text-white/70 hover:text-white">Login</button>
              <button onClick={() => navigate('/register')} className="px-4 py-1.5 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white text-sm font-medium hover:shadow-glow-violet transition">
                Crear Elite ID
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
