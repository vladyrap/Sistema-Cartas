import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Crown, TrendingUp, Trophy, ArrowUp, Sparkles } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../lib/api';
import { useGuild } from '../lib/useGuild';
import { RANK_COLORS } from '../lib/progression';

const REFRESH_MS = 30000;

export default function Leaderboard() {
  const { current } = useGuild();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => {
    let alive = true;
    let timer;

    async function load() {
      try {
        const r = await api.get('/streaks/live?limit=50');
        if (alive) {
          setRows(r.data);
          setLastUpdated(new Date());
        }
      } catch { /* silent */ } finally { if (alive) setLoading(false); }
    }
    load();
    timer = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [current?.guild?.id]);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <header className="text-center mb-6">
          <Trophy size={32} className="mx-auto text-elite-gold mb-2" />
          <h1 className="font-display text-3xl font-bold">Leaderboard en vivo</h1>
          <p className="text-sm text-white/50 mt-2">
            Top de la temporada activa{current ? ` en ${current.guild.name}` : ''} · se refresca cada 30s
          </p>
          {lastUpdated && (
            <p className="text-[10px] text-white/30 mt-2 font-mono">
              ↻ {lastUpdated.toLocaleTimeString('es-CL')}
            </p>
          )}
        </header>

        {loading ? (
          <p className="text-white/40 text-center text-sm">Cargando…</p>
        ) : rows.length === 0 ? (
          <div className="p-10 rounded-2xl bg-bg-surface border border-bg-border text-center text-white/40 text-sm">
            <Trophy size={28} className="mx-auto mb-2 opacity-50" />
            Aún no hay datos en esta temporada.
          </div>
        ) : (
          <div className="space-y-1.5">
            {rows.map((r, idx) => {
              const cls = RANK_COLORS[r.rank_name] || RANK_COLORS.INICIADO;
              const isTop3 = r.rank <= 3;
              return (
                <motion.div
                  key={r.player_id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx * 0.02, 0.4) }}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border ${
                    isTop3
                      ? 'bg-gradient-to-r from-elite-gold/10 to-transparent border-elite-gold/30'
                      : 'bg-bg-surface border-bg-border'
                  }`}
                >
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-mono font-bold flex-shrink-0 ${
                    r.rank === 1 ? 'bg-elite-gold/20 text-elite-gold border border-elite-gold/40'
                      : r.rank === 2 ? 'bg-white/10 text-white border border-white/20'
                      : r.rank === 3 ? 'bg-amber-700/20 text-amber-300 border border-amber-700/30'
                      : 'bg-bg-elevated text-white/60 border border-bg-border'
                  }`}>
                    {r.rank === 1 ? <Crown size={14} /> : r.rank}
                  </div>

                  <div className="flex-grow min-w-0">
                    <div className="flex items-baseline gap-2">
                      <Link to={`/players/${r.player_id}`} className="font-semibold hover:text-elite-blue">
                        {r.player_alias}
                      </Link>
                      <span className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-wider ${cls.text}`}>
                        <Sparkles size={9} /> {cls.label} · N{r.level}
                      </span>
                    </div>
                    {r.player_elite_id && (
                      <p className="text-[10px] font-mono text-white/30">{r.player_elite_id}</p>
                    )}
                  </div>

                  <div className="text-right flex-shrink-0">
                    <p className="font-mono text-sm font-semibold">{r.exp_total.toLocaleString('es-CL')}</p>
                    <p className="text-[9px] text-white/40 uppercase tracking-wider">EXP</p>
                    {r.delta_24h > 0 && (
                      <p className="text-[10px] text-emerald-300 mt-0.5 inline-flex items-center gap-0.5">
                        <ArrowUp size={9} /> +{r.delta_24h} (24h)
                      </p>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
