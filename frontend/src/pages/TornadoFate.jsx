import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Wind, Zap, Crown, Calendar, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import EmptyState from '../components/EmptyState';
import { api } from '../lib/api';

export default function TornadoFate() {
  const [current, setCurrent] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const [c, h] = await Promise.all([
        api.get('/tornado/current').then((r) => r.data).catch(() => null),
        api.get('/tornado/history').then((r) => r.data).catch(() => []),
      ]);
      setCurrent(c);
      setHistory(h);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const fire = async () => {
    try {
      const { data } = await api.post('/tornado/fire');
      setCurrent(data);
      toast.success(`¡Tornado disparado sobre ${data.target_alias}!`);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Falló');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="max-w-4xl mx-auto px-6 py-20 text-center text-slate-400">Esperando el viento…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-cyan-950/30 text-white overflow-hidden">
      <Navbar />

      {/* Animated wind */}
      <div className="absolute inset-x-0 top-14 h-96 overflow-hidden pointer-events-none">
        {[...Array(8)].map((_, i) => (
          <motion.div
            key={i}
            className="absolute h-px bg-gradient-to-r from-transparent via-cyan-400/30 to-transparent"
            style={{ width: '60%', top: `${10 + i * 12}%` }}
            animate={{ x: ['-60%', '160%'] }}
            transition={{ duration: 4 + i * 0.5, repeat: Infinity, ease: 'linear', delay: i * 0.3 }}
          />
        ))}
      </div>

      <div className="relative max-w-4xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <motion.div
            animate={{ rotate: [0, 360] }}
            transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
            className="inline-block mb-4"
          >
            <Wind size={48} className="text-cyan-300 drop-shadow-[0_0_20px_rgba(34,211,238,0.6)]" />
          </motion.div>
          <div className="inline-flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-cyan-300" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-cyan-300 font-bold">
              Tornado of Fate · Diario
            </span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tighter bg-gradient-to-r from-cyan-200 via-white to-violet-200 bg-clip-text text-transparent">
            El viento elige.
          </h1>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto">
            Una vez al día, un jugador random del Gremio recibe un buff aleatorio.
            Suerte pura. Nadie sabe a quién le tocará.
          </p>
        </div>

        {/* Current */}
        {current ? <CurrentTornado data={current} /> : (
          <div className="rounded-3xl bg-white/[0.04] ring-1 ring-white/10 p-8 text-center">
            <Wind size={32} className="mx-auto mb-3 text-slate-500" />
            <p className="text-slate-300 mb-4">Aún no se disparó el tornado de hoy.</p>
            <button
              onClick={fire}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 text-white text-sm font-bold hover:shadow-lg transition"
            >
              Disparar tornado
            </button>
          </div>
        )}

        {/* History */}
        <div className="mt-10">
          <div className="text-[10px] uppercase tracking-widest text-cyan-300 font-bold mb-3 flex items-center gap-1.5">
            <Calendar size={11} /> Historial reciente
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-slate-500 italic">Sin tornados pasados.</p>
          ) : (
            <ul className="space-y-2">
              {history.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] ring-1 ring-white/5">
                  <div className="w-9 h-9 rounded-lg bg-cyan-500/20 text-cyan-300 flex items-center justify-center shrink-0">
                    <Wind size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold truncate">
                      <span className="text-white">{t.target_alias}</span>
                      {t.is_me && <span className="ml-2 text-[10px] uppercase font-bold text-cyan-300">TÚ</span>}
                    </div>
                    <div className="text-xs text-slate-400 truncate">{t.buff_label}</div>
                  </div>
                  <div className="text-[10px] text-slate-500 font-mono shrink-0">{t.event_date}</div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

function CurrentTornado({ data }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
      className={`relative rounded-3xl bg-gradient-to-br ${
        data.is_me
          ? 'from-cyan-500/40 via-violet-500/30 to-fuchsia-500/30 ring-2 ring-cyan-300/60 shadow-2xl shadow-cyan-500/30'
          : 'from-cyan-700/30 via-slate-900 to-violet-900/30 ring-1 ring-cyan-500/30'
      } p-8 sm:p-10 overflow-hidden`}
    >
      <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-cyan-500/20 blur-3xl pointer-events-none" />

      <div className="relative flex flex-col sm:flex-row items-center gap-6">
        <div className="relative shrink-0">
          <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-2xl bg-gradient-to-br from-cyan-500 to-violet-600 ring-4 ring-cyan-300/40 flex items-center justify-center">
            <Crown size={56} className="text-white drop-shadow-lg" />
          </div>
          <div className="absolute -bottom-2 -right-2 w-12 h-12 rounded-full bg-gradient-to-br from-cyan-400 to-violet-500 ring-2 ring-cyan-300 flex items-center justify-center">
            <Zap size={18} className="text-white" />
          </div>
        </div>

        <div className="flex-1 min-w-0 text-center sm:text-left">
          <div className="text-[10px] uppercase tracking-[0.4em] text-cyan-300 font-bold mb-1">
            Elegido del día
          </div>
          <Link to={`/players/${data.target_player_id}`}>
            <h2 className="text-4xl sm:text-5xl font-black text-white hover:text-cyan-200 transition leading-tight break-words">
              {data.target_alias}
            </h2>
          </Link>
          <div className="text-xs font-mono text-cyan-200/80 mb-3">{data.target_elite_id}</div>

          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-black/40 ring-1 ring-cyan-400/40">
            <Zap size={14} className="text-cyan-300" />
            <span className="text-cyan-100 font-bold">{data.buff_label}</span>
          </div>

          {data.is_me && (
            <p className="mt-4 text-cyan-200 text-sm">El viento te eligió hoy. Aprovéchalo.</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
