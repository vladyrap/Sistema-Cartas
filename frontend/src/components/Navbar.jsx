import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import {
  Sparkles, LogOut, User as UserIcon, Shield, Crown,
  ChevronDown, LayoutDashboard, Target, CalendarCheck, Layers,
  Map, Trophy, Activity as ActivityIcon, Radio, MoreHorizontal,
  Gift, ScanLine, Skull, Film, Wand2,
  Heart, Package, Puzzle, TrendingUp, Flame, ShoppingCart,
  Wind, Dices, Coins,
  GitBranch, Mic, Drama,
  Globe2, Atom, Scroll, Brain,
} from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import { useGuild } from '../lib/useGuild';
import NotificationsBell from './NotificationsBell';
import GuildSwitcher from './GuildSwitcher';
import ThemePicker from './ThemePicker';

const linkCls = ({ isActive }) =>
  `text-sm whitespace-nowrap transition-colors ${
    isActive ? 'text-white' : 'text-white/60 hover:text-white'
  }`;

const dropItemCls = ({ isActive }) =>
  `flex items-center gap-2 px-3 py-2 text-sm transition-colors whitespace-nowrap ${
    isActive
      ? 'bg-white/10 text-white'
      : 'text-white/70 hover:text-white hover:bg-white/5'
  }`;

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
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 h-14 flex items-center gap-4">
        {/* Logo — marca producto fija (el nombre del guild va en el switcher) */}
        <Link to="/" className="flex items-center gap-2 shrink-0">
          <div
            className={`w-7 h-7 rounded-md flex items-center justify-center shrink-0 ${
              accent ? '' : 'bg-gradient-to-br from-elite-violet to-elite-blue'
            }`}
            style={accent ? { background: `linear-gradient(135deg, ${accent}, ${accent}aa)` } : undefined}
          >
            <Sparkles size={14} className="text-white" />
          </div>
          <span className="font-display font-bold tracking-tight whitespace-nowrap hidden sm:inline">
            EliteCards
          </span>
        </Link>

        {/* Nav principal — 5 items, siempre caben */}
        <nav className="hidden lg:flex items-center gap-5 xl:gap-6 shrink-0">
          <NavLink to="/ruta" className={linkCls}>Ruta</NavLink>
          <NavLink to="/ranking" className={linkCls}>Ranking</NavLink>
          <NavLink to="/events" className={linkCls}>Eventos</NavLink>
          <NavLink to="/catalog" className={linkCls}>Catálogo</NavLink>
          <NavLink to="/guilds" className={linkCls}>Gremios</NavLink>
          <MoreMenu />
          {isAuthed && <AccountMenu />}
        </nav>

        {/* Spacer que empuja la derecha */}
        <div className="flex-1 min-w-0" />

        {/* Acciones derecha */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {isAdmin && (
            <NavLink
              to="/admin"
              className={({ isActive }) =>
                `hidden md:inline-flex items-center gap-1 text-sm whitespace-nowrap text-elite-gold ${
                  isActive ? 'opacity-100' : 'opacity-80 hover:opacity-100'
                }`
              }
            >
              <Shield size={12} /> Admin
            </NavLink>
          )}
          {isSuperAdmin && (
            <NavLink
              to="/super-admin/guilds"
              className={({ isActive }) =>
                `hidden md:inline-flex items-center gap-1 text-sm whitespace-nowrap text-elite-gold ${
                  isActive ? 'opacity-100' : 'opacity-80 hover:opacity-100'
                }`
              }
            >
              <Crown size={12} /> Super
            </NavLink>
          )}

          <ThemePicker />

          {isAuthed ? (
            <>
              <GuildSwitcher />
              <NotificationsBell />
              <span className="hidden 2xl:inline-flex items-center gap-1.5 text-xs text-white/60 max-w-[120px] truncate">
                <UserIcon size={12} /> {user?.profile?.alias || user?.email}
              </span>
              <button
                onClick={logout}
                className="inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white whitespace-nowrap shrink-0"
                title="Salir"
              >
                <LogOut size={14} />
                <span className="hidden xl:inline">Salir</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => navigate('/login')}
                className="text-sm text-white/70 hover:text-white whitespace-nowrap"
              >
                Login
              </button>
              <button
                onClick={() => navigate('/register')}
                className="px-3 sm:px-4 py-1.5 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white text-sm font-medium hover:shadow-glow-violet transition whitespace-nowrap"
              >
                Crear Elite ID
              </button>
            </>
          )}
        </div>
      </div>

      {/* Nav móvil/tablet (<lg) */}
      <MobileNav isAuthed={isAuthed} isAdmin={isAdmin} isSuperAdmin={isSuperAdmin} />
    </header>
  );
}

