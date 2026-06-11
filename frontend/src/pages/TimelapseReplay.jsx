import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { Play, Pause, RotateCw, Film, ArrowLeft, ChevronLeft, ChevronRight } from 'lucide-react';
import Navbar from '../components/Navbar';
import EmptyState from '../components/EmptyState';
import { api } from '../lib/api';

const FRAME_MS = 2200;

export default function TimelapseReplay() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState(1);
  const timerRef = useRef(null);

  useEffect(() => {
    api.get(`/events/${id}/timelapse`)
      .then((r) => setData(r.data))
      .catch((e) => setError(e?.response?.data?.detail || 'No se pudo cargar'));
  }, [id]);

  const snapshots = data?.snapshots || [];

  useEffect(() => {
    if (!playing || snapshots.length === 0) return;
    timerRef.current = setTimeout(() => {
      setFrame((f) => {
        if (f >= snapshots.length - 1) {
          setPlaying(false);
          return f;
        }
        return f + 1;
      });
    }, FRAME_MS / speed);
    return () => clearTimeout(timerRef.current);
  }, [playing, frame, snapshots.length, speed]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <EmptyState icon={Film} title="No disponible" description={error} accent="violet" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="max-w-4xl mx-auto px-6 py-20 text-center text-slate-400">Cargando time-lapse…</div>
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <EmptyState icon={Film} title="Sin matches todavía" description="El evento aún no tiene rondas reportadas." accent="violet" />
      </div>
    );
  }

  const current = snapshots[frame];
  const topRows = current.standings.slice(0, 12);
  const progress = ((frame + 1) / snapshots.length) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-violet-950/20 to-slate-950 text-white">
      <Navbar />

      <div className="max-w-4xl mx-auto px-6 py-8">
        <Link to={`/events/${id}`} className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-4">
          <ArrowLeft size={12} /> Volver al evento
        </Link>

        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-2">
            <Film size={14} className="text-violet-300" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-violet-300 font-bold">
              Time-Lapse · {data.event_name}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tighter">
            La temporada en 30 segundos.
          </h1>
        </div>

        {/* Progress bar */}
        <div className="mb-3 h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-violet-500 via-fuchsia-400 to-amber-300"
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
        <div className="flex justify-between text-[10px] font-mono text-slate-500 mb-6">
          <span>Ronda {current.round_number} / {data.total_rounds}</span>
          <span>{frame + 1} / {snapshots.length}</span>
        </div>

        {/* Standings list — con animaciones de reordenamiento */}
        <div className="rounded-2xl bg-black/30 ring-1 ring-white/5 p-4 sm:p-5 min-h-[420px]">
          <LayoutGroup>
            <ul className="space-y-1.5">
              {topRows.map((s) => (
                <motion.li
                  layoutId={`${s.player_id}`}
                  key={s.player_id}
                  layout
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ type: 'spring', stiffness: 220, damping: 28 }}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                    s.rank === 1 ? 'bg-gradient-to-r from-amber-500/20 via-amber-500/10 to-transparent ring-1 ring-amber-500/40' :
                    s.rank <= 3 ? 'bg-white/[0.04] ring-1 ring-white/10' :
                    'hover:bg-white/[0.02]'
                  }`}
                >
                  <div className={`text-2xl font-black tabular-nums w-10 text-center ${
                    s.rank === 1 ? 'text-amber-300' :
                    s.rank === 2 ? 'text-slate-300' :
                    s.rank === 3 ? 'text-orange-400' :
                    'text-slate-500'
                  }`}>
                    {s.rank}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-white text-sm sm:text-base truncate">{s.alias}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-lg font-black tabular-nums">{s.match_points}</div>
                    <div className="text-[9px] uppercase tracking-widest text-slate-500 font-bold">MP</div>
                  </div>
                </motion.li>
              ))}
            </ul>
          </LayoutGroup>
        </div>

        {/* Controls */}
        <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setFrame(Math.max(0, frame - 1)); setPlaying(false); }}
              disabled={frame === 0}
              className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/10 disabled:opacity-30 transition"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => {
                if (frame >= snapshots.length - 1) setFrame(0);
                setPlaying((p) => !p);
              }}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-bold text-sm inline-flex items-center gap-2"
            >
              {playing ? <><Pause size={14} /> Pausa</> : frame >= snapshots.length - 1 ? <><RotateCw size={14} /> Reiniciar</> : <><Play size={14} /> Reproducir</>}
            </button>
            <button
              onClick={() => { setFrame(Math.min(snapshots.length - 1, frame + 1)); setPlaying(false); }}
              disabled={frame >= snapshots.length - 1}
              className="p-2 rounded-lg bg-white/[0.05] hover:bg-white/10 disabled:opacity-30 transition"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          <div className="inline-flex rounded-lg bg-white/[0.05] border border-white/10 p-0.5 text-xs font-bold">
            {[0.5, 1, 2, 4].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`px-3 py-1.5 rounded transition ${
                  speed === s ? 'bg-violet-500/30 text-violet-100' : 'text-white/50 hover:text-white'
                }`}
              >
                {s}×
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
