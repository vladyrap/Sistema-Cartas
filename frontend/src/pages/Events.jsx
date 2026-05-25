import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Calendar, Users, Trophy, Sparkles } from 'lucide-react';
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

export default function Events() {
  const [events, setEvents] = useState([]);
  const [games, setGames] = useState({});
  const [loading, setLoading] = useState(true);
  const [filterGame, setFilterGame] = useState('all');

  useEffect(() => {
    Promise.all([api.get('/events'), api.get('/games')])
      .then(([e, g]) => {
        setEvents(e.data);
        setGames(Object.fromEntries(g.data.map((x) => [x.id, x])));
      })
      .finally(() => setLoading(false));
  }, []);

  const filtered = events.filter((e) => filterGame === 'all' || e.game_id === Number(filterGame));

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-6 py-10">
        <header className="mb-6 flex items-end justify-between flex-wrap gap-4">
          <div>
            <p className="text-xs tracking-widest uppercase text-white/40">Calendario competitivo</p>
            <h1 className="font-display text-3xl font-bold mt-1">Próximos eventos</h1>
          </div>
          <select value={filterGame} onChange={(e) => setFilterGame(e.target.value)}
            className="px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm focus:border-elite-violet/60 outline-none">
            <option value="all">Todos los juegos</option>
            {Object.values(games).map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
          </select>
        </header>

        {loading && <p className="text-white/40">Cargando eventos…</p>}
        {!loading && filtered.length === 0 && (
          <p className="text-white/40">No hay eventos para mostrar.</p>
        )}

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((ev, i) => (
            <motion.div key={ev.id}
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: i * 0.04 }}
              className="p-5 rounded-2xl bg-bg-surface border border-bg-border hover:border-elite-violet/40 transition group"
            >
              <div className="flex items-start justify-between mb-3">
                <span className={`text-[10px] tracking-widest uppercase font-semibold px-2 py-0.5 rounded border ${TYPE_COLORS[ev.event_type]}`}>
                  {TYPE_LABELS[ev.event_type]}
                </span>
                {ev.event_type === 'FINAL_ELITE' && <Trophy size={14} className="text-elite-gold" />}
                {ev.event_type === 'ELITE_CHALLENGE' && <Sparkles size={14} className="text-elite-magenta" />}
              </div>
              <h3 className="font-display text-lg font-semibold leading-tight">{ev.name}</h3>
              <p className="text-xs text-white/40 mt-1">{games[ev.game_id]?.short_name || games[ev.game_id]?.name}</p>

              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/5 text-xs text-white/60">
                <span className="flex items-center gap-1.5">
                  <Calendar size={12} />
                  <span className="font-mono">
                    {new Date(ev.starts_at).toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
                  </span>
                </span>
                <span className="flex items-center gap-1.5">
                  <Users size={12} />
                  <span className="font-mono">{ev.registered_count}/{ev.slots}</span>
                </span>
                {ev.price_clp > 0 && (
                  <span className="font-mono">${ev.price_clp.toLocaleString()}</span>
                )}
              </div>

              <Link to={`/events/${ev.id}`}
                className="block mt-4 text-center px-4 py-2 rounded-lg bg-elite-violet/10 border border-elite-violet/30 text-elite-violet text-sm font-medium hover:bg-elite-violet/20 transition">
                Ver detalle
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </Layout>
  );
}
