import { motion, AnimatePresence } from 'framer-motion';
import { Crown, Sparkles, X, ArrowUp, Lock, Check } from 'lucide-react';
import { RANK_COLORS, BENEFITS_BY_LEVEL } from '../lib/progression';

export default function LevelUpModal({ open, info, onClose }) {
  if (!info) return null;
  const { fromLevel, toLevel, newRank, newBenefits = [] } = info;
  const colors = RANK_COLORS[newRank];
  const rankChanged = fromLevel < 30 && newRank && RANK_COLORS[colors.label?.toUpperCase?.()];

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          onClick={onClose}
        >
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/85 backdrop-blur-md"
          />

          {/* Partículas radiales */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            {[...Array(24)].map((_, i) => {
              const angle = (i / 24) * Math.PI * 2;
              const dist = 220 + Math.random() * 200;
              const x = Math.cos(angle) * dist;
              const y = Math.sin(angle) * dist;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: 0, y: 0, scale: 0 }}
                  animate={{ opacity: [0, 1, 0], x, y, scale: [0, 1, 0.5] }}
                  transition={{ duration: 1.8, delay: 0.1 + i * 0.03, ease: 'easeOut' }}
                  className="absolute top-1/2 left-1/2 w-1.5 h-1.5 rounded-full"
                  style={{
                    background: i % 3 === 0 ? '#F5C16C' : i % 3 === 1 ? '#7C5CFF' : '#4DA3FF',
                    boxShadow: '0 0 12px currentColor',
                  }}
                />
              );
            })}
          </div>

          {/* Card */}
          <motion.div
            initial={{ scale: 0.5, opacity: 0, rotateZ: -10 }}
            animate={{ scale: 1, opacity: 1, rotateZ: 0 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 220, damping: 18 }}
            onClick={(e) => e.stopPropagation()}
            className={`relative max-w-md w-full rounded-3xl overflow-hidden border-2 ${colors.border} bg-gradient-to-br from-bg-elevated via-bg-surface to-black shadow-2xl`}
          >
            {/* Glow detrás */}
            <div className={`absolute -inset-1 rounded-3xl ${colors.bg} blur-2xl opacity-60 pointer-events-none`} />

            <button onClick={onClose} className="absolute top-3 right-3 z-10 text-white/40 hover:text-white">
              <X size={18} />
            </button>

            <div className="relative p-8 text-center">
              {/* Icono central */}
              <motion.div
                initial={{ scale: 0, rotate: -180 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
                className={`mx-auto w-20 h-20 rounded-full ${colors.bg} ${colors.border} border-2 flex items-center justify-center mb-5 relative`}
              >
                {newRank === 'CAMPEON' ? (
                  <Crown size={36} className={colors.text} />
                ) : (
                  <ArrowUp size={36} className={colors.text} />
                )}
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity }}
                  className={`absolute inset-0 rounded-full border-2 ${colors.border}`}
                />
              </motion.div>

              <p className="text-[10px] tracking-[0.3em] uppercase text-white/40">
                <Sparkles size={10} className="inline mr-1 text-elite-gold" /> Subiste de nivel
              </p>

              <motion.h2
                initial={{ y: 12, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.3 }}
                className="font-display text-4xl sm:text-5xl font-extrabold mt-2"
              >
                <span className="text-white/40">N{fromLevel}</span>
                <span className="text-white/30 mx-2">→</span>
                <span className={colors.text}>N{toLevel}</span>
              </motion.h2>

              <motion.p
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.4 }}
                className={`mt-2 text-xl font-display font-bold ${colors.text}`}
              >
                {colors.label}
              </motion.p>

              {/* Beneficios desbloqueados nuevos */}
              {newBenefits.length > 0 && (
                <motion.div
                  initial={{ y: 12, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  transition={{ delay: 0.55 }}
                  className="mt-6 p-4 rounded-xl bg-elite-gold/5 border border-elite-gold/20"
                >
                  <p className="text-[10px] tracking-widest uppercase text-elite-gold font-semibold mb-2">
                    🎁 Beneficios desbloqueados
                  </p>
                  <ul className="space-y-1.5 text-sm text-left">
                    {newBenefits.map((b) => (
                      <li key={b.level} className="flex items-center gap-2 text-white">
                        <Check size={14} className="text-elite-gold flex-shrink-0" />
                        {b.label}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}

              <motion.button
                initial={{ y: 8, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.7 }}
                onClick={onClose}
                className="mt-6 px-7 py-3 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white font-semibold hover:shadow-glow-violet transition"
              >
                ¡Sigue jugando!
              </motion.button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
