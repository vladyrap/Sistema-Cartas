import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Flame, Sparkles, Share2, Copy, RotateCw, Swords,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import { api } from '../lib/api';

export default function CardDrama() {
  const [a, setA] = useState('Lightning Bolt');
  const [b, setB] = useState('Counterspell');
  const [drama, setDrama] = useState(null);
  const [loading, setLoading] = useState(false);
  const debounceA = useRef();
  const debounceB = useRef();
  const [suggA, setSuggA] = useState([]);
  const [suggB, setSuggB] = useState([]);

  const suggest = (q, set) => {
    if (q.trim().length < 2) { set([]); return; }
    api.get('/scanner/suggest', { params: { q } })
      .then((r) => set(r.data.suggestions || []))
      .catch(() => set([]));
  };

  useEffect(() => {
    clearTimeout(debounceA.current);
    debounceA.current = setTimeout(() => suggest(a, setSuggA), 250);
  }, [a]);

  useEffect(() => {
    clearTimeout(debounceB.current);
    debounceB.current = setTimeout(() => suggest(b, setSuggB), 250);
  }, [b]);

  const generate = async () => {
    if (!a.trim() || !b.trim()) return;
    setLoading(true);
    setDrama(null);
    try {
      const { data } = await api.get('/card-drama/', { params: { card_a: a, card_b: b } });
      setDrama(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Falló');
    } finally {
      setLoading(false);
    }
  };

  const copy = () => {
    if (!drama?.drama) return;
    const text = `${drama.card_a} × ${drama.card_b}\n\n${drama.drama}\n\n— EliteCards`;
    navigator.clipboard?.writeText(text);
    toast.success('Drama copiado al portapapeles');
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-rose-950/20 to-violet-950/20 text-white">
      <Navbar />

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <Flame size={14} className="text-rose-300" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-rose-300 font-bold">
              Card Drama · Microfic
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter">
            Dos cartas. Una historia.
          </h1>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto">
            La IA escribe un microfic dramático entre dos cartas como si fueran personajes.
          </p>
        </div>

        {/* Selector */}
        <div className="grid sm:grid-cols-2 gap-3 mb-4">
          <CardPicker label="Carta A" value={a} onChange={setA} suggestions={suggA} onPick={(s) => { setA(s); setSuggA([]); }} accent="rose" />
          <CardPicker label="Carta B" value={b} onChange={setB} suggestions={suggB} onPick={(s) => { setB(s); setSuggB([]); }} accent="violet" />
        </div>

        <button
          onClick={generate}
          disabled={loading || !a.trim() || !b.trim()}
          className="w-full mb-8 py-3 rounded-xl bg-gradient-to-r from-rose-500 via-fuchsia-500 to-violet-500 text-white font-black uppercase tracking-widest hover:shadow-2xl hover:shadow-rose-500/30 transition disabled:opacity-50 inline-flex items-center justify-center gap-2"
        >
          {loading ? <><RotateCw size={16} className="animate-spin" /> Escribiendo…</> : <><Sparkles size={16} /> Generar drama</>}
        </button>

        <AnimatePresence>
          {drama && (
            <motion.div
              key={drama.drama}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="relative rounded-3xl bg-gradient-to-br from-rose-900/40 via-slate-900 to-violet-900/40 ring-1 ring-rose-500/30 p-8 sm:p-10 overflow-hidden"
            >
              <div className="absolute top-3 left-4 text-rose-400/20 font-black text-9xl pointer-events-none leading-none select-none">
                "
              </div>

              <div className="relative">
                <div className="flex flex-wrap items-center justify-center gap-3 mb-6">
                  <div className="px-3 py-1.5 rounded-lg bg-rose-500/20 ring-1 ring-rose-500/40 font-bold">
                    {drama.card_a}
                  </div>
                  <Swords size={20} className="text-rose-300" />
                  <div className="px-3 py-1.5 rounded-lg bg-violet-500/20 ring-1 ring-violet-500/40 font-bold">
                    {drama.card_b}
                  </div>
                </div>

                <p className="text-base sm:text-lg leading-relaxed text-slate-100 whitespace-pre-wrap italic">
                  {drama.drama}
                </p>

                {drama.is_mock && (
                  <p className="mt-4 text-[10px] uppercase tracking-widest text-amber-300/70 font-bold text-center">
                    ⚠ Modo mock — configurá ANTHROPIC_API_KEY para drama real
                  </p>
                )}
                {drama.cached && !drama.is_mock && (
                  <p className="mt-4 text-[10px] uppercase tracking-widest text-emerald-300/70 font-bold text-center">
                    Cacheado · esta misma combinación ya tiene su drama escrito
                  </p>
                )}

                <div className="flex justify-center gap-2 mt-6">
                  <button
                    onClick={copy}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/10 text-white text-xs font-bold transition"
                  >
                    <Copy size={12} /> Copiar
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function CardPicker({ label, value, onChange, suggestions, onPick, accent }) {
  const ring = accent === 'rose' ? 'focus:ring-rose-500/50' : 'focus:ring-violet-500/50';
  return (
    <div className="relative">
      <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1.5">
        {label}
      </label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full px-4 py-3 rounded-xl bg-white/[0.05] border border-white/10 text-white focus:outline-none focus:ring-2 ${ring}`}
      />
      {suggestions.length > 0 && (
        <ul className="absolute z-10 left-0 right-0 mt-1 rounded-xl bg-bg-surface/95 backdrop-blur-xl border border-bg-border shadow-2xl overflow-hidden max-h-40 overflow-y-auto">
          {suggestions.slice(0, 6).map((s) => (
            <li key={s}>
              <button
                onClick={() => onPick(s)}
                className="w-full text-left px-4 py-1.5 text-sm hover:bg-white/10"
              >
                {s}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
