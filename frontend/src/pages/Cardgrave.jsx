import { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Skull, Eye, Search, Sparkles, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import EmptyState from '../components/EmptyState';
import { api } from '../lib/api';

export default function Cardgrave() {
  const [graves, setGraves] = useState(null);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    api.get('/cardgrave', { params: { limit: 200 } })
      .then((r) => setGraves(r.data))
      .catch(() => toast.error('No se pudo cargar el cementerio'));
  }, []);

  const filtered = useMemo(() => {
    if (!graves) return [];
    const q = query.trim().toLowerCase();
    if (!q) return graves;
    return graves.filter((g) =>
      g.card_name.toLowerCase().includes(q) ||
      (g.epitaph || '').toLowerCase().includes(q),
    );
  }, [graves, query]);

  const visit = (grave) => {
    setSelected(grave);
    api.post(`/cardgrave/${encodeURIComponent(grave.card_name)}/visit`).catch(() => {});
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-white">
      <Navbar />

      {/* Fog */}
      <div className="absolute inset-x-0 top-14 h-96 bg-gradient-to-b from-violet-900/20 via-slate-900/40 to-transparent pointer-events-none" />

      <div className="relative max-w-6xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <Skull size={14} className="text-violet-300" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-violet-300 font-bold">
              Cardgrave · Memorial
            </span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tighter bg-gradient-to-r from-slate-200 via-violet-200 to-slate-400 bg-clip-text text-transparent">
            Aquí descansan los caídos.
          </h1>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto">
            Cementerio de cartas baneadas. Cada lápida cuenta su historia.
            {graves && <> · <span className="text-violet-300 font-mono">{graves.length} almas</span></>}
          </p>
        </div>

        {/* Search */}
        <div className="relative max-w-xl mx-auto mb-10">
          <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar por nombre o epitafio…"
            className="w-full pl-11 pr-4 py-3 rounded-xl bg-white/[0.04] border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50"
          />
        </div>

        {!graves ? (
          <p className="text-center text-slate-400">Caminando entre las lápidas…</p>
        ) : graves.length === 0 ? (
          <EmptyState
            icon={Skull}
            title="Cementerio vacío"
            description="No hay cartas enterradas todavía. Un admin puede inicializarlo via POST /api/cardgrave/seed."
            accent="violet"
          />
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
            {filtered.map((g, i) => (
              <Tombstone key={g.id} grave={g} index={i} onClick={() => visit(g)} />
            ))}
          </div>
        )}
      </div>

      {/* Modal de visita */}
      <AnimatePresence>
        {selected && <GraveModal grave={selected} onClose={() => setSelected(null)} />}
      </AnimatePresence>
    </div>
  );
}

function Tombstone({ grave, index, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.015, 0.4) }}
      whileHover={{ y: -3, scale: 1.02 }}
      className="group relative rounded-t-3xl rounded-b-xl bg-gradient-to-b from-slate-700 via-slate-800 to-slate-900 ring-1 ring-slate-600/40 hover:ring-violet-400/40 p-3 sm:p-4 text-center overflow-hidden transition-all"
      style={{ aspectRatio: '3/5' }}
    >
      {/* Cross */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 w-px h-6 bg-slate-500/60" />
      <div className="absolute top-3.5 left-1/2 -translate-x-1/2 w-4 h-px bg-slate-500/60" />

      {/* RIP */}
      <div className="mt-7 text-[9px] uppercase tracking-[0.4em] text-slate-500 font-bold">
        R.I.P.
      </div>

      {/* Name */}
      <h3 className="mt-2 text-sm font-black text-slate-200 leading-tight line-clamp-3 group-hover:text-violet-200 transition">
        {grave.card_name}
      </h3>

      {/* Year */}
      {grave.buried_year && (
        <div className="absolute bottom-3 left-0 right-0 text-[9px] text-slate-600 font-mono">
          {grave.buried_year}
        </div>
      )}

      {/* Visits */}
      {grave.visit_count > 0 && (
        <div className="absolute top-2 right-2 text-[9px] text-slate-500 font-mono inline-flex items-center gap-0.5">
          <Eye size={9} /> {grave.visit_count}
        </div>
      )}
    </motion.button>
  );
}

function GraveModal({ grave, onClose }) {
  const ref = useRef();
  useEffect(() => {
    const onKey = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        ref={ref}
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 30 }}
        className="relative w-full max-w-md rounded-t-[3rem] rounded-b-2xl bg-gradient-to-b from-slate-700 via-slate-800 to-slate-950 ring-2 ring-violet-500/30 p-8 text-center"
      >
        <button onClick={onClose} className="absolute top-3 left-3 text-slate-500 hover:text-white">
          <ArrowLeft size={18} />
        </button>

        {/* Cross */}
        <div className="absolute top-4 left-1/2 -translate-x-1/2 w-px h-10 bg-slate-500/60" />
        <div className="absolute top-7 left-1/2 -translate-x-1/2 w-8 h-px bg-slate-500/60" />

        <div className="mt-12 text-[10px] uppercase tracking-[0.4em] text-slate-500 font-bold">
          R.I.P.
        </div>

        <h2 className="mt-3 text-3xl font-black text-slate-100 leading-tight px-2">
          {grave.card_name}
        </h2>

        {grave.buried_year && (
          <p className="text-xs text-slate-500 font-mono mt-1">
            † {grave.buried_year}
          </p>
        )}

        {grave.game_name && (
          <p className="text-[10px] uppercase tracking-widest text-violet-300 font-bold mt-2">
            {grave.game_name}
          </p>
        )}

        <div className="my-6 mx-auto w-12 h-px bg-slate-600" />

        <p className="italic text-slate-300 text-base leading-relaxed px-2">
          "{grave.epitaph}"
        </p>

        {grave.rationale && (
          <div className="mt-6 px-3 py-2 rounded-lg bg-black/30 ring-1 ring-white/5">
            <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold mb-1">
              Razón del baneo
            </div>
            <p className="text-xs text-slate-400">{grave.rationale}</p>
          </div>
        )}

        <div className="mt-6 inline-flex items-center gap-1.5 text-[10px] text-slate-500">
          <Eye size={10} /> {grave.visit_count + 1} visitas
        </div>
      </motion.div>
    </motion.div>
  );
}
