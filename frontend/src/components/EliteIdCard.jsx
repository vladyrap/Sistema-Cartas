import { motion } from 'framer-motion';
import { QrCode, Sparkles, User } from 'lucide-react';
import { RANK_COLORS } from '../lib/progression';

export default function EliteIdCard({ player }) {
  const rank = player?.current_rank || 'INICIADO';
  const colors = RANK_COLORS[rank];
  const avatar = player?.avatar_url;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, rotateY: -8 }}
      animate={{ opacity: 1, y: 0, rotateY: 0 }}
      transition={{ duration: 0.7, ease: [0.16, 1, 0.3, 1] }}
      whileHover={{ y: -4, rotateY: 4 }}
      className={`relative w-72 aspect-[5/7] rounded-2xl overflow-hidden border ${colors.border} bg-gradient-to-br from-bg-elevated via-bg-surface to-black shadow-2xl shadow-elite-violet/10`}
      style={{ perspective: 1000 }}
    >
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_0%,rgba(124,92,255,0.18),transparent_60%)] pointer-events-none" />
      <div className="absolute -inset-px rounded-2xl bg-gradient-to-br from-elite-violet/30 via-transparent to-elite-blue/20 opacity-60 pointer-events-none" />

      <div className="relative p-5 flex flex-col h-full">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[10px] tracking-[0.3em] uppercase text-white/40 font-display">Elite ID</p>
            <p className="font-mono text-xs text-white/70 mt-1">{player?.elite_id_code || 'EC-2026-000000'}</p>
          </div>
          <Sparkles size={16} className="text-elite-gold" />
        </div>

        <div className="flex flex-col items-center my-4 flex-grow justify-center">
          <div className={`relative w-24 h-24 rounded-full overflow-hidden border-2 ${colors.border} bg-bg-elevated`}>
            {avatar ? (
              <img src={avatar} alt={player?.alias || ''} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/30">
                <User size={36} />
              </div>
            )}
            <div className={`absolute -inset-0.5 rounded-full bg-gradient-to-br from-elite-violet/40 via-transparent to-elite-blue/40 -z-10 blur-sm`} />
          </div>
        </div>

        <div className="mt-auto">
          <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-semibold ${colors.bg} ${colors.text} ${colors.border} border`}>
            {colors.label} · Nivel {player?.level || 1}
          </div>
          <h3 className="font-display text-2xl font-bold mt-3 truncate">{player?.alias || 'Player'}</h3>
          <p className="text-xs text-white/50 mt-0.5">{player?.player_class || 'DUELISTA'}</p>

          <div className="flex items-end justify-between mt-5 pt-4 border-t border-white/10">
            <div>
              <p className="text-[9px] tracking-widest uppercase text-white/40">Prestigio</p>
              <p className="font-mono text-lg font-semibold text-elite-gold">{player?.prestige || 0}</p>
            </div>
            <div className="w-10 h-10 rounded-md bg-white/5 border border-white/10 flex items-center justify-center">
              <QrCode size={20} className="text-white/60" />
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
