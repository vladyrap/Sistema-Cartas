import { useEffect, useState } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Flame, Copy, RotateCw, ArrowLeft, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import { api } from '../lib/api';

export default function SmackTalk() {
  const [params, setParams] = useSearchParams();
  const opponentId = params.get('opponent_id');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [opponentSearch, setOpponentSearch] = useState('');
  const [results, setResults] = useState([]);

  const generate = async () => {
    if (!opponentId) return;
    setLoading(true);
    setError(null);
    try {
      const { data } = await api.get(`/smack-talk/${opponentId}`);
      setData(data);
    } catch (err) {
      setError(err?.response?.data?.detail || 'No se pudo generar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { if (opponentId) generate(); }, [opponentId]);

  // Buscador simple cuando no hay opponent_id
  useEffect(() => {
    if (opponentId) return;
    if (opponentSearch.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      api.get('/players', { params: { search: opponentSearch, limit: 8 } })
        .then((r) => setResults(r.data?.items || r.data || []))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [opponentSearch, opponentId]);

  const copyAll = () => {
    if (!data?.taunts) return;
    navigator.clipboard?.writeText(data.taunts.join('\n\n'));
    toast.success('Taunts copiados al portapapeles');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-rose-950/20 to-slate-950 text-white">
      <Navbar />

      <div className="max-w-2xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <Flame size={14} className="text-rose-400" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-rose-300 font-bold">
              Smack Talk Generator
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter">
            Calentando al rival.
          </h1>
          <p className="text-slate-400 mt-3 max-w-md mx-auto">
            La IA genera 3 taunts pre-match personalizados con el historial del oponente.
          </p>
        </div>

        {/* Picker */}
        {!opponentId && (
          <div className="rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-5 mb-6">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-2">
              Buscar rival
            </div>
            <input
              type="text"
              value={opponentSearch}
              onChange={(e) => setOpponentSearch(e.target.value)}
              placeholder="Alias del oponente…"
              className="w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
            />
            {results.length > 0 && (
              <ul className="mt-2 space-y-1">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setParams({ opponent_id: p.id })}
                      className="w-full text-left flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.05] transition"
                    >
                      <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-500/40 to-fuchsia-700/40 flex items-center justify-center text-xs font-bold">
                        {p.alias?.[0]?.toUpperCase() || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-bold truncate">{p.alias}</div>
                        <div className="text-xs text-slate-500">{p.elite_id_code}</div>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {opponentId && (
          <div className="mb-4 flex items-center justify-between">
            <Link
              to="/smack-talk"
              onClick={() => { setData(null); setOpponentSearch(''); }}
              className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white"
            >
              <ArrowLeft size={12} /> Cambiar rival
            </Link>
            <button
              onClick={generate}
              disabled={loading}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-white/10 transition disabled:opacity-50"
            >
              <RotateCw size={12} className={loading ? 'animate-spin' : ''} /> Otra ronda
            </button>
          </div>
        )}

        {loading && (
          <div className="rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-12 text-center">
            <RotateCw size={32} className="mx-auto mb-3 text-rose-400 animate-spin" />
            <p className="text-slate-400">Pidiéndole a la IA que sea mala…</p>
          </div>
        )}

        {error && !loading && (
          <div className="rounded-2xl bg-rose-500/10 ring-1 ring-rose-500/30 p-5 text-center">
            <p className="text-rose-300">{error}</p>
          </div>
        )}

        {data && !loading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
            className="space-y-3"
          >
            {/* Opponent header */}
            <div className="rounded-2xl bg-gradient-to-br from-rose-700/30 to-fuchsia-900/30 ring-1 ring-rose-500/30 p-4 flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-rose-500/30 flex items-center justify-center font-black text-xl">
                {data.opponent_alias[0]?.toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] uppercase tracking-widest text-rose-300 font-bold">Tu rival</div>
                <h3 className="text-xl font-black">{data.opponent_alias}</h3>
                {data.opponent_winrate !== null && (
                  <div className="text-xs text-slate-400 mt-0.5">
                    Winrate reciente: <span className="text-rose-200 font-bold">{data.opponent_winrate}%</span>
                  </div>
                )}
              </div>
            </div>

            {data.is_mock && (
              <div className="text-[10px] uppercase tracking-widest text-amber-300/80 text-center font-bold">
                ⚠ Modo mock — configurá ANTHROPIC_API_KEY para taunts reales con Claude
              </div>
            )}

            {/* Taunts */}
            {data.taunts.map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.15 }}
                className="rounded-2xl bg-gradient-to-br from-rose-600/20 via-fuchsia-700/15 to-violet-700/15 ring-1 ring-rose-500/30 p-5 relative overflow-hidden"
              >
                <div className="absolute top-3 left-4 text-rose-400/30 font-black text-7xl pointer-events-none leading-none">"</div>
                <div className="relative pl-8">
                  <p className="text-lg leading-snug">{t}</p>
                  <div className="text-[10px] uppercase tracking-widest text-rose-300/80 font-bold mt-3">
                    Taunt #{i + 1}
                  </div>
                </div>
              </motion.div>
            ))}

            <button
              onClick={copyAll}
              className="w-full mt-4 inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/10 text-white text-sm font-bold transition"
            >
              <Copy size={14} /> Copiar todos
            </button>

            <p className="text-center text-xs text-slate-500 mt-4">
              Úsalo con buena onda. Es banter, no bullying.
            </p>
          </motion.div>
        )}
      </div>
    </div>
  );
}
