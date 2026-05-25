import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, Sparkles } from 'lucide-react';
import Layout from '../components/Layout';
import RankBadge from '../components/RankBadge';
import { api } from '../lib/api';
import { RANK_COLORS } from '../lib/progression';

export default function Ranking() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/rankings/active')
      .then((r) => setData(r.data))
      .catch((e) => setError(e.response?.data?.detail || 'Sin temporada activa'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-6 py-10">
        <header className="mb-8 flex items-end justify-between flex-wrap gap-3">
          <div>
            <p className="text-xs tracking-widest uppercase text-white/40">Ranking competitivo</p>
            <h1 className="font-display text-3xl font-bold mt-1">{data?.season_name || 'Ranking'}</h1>
          </div>
          <Trophy size={28} className="text-elite-gold" />
        </header>

        {loading && <p className="text-white/40">Cargando ranking…</p>}
        {error && !loading && <p className="text-rose-400">{error}</p>}

        {data && data.rows.length === 0 && (
          <p className="text-white/40">Aún no hay jugadores con progreso en esta temporada.</p>
        )}

        {data && data.rows.length > 0 && (
          <div className="rounded-2xl border border-bg-border overflow-hidden bg-bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-bg-elevated/60 border-b border-bg-border">
                <tr className="text-left text-[10px] tracking-widest uppercase text-white/50">
                  <th className="px-4 py-3 w-12">#</th>
                  <th className="px-4 py-3">Jugador</th>
                  <th className="px-4 py-3 hidden sm:table-cell">Clase</th>
                  <th className="px-4 py-3">Rango</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">EXP T</th>
                  <th className="px-4 py-3 text-right hidden md:table-cell">Prestigio</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((row, i) => {
                  const isPodium = row.position <= 3;
                  const podiumColor = ['#FACC15', '#94A3B8', '#CD7F32'][row.position - 1];
                  return (
                    <motion.tr
                      key={row.player_id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.4, delay: i * 0.03 }}
                      className="border-b border-bg-border last:border-0 hover:bg-white/[0.02] transition"
                    >
                      <td className="px-4 py-3 font-mono">
                        <span style={isPodium ? { color: podiumColor } : {}}>{row.position}</span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Link to={`/players/${row.player_id}`} className="font-semibold hover:text-elite-blue transition-colors">
                            {row.alias}
                          </Link>
                          {row.was_promoted_start && (
                            <span title="Comenzó promovido como Duelista N10" className="inline-flex items-center text-elite-gold">
                              <Sparkles size={11} />
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-white/60 text-xs">
                        {row.player_class.toLowerCase()}
                      </td>
                      <td className="px-4 py-3">
                        <RankBadge rank={row.current_rank} level={row.level} size="sm" />
                      </td>
                      <td className="px-4 py-3 text-right font-mono hidden md:table-cell">{row.exp_total.toLocaleString()}</td>
                      <td className="px-4 py-3 text-right font-mono text-elite-gold hidden md:table-cell">{row.prestige.toLocaleString()}</td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="text-center text-[10px] font-mono text-white/30 mt-6">
          {data ? `${data.rows.length} jugadores · ranked por EXP de temporada` : ''}
        </p>
      </div>
    </Layout>
  );
}
