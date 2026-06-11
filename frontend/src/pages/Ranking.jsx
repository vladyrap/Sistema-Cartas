import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, Activity, Zap, TrendingUp, Sparkles } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../lib/api';

const TABS = [
  { id: 'glicko', label: 'Rating Glicko-2', icon: Activity, hint: 'Skill medido por la matemática de torneos pro' },
  { id: 'exp', label: 'EXP Temporada', icon: Zap, hint: 'Progreso de la Ruta del Campeón en la temporada actual' },
  { id: 'wr', label: 'Win Rate', icon: TrendingUp, hint: 'Porcentaje de victorias sobre matches reportados' },
];

export default function Ranking() {
  const [tab, setTab] = useState('glicko');
  const [games, setGames] = useState([]);
  const [gameId, setGameId] = useState(null);
  const [glickoRows, setGlickoRows] = useState(null);
  const [expRows, setExpRows] = useState(null);
  const [seasonName, setSeasonName] = useState(null);
  const [loading, setLoading] = useState(false);

  // Carga inicial de games
  useEffect(() => {
    api.get('/games').then((r) => {
      const list = r.data || [];
      setGames(list);
      if (list.length && !gameId) setGameId(list[0].id);
    }).catch(() => {});
  }, []);

  // Carga EXP siempre (no depende de juego)
  useEffect(() => {
    api.get('/rankings/active').then((r) => {
      setExpRows(r.data?.rows || []);
      setSeasonName(r.data?.season_name || null);
    }).catch(() => setExpRows([]));
  }, []);

  // Carga Glicko cuando cambia game
  useEffect(() => {
    if (tab !== 'glicko' && tab !== 'wr') return;
    if (!gameId) return;
    setLoading(true);
    api.get('/ratings/leaderboard', { params: { game_id: gameId, limit: 100 } })
      .then((r) => setGlickoRows(r.data || []))
      .catch(() => setGlickoRows([]))
      .finally(() => setLoading(false));
  }, [tab, gameId]);

  const currentGameName = useMemo(
    () => games.find((g) => g.id === gameId)?.name || '—',
    [games, gameId],
  );

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-6 py-10">
        <header className="mb-6 flex items-end justify-between flex-wrap gap-3">
          <div>
            <p className="text-[10px] tracking-[0.4em] uppercase text-white/40 font-bold">
              Ranking competitivo
            </p>
            <h1 className="font-display text-3xl sm:text-4xl font-bold mt-1">
              {tab === 'exp' ? (seasonName || 'Temporada') : currentGameName}
            </h1>
          </div>
          <Trophy size={28} className="text-elite-gold" />
        </header>

        {/* Tabs */}
        <div className="mb-5 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${
                tab === t.id
                  ? 'bg-gradient-to-r from-elite-violet to-elite-blue text-white shadow-lg'
                  : 'bg-white/[0.04] text-white/60 hover:text-white border border-white/10'
              }`}
            >
              <t.icon size={14} /> {t.label}
            </button>
          ))}
        </div>

        {/* Game filter — solo para Glicko y WR */}
        {(tab === 'glicko' || tab === 'wr') && games.length > 0 && (
          <div className="mb-5 inline-flex rounded-lg bg-white/[0.04] border border-white/10 p-1 overflow-x-auto no-scrollbar">
            {games.map((g) => (
              <button
                key={g.id}
                onClick={() => setGameId(g.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-bold whitespace-nowrap transition ${
                  gameId === g.id ? 'bg-elite-violet/30 text-white' : 'text-white/60 hover:text-white'
                }`}
              >
                {g.short_name || g.name}
              </button>
            ))}
          </div>
        )}

        <p className="text-xs text-white/40 mb-5 max-w-2xl">
          {TABS.find((t) => t.id === tab)?.hint}
        </p>

        {tab === 'glicko' && <GlickoTable rows={glickoRows} loading={loading} />}
        {tab === 'exp' && <ExpTable rows={expRows} seasonName={seasonName} />}
        {tab === 'wr' && <WinRateTable rows={glickoRows} loading={loading} />}
      </div>
    </Layout>
  );
}

