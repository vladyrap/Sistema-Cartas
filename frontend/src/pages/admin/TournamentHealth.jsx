import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  AlertTriangle, CheckCircle2, AlertCircle, Activity, ArrowLeft,
  Hash, RefreshCw, Wrench, Shield, Zap, Clock, Skull, Trophy,
  TrendingUp, Camera, Play, Pause, Plus,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/Navbar';
import AuthGuard from '../../components/AuthGuard';
import { api } from '../../lib/api';

const SEVERITY = {
  critical: { color: 'rose', icon: AlertTriangle, label: 'Crítico' },
  warning:  { color: 'amber', icon: AlertCircle, label: 'Advertencia' },
  info:     { color: 'cyan', icon: Activity, label: 'Info' },
};

export default function TournamentHealth() {
  return (
    <AuthGuard feature="el Health Dashboard del torneo" returnUrl={window.location.pathname} accent="cyan">
      <HealthContent />
    </AuthGuard>
  );
}

function HealthContent() {
  const { id } = useParams();
  const [health, setHealth] = useState(null);
  const [disputes, setDisputes] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [timers, setTimers] = useState([]);
  const [deltas, setDeltas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    else setRefreshing(true);
    try {
      const [h, d, p, t, rd] = await Promise.all([
        api.get(`/tour-pro/events/${id}/health`).then((r) => r.data),
        api.get(`/tour-pro/events/${id}/disputes`).then((r) => r.data).catch(() => []),
        api.get(`/tour-pro/events/${id}/penalties`).then((r) => r.data).catch(() => []),
        api.get(`/tour-pro/events/${id}/timers`).then((r) => r.data).catch(() => []),
        api.get(`/tour-pro/events/${id}/rating-deltas`).then((r) => r.data).catch(() => []),
      ]);
      setHealth(h); setDisputes(d); setPenalties(p); setTimers(t); setDeltas(rd);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo cargar el health');
    } finally {
      setLoading(false); setRefreshing(false);
    }
  };

  useEffect(() => { load(); }, [id]);

  const recompute = async () => {
    if (!confirm('Recomputar counters desde MatchResult? Repara drift en match_points/wins/losses.')) return;
    try {
      const { data } = await api.post(`/tour-pro/events/${id}/recompute-counters`);
      toast.success(`${data.registrations_fixed} regs corregidas`);
      load(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Falló');
    }
  };

  const snapshotRatings = async () => {
    try {
      const { data } = await api.post(`/tour-pro/events/${id}/snapshot-ratings`);
      toast.success(`Snapshots: ${data.snapshots_created} creados, ${data.already_existed} ya existían, ${data.without_rating} sin rating`);
      load(false);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Falló');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="max-w-5xl mx-auto px-6 py-20 text-center text-slate-400">Diagnosticando torneo…</div>
      </div>
    );
  }

  if (!health || !health.event_name) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="max-w-5xl mx-auto px-6 py-20 text-center text-rose-400">Evento no encontrado</div>
      </div>
    );
  }

  const criticalCount = health.issues?.filter((i) => i.severity === 'critical').length || 0;
  const warningCount = health.issues?.filter((i) => i.severity === 'warning').length || 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-cyan-950/20 text-white">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 py-8">
        <Link to={`/admin/events/${id}`} className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-4">
          <ArrowLeft size={12} /> Volver al evento
        </Link>

        <div className="flex items-end justify-between mb-6 flex-wrap gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-[0.4em] text-cyan-300 font-bold mb-1 inline-flex items-center gap-1.5">
              <Shield size={11} /> Tournament Health
            </div>
            <h1 className="text-3xl sm:text-4xl font-black tracking-tighter">{health.event_name}</h1>
            <p className="text-xs text-slate-400 font-mono mt-1">
              {health.event_status} · {health.registered_players} jugadores · {health.total_matches} matches · {health.max_round} rondas
            </p>
          </div>
          <button
            onClick={() => load(false)}
            disabled={refreshing}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-white/[0.05] hover:bg-white/10 text-sm transition"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} /> Refrescar
          </button>
        </div>

        {/* Status banner */}
        <div className={`mb-6 rounded-2xl p-5 ring-1 ${
          criticalCount > 0
            ? 'bg-rose-500/15 ring-rose-500/40'
            : warningCount > 0
            ? 'bg-amber-500/10 ring-amber-500/30'
            : 'bg-emerald-500/10 ring-emerald-500/30'
        }`}>
          <div className="flex items-center gap-3">
            {criticalCount > 0
              ? <AlertTriangle size={28} className="text-rose-300" />
              : warningCount > 0
              ? <AlertCircle size={28} className="text-amber-300" />
              : <CheckCircle2 size={28} className="text-emerald-300" />}
            <div className="flex-1">
              <div className="font-black text-lg">
                {criticalCount > 0
                  ? `${criticalCount} issue(s) crítico(s) — NO finalizable`
                  : warningCount > 0
                  ? `${warningCount} warning(s) — finalizable con caveats`
                  : 'Salud OK — listo para finalize'}
              </div>
              <div className="text-xs text-slate-400 mt-0.5 font-mono inline-flex items-center gap-1.5">
                <Hash size={10} /> integrity_hash: {health.integrity_hash}
              </div>
            </div>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <Stat icon={Activity} label="Disputas" value={disputes.filter((d) => d.status === 'OPEN').length} accent="rose" />
          <Stat icon={Skull} label="Penalties" value={penalties.filter((p) => !p.rescinded_at).length} accent="amber" />
          <Stat icon={Clock} label="Timers" value={timers.length} accent="cyan" />
          <Stat icon={Camera} label="Rating snaps" value={deltas.length} accent="violet" />
        </div>

        {/* Issues list */}
        {health.issues && health.issues.length > 0 && (
          <Section icon={AlertCircle} title="Issues detectados" accent="amber">
            <ul className="space-y-2">
              {health.issues.map((issue, i) => <IssueRow key={i} issue={issue} />)}
            </ul>
          </Section>
        )}

        {/* Disputes */}
        <Section icon={AlertTriangle} title={`Disputas (${disputes.length})`} accent="rose">
          {disputes.length === 0 ? (
            <p className="text-sm text-slate-400 italic">Sin disputas.</p>
          ) : (
            <ul className="space-y-2">
              {disputes.slice(0, 10).map((d) => (
                <li key={d.id} className="flex items-start gap-3 p-3 rounded-lg bg-white/[0.03]">
                  <div className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                    d.status === 'OPEN' ? 'bg-rose-500/20 text-rose-300' : 'bg-emerald-500/20 text-emerald-300'
                  }`}>
                    {d.status}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold">Match #{d.match_id} · abierta por {d.opened_by_alias}</div>
                    <div className="text-xs text-slate-400 italic mt-0.5">"{d.reason}"</div>
                    {d.resolution_notes && (
                      <div className="text-xs text-emerald-300 mt-1">Resolución: {d.resolution_notes}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Penalties */}
        <Section icon={Skull} title={`Penalties (${penalties.length})`} accent="amber">
          {penalties.length === 0 ? (
            <p className="text-sm text-slate-400 italic">Sin penalties aplicadas.</p>
          ) : (
            <ul className="space-y-2">
              {penalties.slice(0, 10).map((p) => (
                <li key={p.id} className={`flex items-center gap-3 p-3 rounded-lg ${p.rescinded_at ? 'bg-white/[0.02] opacity-60' : 'bg-white/[0.04]'}`}>
                  <div className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                    p.kind === 'warning' ? 'bg-amber-500/20 text-amber-300' :
                    p.kind === 'game_loss' ? 'bg-orange-500/20 text-orange-300' :
                    p.kind === 'match_loss' ? 'bg-rose-500/20 text-rose-300' :
                    'bg-red-700/30 text-red-200'
                  }`}>
                    {p.kind.replace('_', ' ')}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold">{p.player_alias}</div>
                    <div className="text-xs text-slate-400">{p.reason}</div>
                    {p.rescinded_at && (
                      <div className="text-[10px] text-emerald-300 mt-0.5">Rescindida: {p.rescinded_reason}</div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Rating deltas */}
        <Section icon={TrendingUp} title={`Rating deltas (${deltas.length})`} accent="violet">
          {deltas.length === 0 ? (
            <div className="text-sm text-slate-400 italic">
              Sin rating snapshots. {' '}
              <button onClick={snapshotRatings} className="text-violet-300 hover:text-white underline">
                Crear snapshots ahora
              </button>
            </div>
          ) : (
            <ul className="space-y-1">
              {deltas.slice(0, 12).map((d) => (
                <li key={d.player_id} className="flex items-center justify-between gap-3 px-3 py-1.5 rounded hover:bg-white/[0.03]">
                  <div className="font-semibold text-sm">{d.player_alias}</div>
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-400 font-mono">
                      {Math.round(d.pre_rating)} → {d.post_rating ? Math.round(d.post_rating) : '—'}
                    </span>
                    {d.delta !== null && (
                      <span className={`font-mono text-sm font-bold ${
                        d.delta > 0 ? 'text-emerald-300' : d.delta < 0 ? 'text-rose-300' : 'text-slate-400'
                      }`}>
                        {d.delta > 0 ? '+' : ''}{d.delta}
                      </span>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Timers */}
        <Section icon={Clock} title={`Round timers (${timers.length})`} accent="cyan">
          {timers.length === 0 ? (
            <p className="text-sm text-slate-400 italic">No hay timers configurados para este evento.</p>
          ) : (
            <ul className="space-y-2">
              {timers.map((t) => (
                <li key={t.id} className="flex items-center gap-3 p-3 rounded-lg bg-white/[0.04]">
                  <div className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold ${
                    t.status === 'RUNNING' ? 'bg-emerald-500/20 text-emerald-300' :
                    t.status === 'PAUSED' ? 'bg-amber-500/20 text-amber-300' :
                    t.status === 'EXTENDED' ? 'bg-violet-500/20 text-violet-300' :
                    'bg-slate-500/20 text-slate-300'
                  }`}>
                    {t.status}
                  </div>
                  <div className="flex-1">
                    <div className="text-sm font-bold">Ronda {t.round_number}</div>
                    <div className="text-xs text-slate-400 font-mono">
                      {t.duration_minutes}min{t.extended_minutes > 0 && ` + ${t.extended_minutes}min extra`}
                      {t.seconds_remaining !== null && ` · ${Math.floor(t.seconds_remaining / 60)}:${String(t.seconds_remaining % 60).padStart(2, '0')} restante`}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>

        {/* Admin actions */}
        <Section icon={Wrench} title="Acciones de mantenimiento" accent="cyan">
          <div className="grid sm:grid-cols-2 gap-3">
            <button
              onClick={recompute}
              className="p-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-left transition"
            >
              <div className="flex items-center gap-2 mb-1">
                <RefreshCw size={14} className="text-cyan-300" />
                <span className="font-bold text-sm">Recomputar counters</span>
              </div>
              <p className="text-xs text-slate-400">
                Repara drift en match_points/wins/losses re-derivando desde MatchResult.
              </p>
            </button>
            <button
              onClick={snapshotRatings}
              className="p-4 rounded-xl bg-white/[0.04] hover:bg-white/[0.08] text-left transition"
            >
              <div className="flex items-center gap-2 mb-1">
                <Camera size={14} className="text-violet-300" />
                <span className="font-bold text-sm">Snapshot ratings</span>
              </div>
              <p className="text-xs text-slate-400">
                Captura rating Glicko pre-evento para mostrar delta al finalizar.
              </p>
            </button>
          </div>
        </Section>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, accent }) {
  const c = { rose: 'text-rose-300', amber: 'text-amber-300', cyan: 'text-cyan-300', violet: 'text-violet-300' }[accent];
  return (
    <div className="rounded-xl bg-white/[0.04] ring-1 ring-white/10 p-3">
      <div className={`text-[9px] uppercase tracking-widest font-bold mb-1 flex items-center gap-1 ${c}`}>
        <Icon size={10} /> {label}
      </div>
      <div className="text-2xl font-black tabular-nums">{value}</div>
    </div>
  );
}

function Section({ icon: Icon, title, accent, children }) {
  const c = { rose: 'text-rose-300', amber: 'text-amber-300', cyan: 'text-cyan-300', violet: 'text-violet-300' }[accent] || 'text-slate-300';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="mt-6 rounded-2xl bg-white/[0.03] ring-1 ring-white/10 p-5"
    >
      <h2 className={`text-[10px] uppercase tracking-widest font-bold mb-3 flex items-center gap-1.5 ${c}`}>
        <Icon size={11} /> {title}
      </h2>
      {children}
    </motion.div>
  );
}

function IssueRow({ issue }) {
  const meta = SEVERITY[issue.severity] || SEVERITY.info;
  const Icon = meta.icon;
  const bg = { rose: 'bg-rose-500/10 ring-rose-500/30', amber: 'bg-amber-500/10 ring-amber-500/30', cyan: 'bg-cyan-500/10 ring-cyan-500/30' }[meta.color];
  const text = { rose: 'text-rose-300', amber: 'text-amber-300', cyan: 'text-cyan-300' }[meta.color];
  return (
    <li className={`flex items-start gap-3 p-3 rounded-lg ring-1 ${bg}`}>
      <Icon size={16} className={`${text} mt-0.5 shrink-0`} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-2 flex-wrap">
          <span className="text-xs font-mono uppercase font-bold opacity-70">{issue.code}</span>
          <span className={`text-[9px] uppercase tracking-widest font-bold ${text}`}>{meta.label}</span>
          {issue.count > 0 && (
            <span className="text-xs text-white/40 font-mono">×{issue.count}</span>
          )}
        </div>
        <div className="text-sm mt-1">{issue.message}</div>
        {issue.details && (
          <details className="mt-2">
            <summary className="text-[10px] uppercase tracking-widest text-slate-500 cursor-pointer hover:text-white">
              Ver detalles
            </summary>
            <pre className="mt-2 text-[10px] font-mono text-slate-400 bg-black/30 rounded p-2 overflow-x-auto">
              {JSON.stringify(issue.details, null, 2)}
            </pre>
          </details>
        )}
      </div>
    </li>
  );
}
