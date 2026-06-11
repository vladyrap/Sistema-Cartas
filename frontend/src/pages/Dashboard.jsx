import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Check, Lock, Sparkles, Trophy, ChevronRight, Edit3, FileText,
  Layers, Activity, Calendar, Swords, TrendingUp, GitBranch,
} from 'lucide-react';
import Layout from '../components/Layout';
import EliteIdCard from '../components/EliteIdCard';
import RankBadge from '../components/RankBadge';
import ExpBar from '../components/ExpBar';
import ProfileEditModal from '../components/ProfileEditModal';
import StreakWidget from '../components/StreakWidget';
import { api } from '../lib/api';
import { auth } from '../lib/auth';
import { useLevelUp } from '../lib/useLevelUp';
import { RANK_COLORS } from '../lib/progression';

export default function Dashboard() {
  const [me, setMe] = useState(null);
  const [decks, setDecks] = useState([]);
  const [ratings, setRatings] = useState([]);
  const [upcomingEvents, setUpcomingEvents] = useState([]);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const { checkLevelUp, setBaseline } = useLevelUp();

  async function load() {
    if (!auth.isAuthed()) return;
    try {
      const [meR, decksR, ratingsR, eventsR, gamesR] = await Promise.all([
        api.get('/players/me'),
        api.get('/decks/me').catch(() => ({ data: [] })),
        api.get('/ratings/me').catch(() => ({ data: [] })),
        api.get('/events', { params: { status: 'OPEN', limit: 4 } }).catch(() => ({ data: [] })),
        api.get('/games').catch(() => ({ data: [] })),
      ]);
      setMe(meR.data);
      setDecks(decksR.data || []);
      setRatings(ratingsR.data || []);
      // events puede venir como array o {items:[]}
      const evs = Array.isArray(eventsR.data) ? eventsR.data : (eventsR.data?.items || []);
      setUpcomingEvents(evs.slice(0, 3));
      setGames(gamesR.data || []);
      const stored = localStorage.getItem('ec_last_level');
      if (!stored) setBaseline(meR.data?.progress?.level || 1);
      else checkLevelUp();
    } catch (e) {
      setError(e.response?.data?.detail || 'Error cargando datos');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  if (!auth.isAuthed()) return <Navigate to="/login" replace />;

  if (loading) {
    return (
      <Layout>
        <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center text-white/40">
          Cargando tu mesa de juego…
        </div>
      </Layout>
    );
  }

  if (error || !me) {
    return (
      <Layout>
        <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center text-rose-400">
          {error || 'Sin datos'}
        </div>
      </Layout>
    );
  }

  const { player, progress, benefits, season_name } = me;
  const cardPlayer = {
    ...player,
    level: progress?.level ?? 1,
    current_rank: progress?.current_rank ?? 'INICIADO',
  };
  const topRating = ratings[0]; // ya viene ordenado desc por rating
  const topRatingGame = topRating ? games.find((g) => g.id === topRating.game_id) : null;
  const activeDeck = decks.find((d) => d.is_active) || decks[0];
  const activeDeckGame = activeDeck ? games.find((g) => g.id === activeDeck.game_id) : null;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Welcome hero — avatar + alias + seasonal context */}
        <motion.header
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="relative mb-8 p-6 rounded-3xl glass aurora-bg grain overflow-hidden"
        >
          <div className="relative flex items-center gap-5 flex-wrap">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-elite-violet to-elite-blue blur-xl opacity-60" />
              {player.avatar_url ? (
                <img src={player.avatar_url} alt="" className="relative w-20 h-20 rounded-full ring-2 ring-elite-violet/60 object-cover" />
              ) : (
                <div className="relative w-20 h-20 rounded-full bg-gradient-to-br from-elite-violet to-elite-blue ring-2 ring-elite-violet/60 grid place-items-center font-display text-3xl font-black">
                  {player.alias?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              <div className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-bg-elevated ring-2 ring-bg grid place-items-center text-xs font-bold text-elite-gold">
                {progress?.level ?? 1}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] tracking-[0.4em] uppercase text-white/40 font-bold mb-1">
                {season_name || 'Sin temporada activa'}
              </p>
              <h1 className="font-display text-3xl md:text-4xl font-extrabold">
                Hola, <span className="text-gradient">{player.alias}</span>
              </h1>
              <p className="text-sm text-white/50 mt-1">
                Rango actual · <span className="text-white font-semibold">{RANK_COLORS[progress?.current_rank || 'INICIADO']?.label || 'Iniciado'}</span>
              </p>
            </div>
            <button onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl glass-strong hover:border-elite-violet/40 text-sm transition">
              <Edit3 size={14} /> Editar perfil
            </button>
          </div>
        </motion.header>

        {/* HERO: Active Deck + Top Rating + Próximo Evento + Último Match */}
        <div className="grid lg:grid-cols-[1.4fr_1fr] gap-5 mb-6">
          {/* Deck activo */}
          <ActiveDeckCard deck={activeDeck} game={activeDeckGame} totalDecks={decks.length} />

          {/* Top rating */}
          <TopRatingCard rating={topRating} game={topRatingGame} ratingsCount={ratings.length} />
        </div>

        <div className="grid md:grid-cols-2 gap-5 mb-6">
          <UpcomingEventsCard events={upcomingEvents} />
          <LastMatchCard playerId={player.id} games={games} />
        </div>

        {/* Stats row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <MiniStat label="Mazos" value={decks.length} icon={Layers} accent="violet" />
          <MiniStat label="Juegos con rating" value={ratings.length} icon={Activity} accent="cyan" />
          <MiniStat label="Próximos eventos" value={upcomingEvents.length} icon={Calendar} accent="emerald" />
          <MiniStat label="Nivel actual" value={`N${progress?.level || 1}`} icon={Trophy} accent="amber" />
        </div>

        {/* Sidebar layout: ID card + Progress + Benefits */}
        <div className="grid md:grid-cols-[auto_1fr] gap-8 items-start">
          <div className="flex flex-col items-center gap-3">
            <EliteIdCard player={cardPlayer} />
            <button onClick={() => setEditOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs text-white/60 hover:text-white">
              <Edit3 size={12} /> {player.avatar_url || player.bio ? 'Editar foto y bio' : 'Agregar foto y bio'}
            </button>
          </div>

          <div className="space-y-5 min-w-0">
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
              className="p-5 rounded-2xl bg-bg-surface border border-bg-border"
            >
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <RankBadge rank={progress?.current_rank || 'INICIADO'} level={progress?.level} size="lg" />
                {progress?.was_promoted_start && (
                  <span className="inline-flex items-center gap-1.5 text-[11px] px-2 py-1 rounded-md bg-elite-gold/10 text-elite-gold border border-elite-gold/30">
                    <Sparkles size={12} /> Promovido por mérito previo
                  </span>
                )}
              </div>
              {progress ? <ExpBar level={progress.level} expInLevel={progress.exp_in_level} /> : (
                <p className="text-sm text-white/50">Sin progreso en la temporada activa todavía.</p>
              )}
              {progress && (
                <div className="grid grid-cols-3 gap-4 mt-5 pt-4 border-t border-white/5">
                  <Stat label="EXP total" value={progress.exp_total.toLocaleString()} />
                  <Stat label="Nivel inicial" value={progress.starting_level} />
                  <Stat label="Rango máx." value={RANK_COLORS[progress.max_rank].label} />
                </div>
              )}
            </motion.div>

            <StreakWidget />

            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.05 }}
              className="p-5 rounded-2xl bg-bg-surface border border-bg-border"
            >
              <h2 className="font-display text-base font-semibold mb-3 flex items-center justify-between">
                Beneficios
                <span className="text-xs font-normal text-white/40">
                  {benefits.filter((b) => b.unlocked).length} / {benefits.length} desbloqueados
                </span>
              </h2>
              <ul className="space-y-2">
                {benefits.slice(0, 5).map((b) => (
                  <li key={b.level} className="flex items-center gap-3 text-sm">
                    {b.unlocked
                      ? <Check size={14} className="text-elite-blue shrink-0" />
                      : <Lock size={14} className="text-white/30 shrink-0" />}
                    <span className={b.unlocked ? 'text-white' : 'text-white/40'}>
                      {b.label} <span className="font-mono text-white/30">(N{b.level})</span>
                    </span>
                  </li>
                ))}
              </ul>
              <Link to="/ruta" className="mt-4 inline-flex items-center gap-1.5 text-xs text-elite-blue hover:text-elite-violet">
                Ver Ruta del Campeón completa <ChevronRight size={12} />
              </Link>
            </motion.div>
          </div>
        </div>
      </div>

      <ProfileEditModal
        open={editOpen}
        onClose={() => setEditOpen(false)}
        profile={player}
        onUpdated={() => { load(); }}
      />
    </Layout>
  );
}

// ─────────────────  Hero cards  ─────────────────

function ActiveDeckCard({ deck, game, totalDecks }) {
  if (!deck) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl bg-gradient-to-br from-violet-900/30 via-bg-surface to-bg-surface border border-violet-500/30 p-6 flex flex-col items-center justify-center text-center min-h-[180px]"
      >
        <Layers size={28} className="text-violet-300 mb-3" />
        <p className="text-white/70 mb-3">No tenés mazos registrados todavía.</p>
        <Link to="/decks" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white text-sm font-bold transition">
          Crear mi primer mazo
        </Link>
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-gradient-to-br from-violet-900/30 via-bg-surface to-bg-surface border border-violet-500/30 p-6"
    >
      <div className="flex items-center gap-2 mb-3">
        <Layers size={14} className="text-violet-300" />
        <span className="text-[10px] uppercase tracking-[0.4em] text-violet-300 font-bold">
          Mazo activo
        </span>
        {totalDecks > 1 && (
          <span className="text-[10px] text-white/40 ml-auto">{totalDecks} mazos</span>
        )}
      </div>
      <h3 className="text-2xl font-black tracking-tight">{deck.name}</h3>
      {deck.archetype && (
        <p className="text-sm text-violet-200 mt-1 font-semibold">{deck.archetype}</p>
      )}
      <div className="flex flex-wrap gap-2 mt-3">
        {game && (
          <span className="px-2 py-0.5 rounded-md bg-white/[0.06] text-xs text-white/70 font-bold">
            {game.short_name || game.name}
          </span>
        )}
        <span className="px-2 py-0.5 rounded-md bg-white/[0.06] text-xs text-white/70 font-mono">
          {deck.main_count} main
          {deck.side_count > 0 && ` · ${deck.side_count} side`}
        </span>
        {deck.is_legal === true && (
          <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-300 text-xs font-bold">
            Legal
          </span>
        )}
        {deck.is_legal === false && (
          <span className="px-2 py-0.5 rounded-md bg-rose-500/15 text-rose-300 text-xs font-bold">
            Ilegal
          </span>
        )}
      </div>
      <div className="mt-4 flex flex-wrap gap-2">
        <Link to={`/decks/${deck.id}/builder`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-100 text-xs font-bold transition">
          <Edit3 size={11} /> Editar
        </Link>
        <Link to={`/decks/${deck.id}/dna`} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/10 text-white/80 text-xs font-bold transition">
          <GitBranch size={11} /> ADN del mazo
        </Link>
        <Link to="/decks" className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.04] hover:bg-white/10 text-white/80 text-xs font-bold transition">
          Todos mis mazos <ChevronRight size={11} />
        </Link>
      </div>
    </motion.div>
  );
}