/* ─────────────────  Dropdown "Más"  ───────────────── */
function MoreMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const groups = [
    {
      label: 'Explorar',
      items: [
        { to: '/leaderboard', icon: Radio, label: 'Live' },
        { to: '/hall-of-fame', icon: Trophy, label: 'Hall of Fame' },
        { to: '/activity', icon: ActivityIcon, label: 'Actividad' },
        { to: '/tour', icon: Map, label: 'Tour guiado' },
      ],
    },
    {
      label: 'Diario',
      items: [
        { to: '/spinner', icon: Gift, label: 'Lucky Spinner' },
        { to: '/pack', icon: Package, label: 'Pack Opening' },
        { to: '/wordle', icon: Puzzle, label: 'Card Wordle' },
        { to: '/card-of-day', icon: Wand2, label: 'Card of the Day' },
        { to: '/tornado', icon: Wind, label: 'Tornado of Fate' },
      ],
    },
    {
      label: 'Bounty',
      items: [
        { to: '/bounty', icon: Skull, label: 'Bounty del Campeón' },
        { to: '/bounty-contracts', icon: Coins, label: 'Contratos P2P' },
      ],
    },
    {
      label: 'Diversión',
      items: [
        { to: '/tinder', icon: Heart, label: 'Cards Tinder' },
        { to: '/deck-roulette', icon: Dices, label: 'Deck Roulette' },
        { to: '/smack-talk', icon: Flame, label: 'Smack Talk' },
        { to: '/card-drama', icon: Drama, label: 'Card Drama' },
        { to: '/cardgrave', icon: Skull, label: 'Cardgrave' },
      ],
    },
    {
      label: 'Lab',
      items: [
        { to: '/devotion', icon: Flame, label: 'Devotion Altars' },
        { to: '/sealed', icon: Package, label: 'Sealed Generator' },
        { to: '/voice-report', icon: Mic, label: 'Voice Reporter' },
        { to: '/quantum', icon: Atom, label: 'Quantum Deck' },
        { to: '/quests', icon: Scroll, label: 'Apprentice Quests' },
        { to: '/constellation', icon: Globe2, label: 'Constellation Map' },
      ],
    },
    {
      label: 'Herramientas',
      items: [
        { to: '/scanner', icon: ScanLine, label: 'Card Scanner' },
        { to: '/shop-radar', icon: ShoppingCart, label: 'Shop Radar' },
        { to: '/ceiling', icon: TrendingUp, label: 'Skill Ceiling' },
        { to: '/wrapped', icon: Film, label: 'Mi Wrapped' },
      ],
    },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`text-sm whitespace-nowrap inline-flex items-center gap-1 transition-colors ${
          open ? 'text-white' : 'text-white/60 hover:text-white'
        }`}
      >
        Más <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-2 w-60 rounded-xl bg-bg-surface/95 backdrop-blur-xl border border-bg-border shadow-2xl overflow-hidden z-50 max-h-[80vh] overflow-y-auto">
          {groups.map((g, gi) => (
            <div key={g.label} className={gi > 0 ? 'border-t border-white/5' : ''}>
              <div className="px-3 pt-3 pb-1 text-[10px] uppercase tracking-widest text-white/30 font-bold">
                {g.label}
              </div>
              {g.items.map((it) => (
                <NavLink key={it.to} to={it.to} onClick={() => setOpen(false)} className={dropItemCls}>
                  <it.icon size={14} />
                  {it.label}
                </NavLink>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────  Dropdown "Yo"  ───────────────── */
function AccountMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  const items = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'Mi Dashboard' },
    { to: '/missions', icon: Target, label: 'Misiones' },
    { to: '/my-reservations', icon: CalendarCheck, label: 'Mis reservas' },
    { to: '/decks', icon: Layers, label: 'Mis decks' },
    { to: '/profile', icon: UserIcon, label: 'Perfil' },
  ];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`text-sm whitespace-nowrap inline-flex items-center gap-1 transition-colors ${
          open ? 'text-white' : 'text-white/60 hover:text-white'
        }`}
      >
        Yo <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute top-full left-0 mt-2 w-52 rounded-xl bg-bg-surface/95 backdrop-blur-xl border border-bg-border shadow-2xl overflow-hidden z-50">
          {items.map((it) => (
            <NavLink key={it.to} to={it.to} onClick={() => setOpen(false)} className={dropItemCls}>
              <it.icon size={14} />
              {it.label}
            </NavLink>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────  Nav móvil (scroll horizontal)  ───────────────── */
function MobileNav({ isAuthed, isAdmin, isSuperAdmin }) {
  return (
    <div className="lg:hidden border-t border-bg-border bg-bg/60 overflow-x-auto no-scrollbar">
      <nav className="px-4 py-2 flex items-center gap-4 text-sm">
        <NavLink to="/ruta" className={linkCls}>Ruta</NavLink>
        <NavLink to="/ranking" className={linkCls}>Ranking</NavLink>
        <NavLink to="/leaderboard" className={linkCls}>Live</NavLink>
        <NavLink to="/events" className={linkCls}>Eventos</NavLink>
        <NavLink to="/catalog" className={linkCls}>Catálogo</NavLink>
        <NavLink to="/hall-of-fame" className={linkCls}>Hall of Fame</NavLink>
        <NavLink to="/activity" className={linkCls}>Actividad</NavLink>
        <NavLink to="/guilds" className={linkCls}>Gremios</NavLink>
        <NavLink to="/tour" className={linkCls}>Tour</NavLink>
        <NavLink to="/spinner" className={linkCls}>Spinner</NavLink>
        <NavLink to="/card-of-day" className={linkCls}>Card</NavLink>
        <NavLink to="/bounty" className={linkCls}>Bounty</NavLink>
        <NavLink to="/scanner" className={linkCls}>Scanner</NavLink>
        <NavLink to="/wrapped" className={linkCls}>Wrapped</NavLink>
        {isAuthed && (
          <>
            <span className="text-white/20">·</span>
            <NavLink to="/dashboard" className={linkCls}>Dashboard</NavLink>
            <NavLink to="/missions" className={linkCls}>Misiones</NavLink>
            <NavLink to="/my-reservations" className={linkCls}>Reservas</NavLink>
            <NavLink to="/decks" className={linkCls}>Decks</NavLink>
            <NavLink to="/profile" className={linkCls}>Perfil</NavLink>
          </>
        )}
        {isAdmin && (
          <NavLink to="/admin" className="text-sm whitespace-nowrap text-elite-gold opacity-80 hover:opacity-100 inline-flex items-center gap-1">
            <Shield size={12} /> Admin
          </NavLink>
        )}
        {isSuperAdmin && (
          <NavLink to="/super-admin/guilds" className="text-sm whitespace-nowrap text-elite-gold opacity-80 hover:opacity-100 inline-flex items-center gap-1">
            <Crown size={12} /> Super
          </NavLink>
        )}
      </nav>
    </div>
  );
}
