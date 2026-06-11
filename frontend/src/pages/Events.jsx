import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Users, Trophy, Sparkles, Radio, CreditCard, ChevronRight } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../lib/api';

const TYPE_LABELS = {
  CASUAL: 'Casual',
  COMPETITIVE: 'Competitivo',
  ELITE_CHALLENGE: 'Elite Challenge',
  TRADE_DAY: 'Trade Day',
  WEEKLY_LEAGUE: 'Liga Semanal',
  MONTHLY_LEAGUE: 'Liga Mensual',
  FINAL_ELITE: 'Final Elite',
  BEGINNER_EVENT: 'Novatos',
  PREORDER_EVENT: 'Preventa',
};

const TYPE_COLORS = {
  CASUAL: 'bg-white/5 text-white/70 border-white/10',
  COMPETITIVE: 'bg-elite-violet/10 text-elite-violet border-elite-violet/30',
  ELITE_CHALLENGE: 'bg-elite-magenta/10 text-elite-magenta border-elite-magenta/30',
  TRADE_DAY: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
  WEEKLY_LEAGUE: 'bg-elite-blue/10 text-elite-blue border-elite-blue/30',
  MONTHLY_LEAGUE: 'bg-elite-blue/10 text-elite-blue border-elite-blue/30',
  FINAL_ELITE: 'bg-elite-gold/10 text-elite-gold border-elite-gold/30',
  BEGINNER_EVENT: 'bg-rank-aprendiz/10 text-rank-aprendiz border-rank-aprendiz/30',
  PREORDER_EVENT: 'bg-white/5 text-white/70 border-white/10',
};

const STATUS_FILTERS = [
  { key: 'upcoming', label: 'Próximos' },
  { key: 'live',     label: 'En juego' },
  { key: 'finished', label: 'Finalizados' },
  { key: 'all',      label: 'Todos' },
];

export default function Events() {
  const [events, setEvents] = useState([]);
  const [games, setGames] = useState({});
  const [loading, setLoading] = useState(true);
  const [filterGame, setFilterGame] = useState('all');
  const [filterStatus, setFilterStatus] = useState('upcoming');

  useEffect(() => {
    Promise.all([api.get('/events'), api.get('/games')])
      .then(([e, g]) => {
        setEvents(e.data);
        setGames(Object.fromEntries(g.data.map((x) => [x.id, x])));
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = events.filter((e) => {
    if (filterGame !== 'all' && e.game_id !== Number(filterGame)) return false;
    if (filterStatus === 'upcoming') return e.status === 'OPEN' || e.status === 'DRAFT';
    if (filterStatus === 'live') return e.status === 'CLOSED';
    if (filterStatus === 'finished') return e.status === 'FINISHED';
    return true;
  });

  // Próximos: ascendente por fecha. Finalizados: descendente (lo más reciente primero).
  const sorted = [...filtered].sort((a, b) =>
    filterStatus === 'finished'
      ? new Date(b.starts_at) - new Date(a.starts_at)
      : new Date(a.starts_at) - new Date(b.starts_at)
  );

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-6 py-10">
        <motion.header
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="mb-6"
        >
          <div className="flex items-end justify-between flex-wrap gap-4 mb-4">
            <div>
              <p className="text-xs tracking-[0.3em] uppercase text-white/40 font-bold">Calendario competitivo</p>
              <h1 className="font-display text-3xl md:text-4xl font-black mt-1">
                Eventos <span className="text-gradient">&</span> Torneos
              </h1>
            </div>
            <select value={filterGame} onChange={(e) => setFilterGame(e.target.value)}
              className="px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm focus:border-elite-violet/60 outline-none">
              <option value="all">Todos los juegos</option>
              {Object.values(games).map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
            </select>
          </div>

          <div className="flex gap-2 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button key={f.key} onClick={() => setFilterStatus(f.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition border ${
                  filterStatus === f.key
                    ? 'bg-elite-violet/25 border-elite-violet/50 text-white'
                    : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                }`}>
                {f.key === 'live' && <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse mr-1.5 align-middle" />}
                {f.label}
              </button>
            ))}
          </div>
        </motion.header>

        {loading && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="rounded-2xl glass h-52 animate-pulse" />
            ))}
          </div>
        )}
        {!loading && sorted.length === 0 && (
          <div className="rounded-2xl glass p-12 text-center text-white/40">
            <Calendar className="mx-auto mb-3 opacity-40" size={32} />
            No hay eventos {STATUS_FILTERS.find(f => f.key === filterStatus)?.label.toLowerCase()} para mostrar.
          </div>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((ev, i) => {
            const slotsPct = Math.min(100, Math.round((ev.registered_count / Math.max(1, ev.slots)) * 100));
            const isFull = ev.registered_count >= ev.slots;
            const isLive = ev.status === 'CLOSED';
            const starts = new Date(ev.starts_at);
            return (
              <motion.div key={ev.id}
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: Math.min(i * 0.04, 0.4) }}
                className={`relative p-5 rounded-2xl glass card-lift overflow-hidden ${
                  isLive ? 'border border-emerald-400/40' : ''
                }`}
              >
                {isLive && (
                  <div className="absolute top-3 right-3 flex items-center gap-1.5 text-[10px] font-bold text-emerald-300 uppercase tracking-wider">
                    <Radio size={10} className="animate-pulse" /> Live
                  </div>
                )}
                <div className="flex items-start justify-between mb-3">
                  <span className={`text-[10px] tracking-widest uppercase font-semibold px-2 py-0.5 rounded border ${TYPE_COLORS[ev.event_type]}`}>
                    {TYPE_LABELS[ev.event_type]}
                  </span>
                  {ev.event_type === 'FINAL_ELITE' && <Trophy size={14} className="text-elite-gold" />}
                  {ev.event_type === 'ELITE_CHALLENGE' && <Sparkles size={14} className="text-elite-magenta" />}
                </div>
                <h3 className="font-display text-lg font-bold leading-tight">{ev.name}</h3>
                <p className="text-xs text-white/40 mt-1">{games[ev.game_id]?.short_name || games[ev.game_id]?.name}</p>

                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between text-xs text-white/60">
                    <span className="flex items-center gap-1.5">
                      <Calendar size={12} className="text-elite-blue" />
                      <span className="font-mono capitalize">
                        {starts.toLocaleDateString('es-CL', { weekday: 'short', day: '2-digit', month: 'short' })}
                        {' · '}
                        {starts.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </span>
                    {ev.price_clp > 0 ? (
                      <span className="flex items-center gap-1 font-mono text-elite-gold">
                        <CreditCard size={11} /> ${ev.price_clp.toLocaleString('es-CL')}
                      </span>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-bold">GRATIS</span>
                    )}
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-white/40 mb-1">
                      <span className="flex items-center gap-1"><Users size={10} /> {ev.registered_count}/{ev.slots}</span>
                      {isFull && <span className="text-rose-300 font-bold">LLENO</span>}
                    </div>
                    <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                      <div className={`h-full ${isFull ? 'bg-rose-500' : slotsPct > 75 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                        style={{ width: `${slotsPct}%` }} />
                    </div>
                  </div>
                </div>

                <Link to={`/events/${ev.id}`}
                  className="mt-4 flex items-center justify-center gap-1 px-4 py-2 rounded-lg bg-elite-violet/10 border border-elite-violet/30 text-elite-violet text-sm font-medium hover:bg-elite-violet/25 transition">
                  Ver detalle <ChevronRight size={14} />
                </Link>
              </motion.div>
            );
          })}
        </div>
      </div>
    </Layout>
  );
}
