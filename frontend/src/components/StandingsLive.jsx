/** Standings con FLIP animations. Framer Motion mueve las filas suavemente
 * cuando cambia el orden por nuevo resultado. */
import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Medal, TrendingUp, X } from 'lucide-react';
import clsx from 'clsx';

function rankIcon(rank) {
  if (rank === 1) return <Crown size={16} className="text-amber-400" />;
  if (rank === 2) return <Medal size={16} className="text-slate-300" />;
  if (rank === 3) return <Medal size={16} className="text-orange-400" />;
  return null;
}

function rowColor(rank) {
  if (rank === 1) return 'from-amber-500/15 to-transparent border-amber-500/30';
  if (rank === 2) return 'from-slate-300/10 to-transparent border-slate-300/20';
  if (rank === 3) return 'from-orange-500/10 to-transparent border-orange-500/20';
  if (rank <= 8) return 'from-violet-500/5 to-transparent border-violet-500/10';
  return 'border-white/5';
}

export default function StandingsLive({ rows, highlightPlayerId }) {
  if (!rows?.length) {
    return (
      <div className="text-center text-slate-500 py-8 text-sm">
        Aún no hay rondas reportadas.
      </div>
    );
  }
  return (
    <div className="space-y-1.5">
      <div className="grid grid-cols-[36px_1fr_60px_56px_56px] gap-2 px-3 text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
        <div>#</div>
        <div>Jugador</div>
        <div className="text-right">R</div>
        <div className="text-right">OMW%</div>
        <div className="text-right">MP</div>
      </div>
      <AnimatePresence>
        {rows.map((row) => (
          <motion.div
            key={row.player_id}
            layout
            layoutId={`row-${row.player_id}`}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: row.dropped ? 0.4 : 1, x: 0 }}
            exit={{ opacity: 0, x: 20 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className={clsx(
              'grid grid-cols-[36px_1fr_60px_56px_56px] gap-2 items-center px-3 py-2.5 rounded-lg',
              'bg-gradient-to-r border backdrop-blur-sm',
              rowColor(row.rank),
              highlightPlayerId === row.player_id && 'ring-2 ring-violet-400/60'
            )}
          >
            <div className="flex items-center gap-1.5 font-bold tabular-nums">
              {rankIcon(row.rank)}
              <span className={clsx(row.rank <= 3 ? 'text-white' : 'text-slate-300')}>
                {row.rank}
              </span>
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 font-semibold truncate">
                {row.alias}
                {row.dropped && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 flex items-center gap-0.5">
                    <X size={10} /> DROP
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-500 font-mono">{row.elite_id_code}</div>
            </div>
            <div className="text-right text-sm tabular-nums text-slate-300">
              {row.rounds_won}-{row.rounds_lost}
              {row.rounds_draw > 0 && <span className="text-slate-500">-{row.rounds_draw}</span>}
            </div>
            <div className="text-right text-sm tabular-nums text-slate-400">
              {(row.omw * 100).toFixed(0)}%
            </div>
            <div className="text-right tabular-nums font-bold text-violet-400 flex items-center justify-end gap-1">
              {row.match_points}
              {row.rank === 1 && <TrendingUp size={12} />}
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
