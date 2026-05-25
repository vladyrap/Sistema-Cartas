import { motion } from 'framer-motion';
import { progressToNext, RANK_COLORS, rankFromLevel } from '../lib/progression';

export default function ExpBar({ level, expInLevel }) {
  const progress = progressToNext(level, expInLevel);
  const rank = rankFromLevel(level);
  const nextRank = progress.nextLevel ? rankFromLevel(progress.nextLevel) : null;
  const colors = RANK_COLORS[rank];

  return (
    <div className="w-full">
      <div className="flex items-baseline justify-between mb-2">
        <span className="font-mono text-sm text-white/70">
          Nivel <span className={`font-bold ${colors.text}`}>{level}</span>
        </span>
        <span className="font-mono text-xs text-white/50">
          {progress.required != null
            ? `${expInLevel.toLocaleString()} / ${progress.required.toLocaleString()} EXP`
            : 'MAX'}
        </span>
      </div>
      <div className="relative h-2 rounded-full bg-bg-elevated overflow-hidden border border-white/5">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${progress.percent}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-elite-violet via-elite-blue to-elite-magenta"
        />
      </div>
      {progress.nextLevel && (
        <p className="text-[10px] text-white/40 mt-1.5">
          Faltan <span className="text-white/70 font-mono">{progress.remaining}</span> EXP para alcanzar nivel {progress.nextLevel} ({RANK_COLORS[nextRank].label})
        </p>
      )}
    </div>
  );
}