function TopRatingCard({ rating, game, ratingsCount }) {
  if (!rating) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="rounded-2xl bg-gradient-to-br from-cyan-900/30 via-bg-surface to-bg-surface border border-cyan-500/30 p-6"
      >
        <div className="flex items-center gap-2 mb-3">
          <Activity size={14} className="text-cyan-300" />
          <span className="text-[10px] uppercase tracking-[0.4em] text-cyan-300 font-bold">Rating</span>
        </div>
        <p className="text-white/60 text-sm">
          Jugá tus primeros 3 matches en evento competitivo para ver tu rating Glicko-2 acá.
        </p>
        <Link to="/events" className="mt-3 inline-flex items-center gap-1.5 text-xs text-cyan-300 hover:text-white">
          <Calendar size={12} /> Ver torneos
        </Link>
      </motion.div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
      className="rounded-2xl bg-gradient-to-br from-cyan-900/30 via-bg-surface to-bg-surface border border-cyan-500/30 p-6"
    >
      <div className="flex items-center gap-2 mb-3">
        <Activity size={14} className="text-cyan-300" />
        <span className="text-[10px] uppercase tracking-[0.4em] text-cyan-300 font-bold">
          Rating Glicko-2
        </span>
        {ratingsCount > 1 && (
          <span className="text-[10px] text-white/40 ml-auto">{ratingsCount} juegos</span>
        )}
      </div>
      <div className="flex items-baseline gap-2">
        <span className="text-5xl font-black tabular-nums bg-gradient-to-r from-cyan-200 via-white to-blue-200 bg-clip-text text-transparent">
          {Math.round(rating.rating)}
        </span>
        {rating.rating < rating.peak_rating && (
          <span className="text-xs text-white/40 font-mono">
            peak {Math.round(rating.peak_rating)}
          </span>
        )}
      </div>
      <p className="text-sm text-white/70 mt-1">
        {game?.name || 'Juego desconocido'}
        <span className="text-white/40 ml-2 font-mono">±{Math.round(rating.rd)} RD</span>
      </p>
      <div className="mt-4 grid grid-cols-3 gap-3 pt-4 border-t border-white/5">
        <Stat label="Matches" value={rating.matches_played} />
        <Stat label="Peak" value={Math.round(rating.peak_rating)} />
        <Stat label="Volatility" value={rating.volatility.toFixed(2)} />
      </div>
      <Link to="/ranking" className="mt-3 inline-flex items-center gap-1.5 text-xs text-cyan-300 hover:text-white">
        Ver ranking del juego <ChevronRight size={11} />
      </Link>
    </motion.div>
  );
}

