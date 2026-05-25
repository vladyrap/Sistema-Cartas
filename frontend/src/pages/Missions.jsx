import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Check, Clock, Sparkles, Zap, Award } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../lib/useAuth';
import { api } from '../lib/api';

export default function Missions() {
  const { isAuthed, loading: authLoading } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthed) return;
    api.get('/missions/me')
      .then((r) => setItems(r.data))
      .finally(() => setLoading(false));
  }, [isAuthed]);

  if (authLoading) return <Layout><div className="p-10 text-white/40">Cargando…</div></Layout>;
  if (!isAuthed) return <Navigate to="/login" replace />;

  const weekly = items.filter((it) => it.mission.is_weekly);
  const season = items.filter((it) => !it.mission.is_weekly);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-6 py-10">
        <header className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-elite-magenta/10 border border-elite-magenta/30 mb-3">
            <Award size={12} className="text-elite-magenta" />
            <span className="text-[10px] tracking-widest uppercase text-elite-magenta">Misiones</span>
          </div>
          <h1 className="font-display text-3xl font-bold">Tus desafíos activos</h1>
          <p className="text-white/50 mt-1 text-sm">Completa misiones para ganar EXP extra y medallas.</p>
        </header>

        {loading ? (
          <p className="text-white/40">Cargando misiones…</p>
        ) : items.length === 0 ? (
          <div className="p-8 rounded-2xl bg-bg-surface border border-bg-border text-center">
            <Sparkles size={28} className="mx-auto text-white/30 mb-3" />
            <p className="text-white/60">Aún no hay misiones activas para esta temporada.</p>
          </div>
        ) : (
          <>
            {weekly.length > 0 && <MissionSection title="Misiones semanales" items={weekly} accent="elite-blue" />}
            {season.length > 0 && <MissionSection title="Misiones de temporada" items={season} accent="elite-violet" />}
          </>
        )}
      </div>
    </Layout>
  );
}

function MissionSection({ title, items, accent }) {
  return (
    <section className="mb-8">
      <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
        <Zap size={16} className={`text-${accent}`} /> {title}
      </h2>
      <div className="space-y-2">
        {items.map(({ mission, state }, i) => (
          <motion.div
            key={mission.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            className={`p-4 rounded-xl bg-bg-surface border ${
              state.is_completed ? 'border-emerald-500/30 bg-emerald-500/[0.03]' : 'border-bg-border'
            } flex items-center justify-between gap-4 flex-wrap`}
          >
            <div className="flex-grow min-w-0">
              <div className="flex items-center gap-2">
                {state.is_completed ? (
                  <Check size={16} className="text-emerald-300 flex-shrink-0" />
                ) : (
                  <Clock size={16} className="text-white/40 flex-shrink-0" />
                )}
                <p className={`font-semibold ${state.is_completed ? 'line-through text-white/50' : ''}`}>{mission.name}</p>
              </div>
              {mission.description && (
                <p className="text-xs text-white/50 mt-1 ml-6">{mission.description}</p>
              )}
              <div className="flex items-center gap-3 mt-2 ml-6">
                <span className="font-mono text-[10px] text-white/40">{state.progress}/{state.target}</span>
                <div className="flex-grow max-w-[200px] h-1 rounded-full bg-bg-elevated overflow-hidden">
                  <div
                    className={`h-full ${state.is_completed ? 'bg-emerald-400' : 'bg-elite-violet'}`}
                    style={{ width: `${Math.min(100, (state.progress / Math.max(1, state.target)) * 100)}%` }}
                  />
                </div>
              </div>
            </div>
            <span className={`inline-flex items-center gap-1 text-xs font-mono px-2.5 py-1 rounded bg-elite-gold/10 text-elite-gold border border-elite-gold/30 ${
              state.is_completed ? 'opacity-50' : ''
            }`}>
              <Sparkles size={11} /> +{mission.exp_reward} EXP
            </span>
          </motion.div>
        ))}
      </div>
    </section>
  );
}
