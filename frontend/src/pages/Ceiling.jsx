import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, Target, Activity, Zap, Award } from 'lucide-react';
import Navbar from '../components/Navbar';
import EmptyState from '../components/EmptyState';
import AuthGuard from '../components/AuthGuard';
import { api } from '../lib/api';

export default function Ceiling() {
  return (
    <AuthGuard feature="Skill Ceiling Estimator" returnUrl="/ceiling" accent="cyan">
      <CeilingContent />
    </AuthGuard>
  );
}

function CeilingContent() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/ceiling/me')
      .then((r) => setData(r.data))
      .catch((e) => setError(e?.response?.data?.detail || 'No pudimos calcular tu techo'));
  }, []);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <EmptyState
          icon={Activity}
          title="Sin datos suficientes"
          description={error}
          action={{ label: 'Volver', to: '/dashboard' }}
        />
      </div>
    );
  }
  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="max-w-2xl mx-auto px-6 py-20 text-center text-slate-400">Calculando proyección…</div>
      </div>
    );
  }

  // Gauge config: rango visible 1000..2800
  const MIN = 1000, MAX = 2800;
  const norm = (v) => Math.max(0, Math.min(1, (v - MIN) / (MAX - MIN)));
  const cur = norm(data.rating);
  const peak = norm(data.peak);
  const ceil = norm(data.projected_ceiling);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-cyan-950/20 text-white">
      <Navbar />

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <TrendingUp size={14} className="text-cyan-400" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-cyan-300 font-bold">
              Skill Ceiling · {data.game_name}
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter">
            Tu techo proyectado.
          </h1>
          <p className="text-slate-400 mt-3 max-w-md mx-auto">
            Basado en rating Glicko, últimos 30 días de matches y nivel de oponentes.
          </p>
        </div>

        {/* Main number */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}
          className="rounded-3xl bg-gradient-to-br from-cyan-700/30 via-blue-700/30 to-violet-700/30 ring-2 ring-cyan-500/30 p-8 sm:p-10 mb-6 text-center"
        >
          <div className="text-[10px] uppercase tracking-widest text-cyan-300 font-bold mb-2">
            Techo proyectado
          </div>
          <div className="text-6xl sm:text-7xl font-black tabular-nums bg-gradient-to-r from-cyan-200 via-white to-violet-200 bg-clip-text text-transparent mb-2">
            {data.projected_ceiling.toFixed(0)}
          </div>
          <div className="text-sm text-slate-300">
            Rating actual: <span className="font-mono font-bold text-white">{data.rating.toFixed(0)}</span>
            <span className="mx-2 text-slate-500">·</span>
            Peak histórico: <span className="font-mono font-bold text-amber-300">{data.peak.toFixed(0)}</span>
          </div>
        </motion.div>

        {/* Gauge */}
        <div className="rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-6 mb-6">
          <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3">
            Visualización
          </div>
          <div className="relative h-8 rounded-full bg-white/[0.05] overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-slate-700/40 via-cyan-700/30 to-fuchsia-700/40" />
            {/* Ceiling marker */}
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${ceil * 100}%` }}
              transition={{ duration: 1.2, ease: 'easeOut' }}
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-cyan-500/30 to-violet-500/30 border-r-2 border-violet-300"
            />
            {/* Current marker */}
            <motion.div
              initial={{ left: '0%' }}
              animate={{ left: `${cur * 100}%` }}
              transition={{ duration: 1.2, delay: 0.4, ease: 'easeOut' }}
              className="absolute top-0 bottom-0 w-1 bg-white shadow-lg"
            />
            {/* Peak marker */}
            <motion.div
              initial={{ left: '0%' }}
              animate={{ left: `${peak * 100}%` }}
              transition={{ duration: 1.2, delay: 0.6, ease: 'easeOut' }}
              className="absolute top-1 bottom-1 w-0.5 bg-amber-300"
            />
          </div>
          <div className="flex justify-between text-[10px] mt-2 text-slate-500 font-mono">
            <span>{MIN}</span>
            <span>2200</span>
            <span>{MAX}</span>
          </div>
          <div className="flex flex-wrap gap-4 mt-4 text-xs">
            <Legend color="bg-white" label={`Tu rating: ${data.rating.toFixed(0)}`} />
            <Legend color="bg-amber-300" label={`Peak: ${data.peak.toFixed(0)}`} />
            <Legend color="bg-gradient-to-r from-cyan-500 to-violet-500" label={`Techo: ${data.projected_ceiling.toFixed(0)}`} />
          </div>
        </div>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Stat icon={Activity} label="Matches 30d" value={data.matches_last_30d} accent="violet" />
          <Stat icon={Target} label="Win rate" value={`${data.win_rate_recent}%`} accent="emerald" />
          <Stat icon={Zap} label="RD" value={data.rd.toFixed(0)} accent="amber" />
          <Stat icon={Award} label="Confianza" value={`${(data.confidence * 100).toFixed(0)}%`} accent="cyan" />
        </div>

        {/* Avg opponent */}
        {data.avg_opponent_rating !== null && (
          <div className="rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-5 mb-6">
            <div className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">
              Rating promedio de rivales
            </div>
            <div className="text-3xl font-black tabular-nums">{data.avg_opponent_rating.toFixed(0)}</div>
            <div className="text-xs text-slate-400 mt-1">
              {data.avg_opponent_rating > data.rating
                ? `+${(data.avg_opponent_rating - data.rating).toFixed(0)} sobre tu nivel — buena vara`
                : `${(data.avg_opponent_rating - data.rating).toFixed(0)} bajo tu nivel — necesitas mejores rivales`}
            </div>
          </div>
        )}

        {/* Explanation */}
        <div className="rounded-2xl bg-gradient-to-br from-violet-500/10 to-cyan-500/10 ring-1 ring-violet-500/30 p-5">
          <div className="text-[10px] uppercase tracking-widest text-violet-300 font-bold mb-2 flex items-center gap-1.5">
            <Award size={11} /> Diagnóstico
          </div>
          <p className="text-base">{data.explanation}</p>
        </div>
      </div>
    </div>
  );
}

function Legend({ color, label }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`w-3 h-3 rounded-full ${color}`} />
      <span className="text-slate-400">{label}</span>
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent }) {
  const c = { violet: 'text-violet-300', emerald: 'text-emerald-300', amber: 'text-amber-300', cyan: 'text-cyan-300' }[accent];
  return (
    <div className="rounded-xl bg-white/[0.04] ring-1 ring-white/10 p-3">
      <div className={`text-[10px] uppercase tracking-widest font-bold mb-1 flex items-center gap-1 ${c}`}>
        <Icon size={11} /> {label}
      </div>
      <div className="text-2xl font-black tabular-nums">{value}</div>
    </div>
  );
}
