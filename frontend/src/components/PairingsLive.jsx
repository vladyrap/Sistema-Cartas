/** Pairings de la ronda actual con animación de entrada y badge por estado. */
import { motion } from 'framer-motion';
import { Swords, CheckCircle2, Clock, Coffee } from 'lucide-react';
import clsx from 'clsx';

function MatchCard({ p, idx }) {
  const settled = p.winner_id !== null || p.is_draw;
  const winA = p.winner_id === p.player_a_id;
  const winB = p.winner_id === p.player_b_id;
  const isBye = p.is_bye;
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04, duration: 0.3 }}
      className={clsx(
        'rounded-xl border bg-gradient-to-br p-3 backdrop-blur-sm',
        isBye
          ? 'from-amber-500/10 to-amber-700/5 border-amber-500/30'
          : settled
          ? 'from-emerald-500/8 to-transparent border-emerald-500/25'
          : 'from-slate-700/30 to-slate-800/20 border-white/10'
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="text-[10px] uppercase tracking-wider font-semibold text-slate-400 flex items-center gap-1.5">
          {isBye ? <Coffee size={11} /> : settled ? <CheckCircle2 size={11} className="text-emerald-400" /> : <Clock size={11} className="text-amber-400" />}
          Mesa {p.table_number ?? '—'}
        </div>
        {!isBye && (
          <Swords size={12} className={clsx('opacity-50', settled && 'text-emerald-400 opacity-80')} />
        )}
      </div>
      <div className="space-y-1">
        <div className={clsx(
          'flex items-center justify-between px-2 py-1.5 rounded',
          winA && 'bg-emerald-500/15 text-emerald-100 font-semibold',
          !winA && settled && !p.is_draw && 'opacity-50'
        )}>
          <span className="truncate">{p.player_a_alias}</span>
          {settled && <span className="font-bold tabular-nums text-sm ml-2">{p.games_a}</span>}
        </div>
        {!isBye && (
          <div className={clsx(
            'flex items-center justify-between px-2 py-1.5 rounded',
            winB && 'bg-emerald-500/15 text-emerald-100 font-semibold',
            !winB && settled && !p.is_draw && 'opacity-50'
          )}>
            <span className="truncate">{p.player_b_alias}</span>
            {settled && <span className="font-bold tabular-nums text-sm ml-2">{p.games_b}</span>}
          </div>
        )}
        {isBye && (
          <div className="text-center text-amber-400/80 text-xs italic py-1">— BYE —</div>
        )}
        {p.is_draw && (
          <div className="text-center text-slate-400 text-xs py-1">— Empate —</div>
        )}
      </div>
    </motion.div>
  );
}

export default function PairingsLive({ pairings }) {
  if (!pairings?.length) {
    return (
      <div className="text-center text-slate-500 py-8 text-sm">
        Esperando inicio de ronda…
      </div>
    );
  }
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {pairings.map((p, i) => <MatchCard key={p.match_id} p={p} idx={i} />)}
    </div>
  );
}