// ─────────────────  Glicko Tab  ─────────────────

function GlickoTable({ rows, loading }) {
  if (loading || rows === null) return <Skeleton />;
  if (rows.length === 0) {
    return (
      <p className="text-white/40 italic text-center py-10">
        Sin ratings registrados para este juego. Hace falta jugar al menos 3 matches ranked.
      </p>
    );
  }
  return (
    <div className="rounded-2xl border border-bg-border overflow-hidden bg-bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-bg-elevated/60 border-b border-bg-border">
          <tr className="text-left text-[10px] tracking-widest uppercase text-white/50">
            <th className="px-4 py-3 w-12">#</th>
            <th className="px-4 py-3">Jugador</th>
            <th className="px-4 py-3 text-right">Rating</th>
            <th className="px-4 py-3 text-right hidden sm:table-cell">Peak</th>
            <th className="px-4 py-3 text-right hidden md:table-cell">RD</th>
            <th className="px-4 py-3 text-right">Matches</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isPodium = r.rank <= 3;
            const podiumColor = ['#FACC15', '#94A3B8', '#CD7F32'][r.rank - 1];
            return (
              <motion.tr
                key={r.player_id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.015, 0.4) }}
                className="border-b border-bg-border last:border-0 hover:bg-white/[0.02] transition"
              >
                <td className="px-4 py-3 font-mono">
                  <span style={isPodium ? { color: podiumColor } : {}}>{r.rank}</span>
                </td>
                <td className="px-4 py-3">
                  <Link to={`/players/${r.player_id}`} className="font-semibold hover:text-elite-blue transition">
                    {r.alias}
                  </Link>
                  <div className="text-[10px] text-white/40 font-mono">{r.elite_id_code}</div>
                </td>
                <td className="px-4 py-3 text-right">
                  <div className="font-mono text-base font-black text-elite-blue">{Math.round(r.rating)}</div>
                  <div className="text-[9px] text-white/40">Glicko-2</div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-white/70 hidden sm:table-cell">
                  {Math.round(r.peak_rating)}
                </td>
                <td className="px-4 py-3 text-right font-mono text-white/50 text-xs hidden md:table-cell">
                  ±{Math.round(r.rd)}
                </td>
                <td className="px-4 py-3 text-right font-mono">{r.matches_played}</td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-4 py-2 text-[10px] font-mono text-white/30 text-center bg-white/[0.01]">
        {rows.length} jugadores · mínimo 3 matches · rating Glicko-2 (τ=0.5)
      </div>
    </div>
  );
}

// ─────────────────  EXP Tab  ─────────────────

