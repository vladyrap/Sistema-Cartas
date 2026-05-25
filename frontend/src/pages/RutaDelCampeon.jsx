import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Check, Crown, Sparkles } from 'lucide-react';
import Layout from '../components/Layout';
import RankBadge from '../components/RankBadge';
import { api } from '../lib/api';
import { auth } from '../lib/auth';
import { BENEFITS_BY_LEVEL, MAX_LEVEL, RANK_BANDS, RANK_COLORS, rankFromLevel } from '../lib/progression';

const LEVELS = Array.from({ length: MAX_LEVEL }, (_, i) => i + 1);

export default function RutaDelCampeon() {
  const [progress, setProgress] = useState(null);

  useEffect(() => {
    if (!auth.isAuthed()) return;
    api.get('/players/me').then((r) => setProgress(r.data.progress)).catch(() => {});
  }, []);

  const currentLevel = progress?.level || 0;

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-6 py-10">
        <header className="text-center mb-12">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 mb-3">
            <Sparkles size={12} className="text-elite-gold" />
            <span className="text-[10px] tracking-widest uppercase text-white/60">Ruta del Campeón</span>
          </div>
          <h1 className="font-display text-4xl md:text-5xl font-bold">
            Del primer paso al{' '}
            <span className="bg-gradient-to-r from-elite-gold via-rose-400 to-elite-magenta bg-clip-text text-transparent">
              trono
            </span>
          </h1>
          <p className="text-white/50 mt-3 max-w-xl mx-auto text-sm">
            {MAX_LEVEL} niveles. 7 rangos. Beneficios reales que se ganan cada temporada.
            {progress && ` Vas en nivel ${currentLevel}.`}
          </p>
        </header>

        {/* Leyenda de rangos */}
        <div className="flex items-center justify-center gap-2 flex-wrap mb-10">
          {RANK_BANDS.map(([lo, hi, rank]) => (
            <RankBadge key={rank} rank={rank} size="sm" />
          ))}
        </div>

        {/* Camino de niveles agrupado por rango (7 secciones) */}
        <div className="space-y-4 mb-12">
          {RANK_BANDS.map(([lo, hi, rankName]) => {
            const colors = RANK_COLORS[rankName];
            const rankLevels = LEVELS.filter((lv) => lv >= lo && lv <= hi);
            return (
              <div key={rankName}>
                <div className="flex items-center gap-2 mb-2">
                  <RankBadge rank={rankName} size="sm" />
                  <span className="text-[10px] text-white/30 font-mono">N{lo}–N{hi}</span>
                  <div className={`flex-grow h-px ${colors.border} border-b`} />
                </div>
                <div className="grid grid-cols-8 sm:grid-cols-10 md:grid-cols-15 gap-1.5">
                  {rankLevels.map((lv) => {
                    const isCurrent = lv === currentLevel;
                    const isUnlocked = lv <= currentLevel;
                    const hasBenefit = BENEFITS_BY_LEVEL[lv];
                    const isMaxLevel = lv === MAX_LEVEL;

                    return (
                      <motion.div
                        key={lv}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ duration: 0.2, delay: Math.min(lv * 0.003, 0.5) }}
                        className={`relative aspect-square rounded-md flex items-center justify-center border ${
                          isCurrent
                            ? `${colors.border} ${colors.bg} ring-1 ring-elite-violet/60 shadow-glow-violet`
                            : isUnlocked
                            ? `${colors.border} ${colors.bg}`
                            : 'border-white/5 bg-bg-surface/40'
                        }`}
                      >
                        {isCurrent && (
                          <div className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-elite-violet flex items-center justify-center">
                            <span className="text-[7px] font-bold text-white">★</span>
                          </div>
                        )}
                        <span className={`font-mono text-[10px] ${isUnlocked ? colors.text : 'text-white/30'}`}>{lv}</span>
                        {hasBenefit && (
                          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
                            {isUnlocked ? (
                              <Check size={8} className="text-elite-blue bg-bg rounded-full p-0.5" />
                            ) : (
                              <Lock size={8} className="text-white/30 bg-bg rounded-full p-0.5" />
                            )}
                          </div>
                        )}
                        {isMaxLevel && (
                          <Crown size={10} className={`absolute -top-1 left-1/2 -translate-x-1/2 ${isUnlocked ? 'text-elite-gold' : 'text-white/20'}`} />
                        )}
                      </motion.div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Beneficios detallados */}
        <h2 className="font-display text-xl font-semibold mb-4">Hitos y beneficios</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {Object.entries(BENEFITS_BY_LEVEL).map(([lvStr, label]) => {
            const lv = Number(lvStr);
            const rank = rankFromLevel(lv);
            const colors = RANK_COLORS[rank];
            const unlocked = lv <= currentLevel;
            return (
              <div key={lv} className={`p-4 rounded-xl border ${unlocked ? `${colors.bg} ${colors.border}` : 'bg-bg-surface border-bg-border'}`}>
                <div className="flex items-center justify-between mb-2">
                  <RankBadge rank={rank} level={lv} size="sm" />
                  {unlocked ? <Check size={14} className="text-elite-blue" /> : <Lock size={14} className="text-white/30" />}
                </div>
                <p className={`text-sm ${unlocked ? 'text-white' : 'text-white/40'}`}>{label}</p>
              </div>
            );
          })}
        </div>

        {!auth.isAuthed() && (
          <div className="mt-12 text-center p-8 rounded-2xl bg-bg-surface border border-elite-violet/30">
            <p className="text-white/70 mb-4">Crea tu Elite ID y empieza tu Ruta del Campeón.</p>
            <a href="/register" className="inline-flex items-center px-5 py-2.5 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white font-semibold hover:shadow-glow-violet transition">
              Crear mi Elite ID
            </a>
          </div>
        )}
      </div>
    </Layout>
  );
}
