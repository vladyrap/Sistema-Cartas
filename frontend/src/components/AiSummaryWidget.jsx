import { useState } from 'react';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { api } from '../lib/api';
import { useGuild } from '../lib/useGuild';

const STORAGE_KEY_PREFIX = 'elitecards.ai_summary_';
const TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

export default function AiSummaryWidget() {
  const { current } = useGuild();
  const [summary, setSummary] = useState(() => {
    if (!current) return null;
    try {
      const raw = localStorage.getItem(STORAGE_KEY_PREFIX + current.guild.id);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.timestamp > TTL_MS) return null;
      return parsed;
    } catch { return null; }
  });
  const [loading, setLoading] = useState(false);

  if (!current) return null;

  async function generate() {
    setLoading(true);
    try {
      const r = await api.post(`/ai/guilds/${current.guild.id}/weekly-summary`);
      const data = { ...r.data, timestamp: Date.now() };
      setSummary(data);
      localStorage.setItem(STORAGE_KEY_PREFIX + current.guild.id, JSON.stringify(data));
    } catch (e) {
      // Sin bloquear UI
      console.warn('AI summary failed', e);
    } finally { setLoading(false); }
  }

  return (
    <div className="p-5 rounded-2xl bg-gradient-to-br from-elite-violet/10 via-bg-surface to-elite-blue/5 border border-elite-violet/30">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Sparkles size={14} className="text-elite-violet" />
          <h2 className="font-display font-semibold text-sm">Insights IA · esta semana</h2>
        </div>
        <button
          onClick={generate}
          disabled={loading}
          className="inline-flex items-center gap-1.5 text-[10px] text-elite-violet hover:text-white disabled:opacity-50"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : <RefreshCw size={11} />}
          {loading ? 'Generando…' : (summary ? 'Regenerar' : 'Generar')}
        </button>
      </div>

      {!summary && !loading && (
        <p className="text-xs text-white/50 leading-relaxed">
          Claude analiza la actividad de los últimos 7 días del Gremio y te da
          observaciones + sugerencias accionables. Click "Generar" para crear el primero.
        </p>
      )}

      {summary && (
        <>
          <p className="text-sm text-white/90 leading-relaxed whitespace-pre-wrap">{summary.summary}</p>
          {summary.metrics && (
            <div className="grid grid-cols-3 gap-2 mt-4 pt-4 border-t border-white/5">
              <Stat label="Miembros" value={summary.metrics.total_members} />
              <Stat label="Nuevos 7d" value={summary.metrics.new_members_7d} highlight={summary.metrics.new_members_7d > 0} />
              <Stat label="Eventos 7d" value={summary.metrics.events_finished_7d} />
              <Stat label="EXP repartida" value={(summary.metrics.exp_distributed_7d || 0).toLocaleString('es-CL')} />
              <Stat label="Pendientes" value={summary.metrics.pending_join_requests} highlight={summary.metrics.pending_join_requests > 0} />
              {summary.metrics.top_earners?.[0] && (
                <Stat label="Top EXP" value={summary.metrics.top_earners[0].alias} />
              )}
            </div>
          )}
          <p className="text-[9px] text-white/30 mt-3 font-mono">
            Generado hace {Math.round((Date.now() - summary.timestamp) / 60000)} min
          </p>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-widest text-white/40">{label}</p>
      <p className={`text-sm font-mono font-semibold mt-0.5 ${highlight ? 'text-elite-gold' : ''}`}>{value}</p>
    </div>
  );
}