function ExpTable({ rows, seasonName }) {
  if (rows === null) return <Skeleton />;
  if (rows.length === 0) {
    return <p className="text-white/40 italic text-center py-10">Sin progreso de temporada todavía.</p>;
  }
  return (
    <div className="rounded-2xl border border-bg-border overflow-hidden bg-bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-bg-elevated/60 border-b border-bg-border">
          <tr className="text-left text-[10px] tracking-widest uppercase text-white/50">
            <th className="px-4 py-3 w-12">#</th>
            <th className="px-4 py-3">Jugador</th>
            <th className="px-4 py-3 text-right">EXP T</th>
            <th className="px-4 py-3 hidden sm:table-cell">Nivel</th>
            <th className="px-4 py-3 text-right hidden md:table-cell">Prestigio</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => {
            const isPodium = row.position <= 3;
            const podiumColor = ['#FACC15', '#94A3B8', '#CD7F32'][row.position - 1];
            return (
              <motion.tr
                key={row.player_id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.015, 0.4) }}
                className="border-b border-bg-border last:border-0 hover:bg-white/[0.02] transition"
              >
                <td className="px-4 py-3 font-mono">
                  <span style={isPodium ? { color: podiumColor } : {}}>{row.position}</span>
                </td>
                <td className="px-4 py-3">
                  <Link to={`/players/${row.player_id}`} className="font-semibold hover:text-elite-blue transition">
                    {row.alias}
                  </Link>
                  {row.was_promoted_start && (
                    <span title="Comenzó promovido como Duelista N10" className="ml-1.5 inline-flex items-center text-elite-gold">
                      <Sparkles size={11} />
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-right font-mono font-bold text-elite-blue">{row.exp_total.toLocaleString()}</td>
                <td className="px-4 py-3 hidden sm:table-cell text-xs text-white/60">
                  N{row.level} <span className="text-white/30">·</span> {row.current_rank?.toLowerCase()}
                </td>
                <td className="px-4 py-3 text-right font-mono text-elite-gold hidden md:table-cell">
                  {row.prestige.toLocaleString()}
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-4 py-2 text-[10px] font-mono text-white/30 text-center bg-white/[0.01]">
        {rows.length} jugadores · ranked por EXP de {seasonName || 'temporada activa'}
      </div>
    </div>
  );
}

// ─────────────────  Win Rate Tab  ─────────────────

function WinRateTable({ rows, loading }) {
  // Derivar WR desde leaderboard: necesitamos wins/losses agregados
  // El leaderboard actual no los expone; usamos matches_played como base + ordenamos por rating.
  // Para el WR real, hacemos un fetch lateral por jugador… más simple: ordenamos por rating como proxy
  // y mostramos matches_played. Más adelante el backend puede agregar wins/losses.
  if (loading || rows === null) return <Skeleton />;
  if (rows.length === 0) {
    return <p className="text-white/40 italic text-center py-10">Sin datos.</p>;
  }
  // Aproximación: ordenamos por rating como proxy de WR (jugadores con rating alto y muchos matches → buen WR)
  const sorted = [...rows].sort((a, b) => (b.rating - 1500) * b.matches_played - (a.rating - 1500) * a.matches_played);
  return (
    <div className="rounded-2xl border border-bg-border overflow-hidden bg-bg-surface">
      <table className="w-full text-sm">
        <thead className="bg-bg-elevated/60 border-b border-bg-border">
          <tr className="text-left text-[10px] tracking-widest uppercase text-white/50">
            <th className="px-4 py-3 w-12">#</th>
            <th className="px-4 py-3">Jugador</th>
            <th className="px-4 py-3 text-right">Rating</th>
            <th className="px-4 py-3 text-right">Matches</th>
            <th className="px-4 py-3 text-right">WR aprox.</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((r, i) => {
            // WR estimado: rating sobre 1500 + matches_played
            const wrEstimate = Math.max(0, Math.min(95, 50 + (r.rating - 1500) / 25));
            return (
              <motion.tr
                key={r.player_id}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: Math.min(i * 0.015, 0.4) }}
                className="border-b border-bg-border last:border-0 hover:bg-white/[0.02] transition"
              >
                <td className="px-4 py-3 font-mono">{i + 1}</td>
                <td className="px-4 py-3">
                  <Link to={`/players/${r.player_id}`} className="font-semibold hover:text-elite-blue">
                    {r.alias}
                  </Link>
                </td>
                <td className="px-4 py-3 text-right font-mono text-elite-blue">{Math.round(r.rating)}</td>
                <td className="px-4 py-3 text-right font-mono">{r.matches_played}</td>
                <td className="px-4 py-3 text-right">
                  <div className="inline-flex items-center gap-2 justify-end">
                    <div className="w-16 h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-emerald-500 to-cyan-400"
                        style={{ width: `${wrEstimate}%` }}
                      />
                    </div>
                    <span className="font-mono text-xs text-emerald-300 w-10 text-right">{Math.round(wrEstimate)}%</span>
                  </div>
                </td>
              </motion.tr>
            );
          })}
        </tbody>
      </table>
      <div className="px-4 py-2 text-[10px] font-mono text-white/30 text-center bg-white/[0.01]">
        WR aproximado desde rating Glicko · cálculo exacto requiere endpoint dedicado
      </div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="space-y-2">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="h-12 rounded-lg bg-white/[0.02] ring-1 ring-white/5 animate-pulse" />
      ))}
    </div>
  );
}
