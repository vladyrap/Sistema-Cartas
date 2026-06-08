/** Replay system: timeline scrubable que reproduce el torneo round-by-round.
 * Backend devuelve snapshots por ronda; el frontend interpola estados. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, SkipBack, SkipForward, FastForward } from 'lucide-react';

import { api } from '../lib/api';

export default function EventReplay() {
  const { id } = useParams();
  const eventId = Number(id);
  const [replay, setReplay] = useState(null);
  const [round, setRound] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(2.5); // seconds per round
  const timerRef = useRef(null);

  useEffect(() => {
    api.get(`/ai/events/${eventId}/replay`).then(r => {
      setReplay(r.data);
      setRound(r.data.snapshots?.[0]?.round_number || 1);
    });
  }, [eventId]);

  useEffect(() => {
    if (!playing || !replay) return;
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      setRound(r => {
        const max = replay.snapshots[replay.snapshots.length - 1]?.round_number || 1;
        if (r >= max) { setPlaying(false); return r; }
        return r + 1;
      });
    }, speed * 1000);
    return () => clearTimeout(timerRef.current);
  }, [round, playing, replay, speed]);

  const snapshot = useMemo(() => replay?.snapshots.find(s => s.round_number === round), [replay, round]);
  const maxRound = replay?.snapshots[replay.snapshots.length - 1]?.round_number || 1;

  if (!replay) return <div className="min-h-screen flex items-center justify-center text-slate-400 bg-slate-950">Cargando replay…</div>;
  if (!replay.snapshots?.length) return <div className="min-h-screen flex items-center justify-center text-slate-400 bg-slate-950">El evento aún no tiene rondas completadas.</div>;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950/30 text-white">
      <div className="max-w-5xl mx-auto px-6 py-8">
        <div className="text-center mb-6">
          <div className="text-[10px] uppercase tracking-widest text-violet-300 font-bold mb-1">
            Replay · Ronda {round} de {maxRound}
          </div>
          <h1 className="text-3xl font-black bg-gradient-to-r from-white via-violet-100 to-violet-300 bg-clip-text text-transparent">
            {replay.event_name}
          </h1>
        </div>

        {/* Standings snapshot */}
        <AnimatePresence mode="wait">
          <motion.div
            key={round}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.45 }}
            className="space-y-2"
          >
            {snapshot?.standings.map(s => (
              <motion.div
                key={s.player_id}
                layout
                layoutId={`replay-${s.player_id}`}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl border backdrop-blur ${
                  s.rank === 1 ? 'bg-amber-500/15 border-amber-400/40'
                  : s.rank === 2 ? 'bg-slate-300/10 border-slate-300/20'
                  : s.rank === 3 ? 'bg-orange-500/10 border-orange-400/20'
                  : 'bg-white/5 border-white/10'
                }`}
              >
                <div className="w-8 text-center font-black tabular-nums">{s.rank}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{s.alias}</div>
                  <div className="text-[10px] text-slate-500 font-mono">{s.elite_id_code}</div>
                </div>
                <div className="text-right text-xs text-slate-400 font-mono">
                  {s.rounds_won}-{s.rounds_lost}{s.rounds_draw > 0 && `-${s.rounds_draw}`}
                </div>
                <div className="text-right">
                  <div className="text-lg font-bold tabular-nums text-violet-300">{s.match_points}</div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        </AnimatePresence>

        {/* Player controls */}
        <div className="fixed bottom-6 inset-x-0 px-6 flex justify-center pointer-events-none">
          <div className="pointer-events-auto flex items-center gap-3 bg-slate-900/90 backdrop-blur-xl border border-violet-500/30 rounded-2xl px-4 py-3 shadow-2xl shadow-violet-500/20">
            <button onClick={() => setRound(replay.snapshots[0].round_number)} className="p-2 hover:bg-white/10 rounded-lg">
              <SkipBack size={16} />
            </button>
            <button onClick={() => setPlaying(p => !p)} className="p-2.5 bg-violet-500/30 hover:bg-violet-500/50 rounded-lg">
              {playing ? <Pause size={18} /> : <Play size={18} />}
            </button>
            <button onClick={() => setRound(r => Math.min(maxRound, r + 1))} className="p-2 hover:bg-white/10 rounded-lg">
              <SkipForward size={16} />
            </button>
            <div className="w-px h-7 bg-white/10 mx-1" />
            <input
              type="range"
              min={replay.snapshots[0].round_number}
              max={maxRound}
              value={round}
              onChange={e => setRound(Number(e.target.value))}
              className="w-48 accent-violet-400"
            />
            <div className="text-xs tabular-nums font-mono text-violet-300 w-10 text-center">R{round}</div>
            <div className="w-px h-7 bg-white/10 mx-1" />
            <button onClick={() => setSpeed(s => Math.max(0.5, s - 0.5))} className="p-1 hover:bg-white/10 rounded text-xs">
              <FastForward size={12} className="rotate-180" />
            </button>
            <div className="text-[10px] text-slate-400 w-10 text-center">{speed}s</div>
            <button onClick={() => setSpeed(s => Math.min(8, s + 0.5))} className="p-1 hover:bg-white/10 rounded text-xs">
              <FastForward size={12} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
