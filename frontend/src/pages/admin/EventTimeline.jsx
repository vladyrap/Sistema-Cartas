import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Activity, Shield, AlertTriangle, MessageSquare, CheckCircle2,
  Trophy, Loader2, Filter, Skull,
} from 'lucide-react';
import Navbar from '../../components/Navbar';
import AuthGuard from '../../components/AuthGuard';
import { api } from '../../lib/api';

const KINDS = {
  admin_action:    { color: 'cyan',    icon: Shield,        label: 'Admin' },
  match_report:    { color: 'indigo',  icon: MessageSquare, label: 'Auto-reporte' },
  dispute:         { color: 'rose',    icon: AlertTriangle, label: 'Disputa' },
  penalty:         { color: 'amber',   icon: Skull,         label: 'Penalty' },
  match_completed: { color: 'emerald', icon: CheckCircle2,  label: 'Match' },
};

export default function EventTimeline() {
  return (
    <AuthGuard feature="el timeline auditoría del torneo" returnUrl={window.location.pathname} accent="violet">
      <TimelineContent />
    </AuthGuard>
  );
}

function TimelineContent() {
  const { id } = useParams();
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeKinds, setActiveKinds] = useState(new Set(Object.keys(KINDS)));

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/api/tour-flow/events/${id}/timeline`, { params: { limit: 300 } });
      setEntries(r.data || []);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [id]);

  const toggleKind = (k) => {
    setActiveKinds(prev => {
      const n = new Set(prev);
      n.has(k) ? n.delete(k) : n.add(k);
      return n;
    });
  };

  const filtered = entries.filter(e => activeKinds.has(e.kind));

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-violet-950/20 to-slate-950 text-white">
      <Navbar />
      <div className="max-w-4xl mx-auto px-4 pt-24 pb-16 space-y-6">
        <Link to={`/admin/events/${id}/health`} className="flex items-center gap-2 text-white/60 hover:text-white text-sm w-fit">
          <ArrowLeft size={16} /> Health dashboard
        </Link>

        <div>
          <div className="text-xs uppercase tracking-wider text-violet-300 mb-1">Audit Timeline</div>
          <h1 className="text-3xl font-black">Línea de tiempo del evento</h1>
          <p className="text-white/50 text-sm mt-1">
            Todo lo que ocurrió en este torneo, ordenado de más nuevo a más viejo.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-1.5 text-xs text-white/40 mr-1">
            <Filter size={12} /> Filtrar:
          </div>
          {Object.entries(KINDS).map(([k, meta]) => {
            const active = activeKinds.has(k);
            const Icon = meta.icon;
            return (
              <button
                key={k}
                onClick={() => toggleKind(k)}
                className={`px-3 py-1.5 rounded-full text-xs font-medium flex items-center gap-1.5 transition ${
                  active
                    ? `bg-${meta.color}-500/30 border border-${meta.color}-400/50 text-${meta.color}-200`
                    : 'bg-white/5 border border-white/10 text-white/40'
                }`}
              >
                <Icon size={12} /> {meta.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="grid place-items-center py-20"><Loader2 className="animate-spin" /></div>
        ) : filtered.length === 0 ? (
          <div className="rounded-2xl bg-slate-900/40 border border-white/10 p-12 text-center text-white/40">
            <Activity className="mx-auto mb-3" size={32} />
            Sin eventos para los filtros seleccionados
          </div>
        ) : (
          <div className="relative pl-6">
            <div className="absolute left-2 top-2 bottom-2 w-px bg-gradient-to-b from-violet-500/40 via-white/10 to-transparent" />
            {filtered.map((e, i) => {
              const meta = KINDS[e.kind] || { color: 'slate', icon: Activity, label: e.kind };
              const Icon = meta.icon;
              return (
                <motion.div
                  key={`${e.kind}-${e.when}-${i}`}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: Math.min(i * 0.02, 0.5) }}
                  className="relative mb-4"
                >
                  <div className={`absolute -left-6 top-2 w-3 h-3 rounded-full bg-${meta.color}-400 ring-2 ring-${meta.color}-400/30`} />
                  <div className={`rounded-2xl bg-slate-900/50 border border-${meta.color}-500/20 p-4`}>
                    <div className="flex items-start gap-3">
                      <div className={`p-2 rounded-lg bg-${meta.color}-500/20 text-${meta.color}-300`}>
                        <Icon size={14} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-3 mb-1">
                          <span className={`text-xs font-bold uppercase tracking-wider text-${meta.color}-300`}>
                            {meta.label}
                          </span>
                          <span className="text-xs text-white/40 font-mono whitespace-nowrap">
                            {new Date(e.when).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'medium' })}
                          </span>
                        </div>
                        <div className="text-sm font-medium">{e.summary}</div>
                        {e.actor && (
                          <div className="text-xs text-white/40 mt-1">por <span className="text-white/60">{e.actor}</span></div>
                        )}
                        {e.detail && Object.keys(e.detail).length > 0 && (
                          <details className="mt-2 text-xs">
                            <summary className="text-white/40 cursor-pointer hover:text-white/60">detalles</summary>
                            <pre className="mt-2 bg-slate-950/60 p-2 rounded-lg overflow-x-auto text-white/50 font-mono">
{JSON.stringify(e.detail, null, 2)}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
