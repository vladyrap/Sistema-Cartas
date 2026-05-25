import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Trophy, Target, Award, Calendar, Zap, Crown, Activity, TrendingUp } from 'lucide-react';
import Layout from '../components/Layout';
import RankBadge from '../components/RankBadge';
import { api } from '../lib/api';

export default function PlayerStats() {
  const { id } = useParams();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get(`/players/${id}/stats`)
      .then((r) => setStats(r.data))
      .finally(() => setLoading(false));
  }, [id]);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-6 py-10">
        <Link to={`/players/${id}`} className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white mb-6">
          <ArrowLeft size={14} /> Volver al perfil
        </Link>

        {loading && <p className="text-white/40">Cargando estadísticas…</p>}

        {stats && (
          <>
            <header className="mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-elite-blue/10 border border-elite-blue/30 mb-3">
                <Activity size={12} className="text-elite-blue" />
                <span className="text-[10px] tracking-widest uppercase text-elite-blue">Estadísticas</span>
              </div>
              <h1 className="font-display text-3xl font-bold">{stats.alias}</h1>
            </header>

            {/* Big stats */}
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-8">
              <BigStat label="Win rate" value={`${stats.win_rate}%`} icon={Target} accent="text-emerald-300" sub={`${stats.total_rounds_won} W / ${stats.total_rounds_lost} L`} />
              <BigStat label="Campeonatos" value={stats.championships} icon={Crown} accent="text-elite-gold" />
              <BigStat label="Prestigio" value={stats.current_prestige.toLocaleString()} icon={Award} accent="text-elite-gold" />
              <BigStat label="Temporadas" value={stats.total_seasons} icon={Calendar} accent="text-elite-violet" />
            </div>

            {/* Detail */}
            <div className="grid md:grid-cols-2 gap-4">
              <Section title="Resultados competitivos" icon={Trophy}>
                <Row label="🥇 Campeonatos" value={stats.championships} />
                <Row label="🏅 Podios (top 3)" value={stats.podiums} />
                <Row label="🎯 Top 8" value={stats.top_8_finishes} />
                <Row label="Mejor rango histórico" value={stats.best_max_rank ? <RankBadge rank={stats.best_max_rank} size="sm" /> : '—'} />
              </Section>

              <Section title="Asistencia" icon={Calendar}>
                <Row label="Inscripciones totales" value={stats.total_events_registered} />
                <Row label="Asistencias" value={stats.total_events_attended} />
                <Row label="No-shows" value={stats.total_no_shows} accent={stats.total_no_shows > 0 ? 'text-rose-300' : ''} />
                <Row label="Tasa de asistencia"
                  value={stats.total_events_registered > 0
                    ? `${Math.round((stats.total_events_attended / stats.total_events_registered) * 100)}%`
                    : '—'} />
              </Section>

              <Section title="Rondas" icon={Zap}>
                <Row label="Ganadas" value={stats.total_rounds_won} accent="text-emerald-300" />
                <Row label="Perdidas" value={stats.total_rounds_lost} accent="text-rose-300" />
                <Row label="Win rate" value={`${stats.win_rate}%`} accent="text-elite-blue" />
              </Section>

              <Section title="Logros y compromiso" icon={TrendingUp}>
                <Row label="Misiones completadas" value={stats.missions_completed} />
                <Row label="Medallas obtenidas" value={stats.achievements_earned} accent="text-elite-magenta" />
              </Section>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}

function BigStat({ label, value, icon: Icon, accent, sub }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="p-4 rounded-2xl bg-bg-surface border border-bg-border"
    >
      <Icon size={16} className={accent || 'text-white/60'} />
      <p className="text-[10px] tracking-widest uppercase text-white/40 mt-3">{label}</p>
      <p className={`font-mono text-2xl font-bold mt-0.5 ${accent || 'text-white'}`}>{value}</p>
      {sub && <p className="text-[10px] font-mono text-white/40 mt-1">{sub}</p>}
    </motion.div>
  );
}

function Section({ title, icon: Icon, children }) {
  return (
    <div className="p-5 rounded-2xl bg-bg-surface border border-bg-border">
      <h2 className="font-display text-base font-semibold mb-4 flex items-center gap-2">
        <Icon size={14} className="text-elite-blue" /> {title}
      </h2>
      <dl className="space-y-2">{children}</dl>
    </div>
  );
}

function Row({ label, value, accent }) {
  return (
    <div className="flex items-center justify-between text-sm py-1 border-b border-white/5 last:border-0">
      <dt className="text-white/60">{label}</dt>
      <dd className={`font-mono font-semibold ${accent || 'text-white'}`}>{value}</dd>
    </div>
  );
}
