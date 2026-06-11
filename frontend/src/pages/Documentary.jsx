import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Film, Play, Pause, ChevronLeft, ChevronRight, ArrowLeft, RotateCw, Volume2,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import EmptyState from '../components/EmptyState';
import { api } from '../lib/api';

const SCENE_MS = 6500;

const ACCENT = {
  violet:  'from-violet-700 via-fuchsia-800 to-violet-950',
  amber:   'from-amber-500 via-orange-700 to-amber-950',
  rose:    'from-rose-600 via-fuchsia-700 to-rose-950',
  emerald: 'from-emerald-600 via-cyan-800 to-emerald-950',
  cyan:    'from-cyan-600 via-blue-800 to-cyan-950',
  fuchsia: 'from-fuchsia-600 via-violet-800 to-fuchsia-950',
};

export default function Documentary() {
  const { id } = useParams();
  const [doc, setDoc] = useState(null);
  const [error, setError] = useState(null);
  const [scene, setScene] = useState(0);
  const [playing, setPlaying] = useState(true);
  const timerRef = useRef(null);

  useEffect(() => {
    api.get(`/events/${id}/documentary`)
      .then((r) => setDoc(r.data))
      .catch((e) => setError(e?.response?.data?.detail || 'No se pudo cargar'));
  }, [id]);

  useEffect(() => {
    if (!playing || !doc) return;
    timerRef.current = setTimeout(() => {
      setScene((s) => {
        if (s >= doc.scenes.length - 1) {
          setPlaying(false);
          return s;
        }
        return s + 1;
      });
    }, SCENE_MS);
    return () => clearTimeout(timerRef.current);
  }, [playing, scene, doc]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <EmptyState icon={Film} title="No disponible" description={error} accent="violet" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Navbar />
        <div className="max-w-4xl mx-auto px-6 py-20 text-center text-slate-400">
          Editando el documental…
        </div>
      </div>
    );
  }

  const current = doc.scenes[scene];
  const accent = ACCENT[current.accent] || ACCENT.violet;
  const isLast = scene === doc.scenes.length - 1;

  return (
    <div className="min-h-screen bg-black text-white">
      <Navbar />

      <div className="max-w-5xl mx-auto px-4 py-4 sm:py-6">
        <Link to={`/events/${id}`} className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-3">
          <ArrowLeft size={12} /> Volver al evento
        </Link>

        {/* Progress bar */}
        <div className="flex gap-1.5 mb-3">
          {doc.scenes.map((_, i) => (
            <button
              key={i}
              onClick={() => setScene(i)}
              className={`flex-1 h-1 rounded-full transition-all ${
                i === scene ? 'bg-white' : i < scene ? 'bg-white/60' : 'bg-white/10'
              }`}
            />
          ))}
        </div>

        {/* Scene */}
        <div className="relative" style={{ aspectRatio: '16/9', maxHeight: '70vh' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={scene}
              initial={{ opacity: 0, scale: 1.05 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.6 }}
              className={`absolute inset-0 rounded-2xl bg-gradient-to-br ${accent} overflow-hidden flex flex-col justify-between p-8 sm:p-12 shadow-2xl`}
            >
              {/* Vignette + grain */}
              <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,transparent_0%,rgba(0,0,0,0.6)_100%)] pointer-events-none" />
              <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-white/10 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-32 -left-32 w-96 h-96 rounded-full bg-black/40 blur-3xl pointer-events-none" />

              {/* Top brand */}
              <div className="relative flex items-center gap-2 opacity-80">
                <Film size={14} />
                <span className="text-[10px] uppercase tracking-[0.5em] font-bold">
                  {doc.event_name}
                </span>
              </div>

              {/* Body — title + subtitle + narration */}
              <div className="relative">
                <motion.h2
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.2 }}
                  className="text-4xl sm:text-7xl font-black tracking-tighter leading-[0.95] mb-3 drop-shadow-2xl"
                >
                  {current.title}
                </motion.h2>
                {current.subtitle && (
                  <motion.div
                    initial={{ y: 20, opacity: 0 }}
                    animate={{ y: 0, opacity: 1 }}
                    transition={{ delay: 0.4 }}
                    className="text-lg sm:text-xl opacity-80 mb-5 max-w-2xl"
                  >
                    {current.subtitle}
                  </motion.div>
                )}
                <motion.div
                  initial={{ y: 10, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.6 }}
                  className="flex items-start gap-3 max-w-2xl"
                >
                  <Volume2 size={16} className="mt-1 opacity-70 shrink-0" />
                  <p className="text-base sm:text-lg italic opacity-95 leading-snug">
                    "{current.narration}"
                  </p>
                </motion.div>
              </div>

              {/* Bottom: stats si hay */}
              <div className="relative flex items-end justify-between text-xs opacity-70">
                <span className="uppercase tracking-widest font-bold">{current.kind}</span>
                <span>{scene + 1} / {doc.scenes.length}</span>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="mt-4 flex items-center justify-between gap-3">
          <button
            onClick={() => { setScene(Math.max(0, scene - 1)); setPlaying(false); }}
            disabled={scene === 0}
            className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/10 disabled:opacity-30 transition"
          >
            <ChevronLeft size={16} />
          </button>

          {isLast ? (
            <button
              onClick={() => { setScene(0); setPlaying(true); }}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-bold text-sm inline-flex items-center gap-2"
            >
              <RotateCw size={14} /> Ver de nuevo
            </button>
          ) : (
            <button
              onClick={() => setPlaying((p) => !p)}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-bold text-sm inline-flex items-center gap-2"
            >
              {playing ? <><Pause size={14} /> Pausa</> : <><Play size={14} /> Reproducir</>}
            </button>
          )}

          <button
            onClick={() => { setScene(Math.min(doc.scenes.length - 1, scene + 1)); setPlaying(false); }}
            disabled={scene >= doc.scenes.length - 1}
            className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/10 disabled:opacity-30 transition"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <p className="text-center text-[10px] text-slate-500 mt-4 uppercase tracking-widest">
          Generado por IA · narración Claude · {doc.players} jugadores · {doc.total_matches} matches
        </p>
      </div>
    </div>
  );
}