function UpcomingEventsCard({ events }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
      className="rounded-2xl bg-bg-surface border border-bg-border p-5"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-base font-bold flex items-center gap-2">
          <Calendar size={16} className="text-emerald-300" /> Próximos torneos
        </h3>
        <Link to="/events" className="text-xs text-emerald-300 hover:text-white">
          Ver todos →
        </Link>
      </div>
      {events.length === 0 ? (
        <p className="text-sm text-white/40 italic py-4">No hay torneos abiertos por ahora.</p>
      ) : (
        <ul className="space-y-2">
          {events.map((ev) => (
            <li key={ev.id}>
              <Link to={`/events/${ev.id}`} className="block p-3 rounded-lg hover:bg-white/[0.03] transition">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="font-semibold text-sm truncate">{ev.name}</div>
                    <div className="text-[10px] text-white/40 font-mono mt-0.5">
                      {ev.event_type?.toLowerCase()}
                      {ev.starts_at && <> · {new Date(ev.starts_at).toLocaleDateString('es-CL')}</>}
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-white/30 shrink-0" />
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}

function LastMatchCard({ playerId, games }) {
  // Sin endpoint específico de "last match", mostramos placeholder con link a leaderboard.
  // TODO: backend podría exponer /api/players/{id}/last-match para mostrar acá.
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
      className="rounded-2xl bg-bg-surface border border-bg-border p-5 flex flex-col"
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-display text-base font-bold flex items-center gap-2">
          <Swords size={16} className="text-rose-300" /> Mi juego
        </h3>
      </div>
      <p className="text-sm text-white/60 mb-3 leading-relaxed">
        Tu rating evoluciona con cada match reportado en eventos COMPETITIVE+.
        Estos son los recursos que probablemente uses más:
      </p>
      <div className="grid grid-cols-2 gap-2 mt-auto">
        <Link to="/scanner" className="p-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition text-center">
          <TrendingUp size={14} className="mx-auto text-cyan-300 mb-1" />
          <div className="text-xs font-bold">Scanner</div>
        </Link>
        <Link to="/decks" className="p-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition text-center">
          <Layers size={14} className="mx-auto text-violet-300 mb-1" />
          <div className="text-xs font-bold">Mis mazos</div>
        </Link>
        <Link to="/leaderboard" className="p-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition text-center">
          <Activity size={14} className="mx-auto text-emerald-300 mb-1" />
          <div className="text-xs font-bold">Leaderboard</div>
        </Link>
        <Link to="/activity" className="p-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] transition text-center">
          <Sparkles size={14} className="mx-auto text-amber-300 mb-1" />
          <div className="text-xs font-bold">Actividad</div>
        </Link>
      </div>
    </motion.div>
  );
}

function MiniStat({ label, value, icon: Icon, accent }) {
  const meta = {
    violet:  { txt: 'text-violet-300',  ring: 'hover:shadow-violet-500/30',  bar: 'from-violet-500 to-fuchsia-500' },
    cyan:    { txt: 'text-cyan-300',    ring: 'hover:shadow-cyan-500/30',    bar: 'from-cyan-500 to-blue-500' },
    emerald: { txt: 'text-emerald-300', ring: 'hover:shadow-emerald-500/30', bar: 'from-emerald-500 to-teal-500' },
    amber:   { txt: 'text-amber-300',   ring: 'hover:shadow-amber-500/30',   bar: 'from-amber-500 to-orange-500' },
  }[accent];
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={`group relative rounded-xl bg-bg-surface border border-bg-border p-3 overflow-hidden transition-shadow shadow-lg ${meta.ring}`}
    >
      <div className={`absolute inset-x-0 bottom-0 h-0.5 bg-gradient-to-r ${meta.bar} opacity-60 group-hover:opacity-100 transition-opacity`} />
      <div className={`text-[9px] uppercase tracking-widest font-bold mb-1 flex items-center gap-1 ${meta.txt}`}>
        <Icon size={10} /> {label}
      </div>
      <div className="text-2xl font-black tabular-nums">{value}</div>
    </motion.div>
  );
}

function Stat({ label, value }) {
  return (
    <div>
      <p className="text-[10px] tracking-widest uppercase text-white/40">{label}</p>
      <p className="font-mono text-base text-white mt-0.5 truncate">{value}</p>
    </div>
  );
}
