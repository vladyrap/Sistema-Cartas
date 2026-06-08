/** Barra de reactions con emojis rápidos + contador de peers. */
import { motion } from 'framer-motion';
import { Users } from 'lucide-react';

const EMOJIS = ['🔥', '✨', '😱', '👏', '💀', '🎉', '🏆', '⚡'];

export default function ReactionBar({ peersCount, onReact }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="fixed bottom-6 right-6 z-[90] flex items-center gap-2 bg-slate-900/80 backdrop-blur-md border border-violet-500/30 rounded-2xl p-2 shadow-2xl shadow-violet-500/20"
    >
      <div className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/15 border border-emerald-500/30">
        <Users size={11} className="text-emerald-300" />
        <span className="text-xs font-bold text-emerald-200 tabular-nums">{peersCount + 1}</span>
        <span className="text-[9px] text-emerald-300/80 uppercase tracking-wider">live</span>
      </div>
      <div className="w-px h-6 bg-white/10" />
      {EMOJIS.map(e => (
        <button
          key={e}
          onClick={() => onReact(e)}
          className="text-2xl w-9 h-9 rounded-lg hover:bg-white/10 transition active:scale-90"
          title={`Reaccionar con ${e}`}
        >
          {e}
        </button>
      ))}
    </motion.div>
  );
}
