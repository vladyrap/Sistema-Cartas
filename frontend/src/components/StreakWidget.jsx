import { useEffect, useState } from 'react';
import { Flame, TrendingUp } from 'lucide-react';
import { api } from '../lib/api';
import { useGuild } from '../lib/useGuild';

export default function StreakWidget() {
  const { current } = useGuild();
  const [streak, setStreak] = useState(null);

  useEffect(() => {
    if (!current) { setStreak(null); return; }
    api.get('/streaks/me')
      .then((r) => setStreak(r.data))
      .catch(() => setStreak(null));
  }, [current?.guild?.id]);

  if (!streak || !current) return null;

  const has = streak.current_streak > 0;
  const intensity = Math.min(1, streak.current_streak / 11); // 0..1 cap at 11
  const flameSize = 14 + Math.round(intensity * 6);

  return (
    <div className={`p-4 rounded-2xl border ${has ? 'bg-amber-500/5 border-amber-500/30' : 'bg-bg-surface border-bg-border'}`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Flame size={flameSize} className={has ? 'text-amber-400' : 'text-white/30'} />
          <p className="text-[10px] tracking-widest uppercase text-white/40">Racha</p>
        </div>
        {streak.exp_multiplier > 1 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 font-mono">
            ×{streak.exp_multiplier.toFixed(2)}
          </span>
        )}
      </div>
      <p className="font-display text-3xl font-bold">{streak.current_streak}</p>
      <p className="text-xs text-white/50 mt-1">
        {has ? 'jornadas seguidas' : 'sin racha activa'}
      </p>
      {streak.longest_streak > streak.current_streak && (
        <p className="text-[10px] text-white/30 mt-2">
          Mejor: <span className="font-mono text-white/50">{streak.longest_streak}</span>
        </p>
      )}
      {streak.next_milestone && (
        <p className="text-[10px] text-amber-200/70 mt-2 flex items-center gap-1">
          <TrendingUp size={10} /> Próximo hito: {streak.next_milestone} jornadas
        </p>
      )}
    </div>
  );
}
