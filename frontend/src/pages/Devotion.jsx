import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Flame, Crown, Plus, X, Zap, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import EmptyState from '../components/EmptyState';
import { api } from '../lib/api';

const TIER_STYLE = {
  Shrine:    { bg: 'from-slate-700 to-slate-900',          ring: 'ring-slate-500/40',   text: 'text-slate-200', icon: '⛩' },
  Altar:     { bg: 'from-amber-700/50 to-amber-900',       ring: 'ring-amber-500/40',   text: 'text-amber-200', icon: '🔥' },
  Temple:    { bg: 'from-violet-700/50 to-violet-950',     ring: 'ring-violet-500/50',  text: 'text-violet-200', icon: '🏛' },
  Cathedral: { bg: 'from-fuchsia-700/60 to-rose-900',      ring: 'ring-fuchsia-500/60', text: 'text-fuchsia-200', icon: '⚜' },
  Pantheon:  { bg: 'from-amber-500 via-orange-600 to-rose-700', ring: 'ring-amber-300/80', text: 'text-amber-50', icon: '☀' },
};

export default function Devotion() {
  const [altars, setAltars] = useState([]);
  const [mine, setMine] = useState(null);
  const [selected, setSelected] = useState(null); // archetype para modal
  const [showOffer, setShowOffer] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [a, m] = await Promise.all([
        api.get('/devotion/altars', { params: { limit: 30 } }).then((r) => r.data),
        api.get('/devotion/me').then((r) => r.data).catch(() => null),
      ]);
      setAltars(a);
      setMine(m);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-violet-950/30 to-black text-white">
      <Navbar />

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <Flame size={14} className="text-amber-300" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-amber-300 font-bold">
              Devotion · Cult Mode
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter bg-gradient-to-r from-amber-200 via-fuchsia-200 to-violet-200 bg-clip-text text-transparent">
            Cada archetype tiene su altar.
          </h1>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto">
            Jugar un deck con un archetype acumula <span className="text-amber-300 font-bold">devotion points</span>.
            Más devotees + más puntos = altar de mayor tier.
          </p>
        </div>

        {/* My devotion */}
        {mine && mine.archetypes.length > 0 && (
          <div className="mb-8 rounded-2xl bg-gradient-to-br from-amber-700/20 via-slate-900 to-violet-900/20 ring-1 ring-amber-500/30 p-5">
            <div className="text-[10px] uppercase tracking-widest text-amber-300 font-bold mb-3 flex items-center gap-1.5">
              <Crown size={11} /> Tu devoción
            </div>
            <div className="flex flex-wrap gap-2">
              {mine.archetypes.slice(0, 6).map((a) => (
                <button
                  key={a.archetype}
                  onClick={() => { setSelected(a.archetype); setShowOffer(true); }}
                  className="group inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.05] hover:bg-amber-500/10 ring-1 ring-white/10 hover:ring-amber-500/40 transition"
                >
                  <span className="font-bold text-sm">{a.archetype}</span>
                  <span className="text-xs text-amber-300 font-mono">{a.devotion_points}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Altars grid */}
        {loading ? (
          <p className="text-center text-slate-400 py-10">Caminando entre altares…</p>
        ) : altars.length === 0 ? (
          <EmptyState
            icon={Flame}
            title="No hay altares aún"
            description="Cuando los jugadores reporten matches con archetypes definidos, aparecen acá."
            accent="amber"
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {altars.map((altar) => <AltarCard key={altar.archetype} altar={altar} onOffer={(arch) => { setSelected(arch); setShowOffer(true); }} />)}
          </div>
        )}
      </div>

      <AnimatePresence>
        {showOffer && selected && (
          <OfferModal archetype={selected} onClose={() => setShowOffer(false)} onDone={() => { setShowOffer(false); load(); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

function AltarCard({ altar, onOffer }) {
  const t = TIER_STYLE[altar.rank_tier] || TIER_STYLE.Shrine;
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={`rounded-2xl bg-gradient-to-br ${t.bg} ring-2 ${t.ring} p-5 relative overflow-hidden`}
    >
      <div className="absolute top-2 right-3 text-3xl opacity-30">{t.icon}</div>

      <div className={`text-[10px] uppercase tracking-widest font-bold ${t.text} mb-1`}>
        {altar.rank_tier}
      </div>
      <h3 className="text-xl font-black mb-1">{altar.archetype}</h3>

      <div className="grid grid-cols-2 gap-2 mt-3">
        <div>
          <div className="text-[9px] uppercase tracking-widest text-white/60 font-bold">Devotees</div>
          <div className="text-2xl font-black tabular-nums">{altar.devotee_count}</div>
        </div>
        <div>
          <div className="text-[9px] uppercase tracking-widest text-white/60 font-bold">Devoción</div>
          <div className="text-2xl font-black tabular-nums">{altar.total_devotion.toLocaleString('es-CL')}</div>
        </div>
      </div>

      {altar.top_devotee_alias && (
        <div className="mt-3 pt-3 border-t border-white/10">
          <div className="text-[9px] uppercase tracking-widest text-white/60 font-bold mb-0.5">High Priest</div>
          <Link
            to={`/players/${altar.top_devotee_player_id}`}
            className={`text-sm font-bold ${t.text} hover:underline`}
          >
            {altar.top_devotee_alias}
          </Link>
        </div>
      )}

      <button
        onClick={() => onOffer(altar.archetype)}
        className={`mt-4 w-full py-2 rounded-lg bg-black/40 hover:bg-black/60 ${t.text} text-xs font-bold uppercase tracking-widest inline-flex items-center justify-center gap-1.5 transition`}
      >
        <Zap size={12} /> Ofrendar EXP
      </button>

      {altar.total_offered_exp > 0 && (
        <div className="text-[10px] text-white/40 mt-2 text-center font-mono">
          {altar.total_offered_exp.toLocaleString('es-CL')} EXP ofrendados
        </div>
      )}
    </motion.div>
  );
}

function OfferModal({ archetype, onClose, onDone }) {
  const [exp, setExp] = useState(50);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    setSubmitting(true);
    try {
      await api.post('/devotion/offer', { archetype, exp: Number(exp) });
      toast.success(`Ofrenda hecha al altar de ${archetype}`);
      onDone();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Falló');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
        className="w-full max-w-md rounded-2xl bg-gradient-to-br from-amber-900/40 via-slate-900 to-violet-900/40 ring-2 ring-amber-500/40 p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black flex items-center gap-2">
            <Flame size={18} className="text-amber-300" /> Ofrenda
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white">
            <X size={18} />
          </button>
        </div>

        <p className="text-slate-300 mb-4 text-center">
          Vas a ofrendar EXP al altar de{' '}
          <span className="font-bold text-amber-200">{archetype}</span>
        </p>

        <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">
          Cantidad de EXP (las ofrendas valen 2× en devoción)
        </label>
        <input
          type="number" min={10} max={2000} step={10}
          value={exp} onChange={(e) => setExp(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/10 text-lg font-bold tabular-nums mb-4"
        />

        <div className="text-[10px] text-amber-200/80 bg-amber-500/10 ring-1 ring-amber-500/30 rounded p-2 mb-4">
          Se debita {exp} EXP de tu season activa. A cambio, +{exp * 2} devotion points
          en el altar de {archetype}.
        </div>

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold disabled:opacity-50 transition"
        >
          {submitting ? 'Ofreciendo…' : `Ofrendar ${exp} EXP`}
        </button>
      </motion.div>
    </motion.div>
  );
}
