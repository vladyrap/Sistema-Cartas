import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, HeartPulse, Gift, Users, TrendingDown, Crown, Send, Check,
  Plus, Trash2, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/Navbar';
import AuthGuard from '../../components/AuthGuard';
import { api } from '../../lib/api';

export default function AdminGrowth() {
  return (
    <AuthGuard feature="el panel de crecimiento" returnUrl={window.location.pathname} accent="emerald">
      <Inner />
    </AuthGuard>
  );
}

function Inner() {
  const [health, setHealth] = useState(null);
  const [queue, setQueue] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [busy, setBusy] = useState(false);
  const [newReward, setNewReward] = useState({ achievement_key: '', label: '' });

  const load = async () => {
    const [h, q, c] = await Promise.all([
      api.get('/growth/admin/community-health').catch(() => ({ data: null })),
      api.get('/growth/loot/queue').catch(() => ({ data: [] })),
      api.get('/growth/loot/catalog').catch(() => ({ data: [] })),
    ]);
    setHealth(h.data); setQueue(q.data); setCatalog(c.data);
  };
  useEffect(() => { load(); }, []);

  const coupon = async (playerId, alias) => {
    setBusy(true);
    try {
      await api.post('/growth/admin/send-coupon', { player_id: playerId, amount_clp: 2000 });
      toast.success(`🎁 Cupón $2.000 enviado a ${alias}`);
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    finally { setBusy(false); }
  };

  const deliver = async (claimId) => {
    setBusy(true);
    try {
      await api.post(`/growth/loot/claims/${claimId}/deliver`);
      toast.success('Entregado ✓');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    finally { setBusy(false); }
  };

  const addReward = async () => {
    if (!newReward.achievement_key || !newReward.label) { toast.error('Faltan campos'); return; }
    try {
      await api.post('/growth/loot/catalog', newReward);
      toast.success('Botín agregado');
      setNewReward({ achievement_key: '', label: '' });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };

  const delReward = async (id) => {
    await api.delete(`/growth/loot/catalog/${id}`);
    load();
  };

  if (!health) {
    return (
      <div className="min-h-screen bg-bg text-white">
        <Navbar />
        <div className="pt-24 grid place-items-center"><Loader2 className="animate-spin text-emerald-300" /></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-emerald-950/10 to-slate-950 text-white">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 pt-24 pb-16 space-y-6">
        <Link to="/admin" className="flex items-center gap-2 text-white/60 hover:text-white text-sm w-fit">
          <ArrowLeft size={16} /> Admin
        </Link>

        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-emerald-300 mb-1">
            <HeartPulse size={14} /> Crecimiento & Retención
          </div>
          <h1 className="font-display text-3xl font-black">Salud de la comunidad</h1>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Stat icon={Users} label="Jugadores" value={health.total_players} color="cyan" />
          <Stat icon={HeartPulse} label="Activos 30d" value={health.active_30d} color="emerald" />
          <Stat icon={TrendingDown} label="Conversión competitiva" value={`${health.conversion_to_competitive_pct}%`} color="violet" />
          <Stat icon={Crown} label="Members activos" value={health.members_active} color="amber" />
        </div>

        {/* En riesgo */}
        <div className="rounded-2xl glass overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 text-xs uppercase tracking-wider text-rose-300 font-bold">
            ⚠️ En riesgo de churn — 21+ días sin jugar ({health.at_risk.length})
          </div>
          <div className="divide-y divide-white/5 max-h-72 overflow-y-auto">
            {health.at_risk.map(p => (
              <div key={p.player_id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <div className="flex-1">
                  <span className="font-semibold">{p.alias}</span>
                  <span className="text-white/40 text-xs ml-2">
                    {p.days_inactive}d inactivo · {p.matches_played} matches · rating {p.rating}
                  </span>
                </div>
                <button onClick={() => coupon(p.player_id, p.alias)} disabled={busy}
                  className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-200 text-xs font-bold disabled:opacity-40 flex items-center gap-1">
                  <Send size={11} /> Cupón $2.000
                </button>
              </div>
            ))}
            {!health.at_risk.length && <div className="px-4 py-8 text-center text-white/40 text-sm">Nadie en riesgo 🎉</div>}
          </div>
        </div>

        {/* Top LTV */}
        <div className="rounded-2xl glass overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 text-xs uppercase tracking-wider text-amber-300 font-bold">
            💎 Top jugadores por inscripciones pagadas
          </div>
          <div className="divide-y divide-white/5">
            {health.top_ltv.map((p, i) => (
              <div key={p.player_id} className="px-4 py-2 flex justify-between text-sm">
                <span><span className="text-white/40 font-mono mr-2">#{i + 1}</span>{p.alias}</span>
                <span className="font-mono text-amber-300">{p.paid_registrations} pagos</span>
              </div>
            ))}
          </div>
        </div>

        {/* Botín: cola + catálogo */}
        <div className="grid md:grid-cols-2 gap-4">
          <div className="rounded-2xl glass overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 text-xs uppercase tracking-wider text-fuchsia-300 font-bold flex items-center gap-2">
              <Gift size={12} /> Cola de entrega ({queue.length})
            </div>
            <div className="divide-y divide-white/5 max-h-64 overflow-y-auto">
              {queue.map(c => (
                <div key={c.claim_id} className="px-4 py-2.5 flex items-center justify-between text-sm gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold truncate">{c.alias}</div>
                    <div className="text-xs text-white/40 truncate">{c.label}</div>
                  </div>
                  <button onClick={() => deliver(c.claim_id)} disabled={busy}
                    className="px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-200 text-xs font-bold shrink-0 disabled:opacity-40 flex items-center gap-1">
                    <Check size={11} /> Entregado
                  </button>
                </div>
              ))}
              {!queue.length && <div className="px-4 py-8 text-center text-white/40 text-sm">Sin canjes pendientes</div>}
            </div>
          </div>

          <div className="rounded-2xl glass overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 text-xs uppercase tracking-wider text-fuchsia-300 font-bold">
              Catálogo de botín
            </div>
            <div className="p-3 flex gap-2 border-b border-white/5">
              <input value={newReward.achievement_key}
                onChange={e => setNewReward({ ...newReward, achievement_key: e.target.value })}
                placeholder="achievement_key (ej: champion)"
                className="flex-1 px-2 py-1.5 rounded-lg bg-bg-surface border border-bg-border text-xs font-mono" />
              <input value={newReward.label}
                onChange={e => setNewReward({ ...newReward, label: e.target.value })}
                placeholder="Premio (ej: Sleeves Elite)"
                className="flex-1 px-2 py-1.5 rounded-lg bg-bg-surface border border-bg-border text-xs" />
              <button onClick={addReward} className="px-2.5 rounded-lg bg-fuchsia-500 text-white"><Plus size={14} /></button>
            </div>
            <div className="divide-y divide-white/5 max-h-48 overflow-y-auto">
              {catalog.map(r => (
                <div key={r.id} className="px-4 py-2 flex justify-between items-center text-sm">
                  <div>
                    <span className="font-mono text-xs text-fuchsia-300">{r.achievement_key}</span>
                    <span className="text-white/70 ml-2">{r.label}</span>
                  </div>
                  <button onClick={() => delReward(r.id)} className="text-rose-300/60 hover:text-rose-300"><Trash2 size={13} /></button>
                </div>
              ))}
              {!catalog.length && <div className="px-4 py-6 text-center text-white/40 text-xs">Sin premios definidos — agregá el primero (champion, undefeated…)</div>}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon: Icon, label, value, color }) {
  const colors = {
    cyan: 'from-cyan-500/20 border-cyan-400/30 text-cyan-300',
    emerald: 'from-emerald-500/20 border-emerald-400/30 text-emerald-300',
    violet: 'from-violet-500/20 border-violet-400/30 text-violet-300',
    amber: 'from-amber-500/20 border-amber-400/30 text-amber-300',
  };
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${colors[color]} to-slate-900/30 border p-4`}>
      <Icon size={16} className="mb-2" />
      <div className="font-display text-2xl font-black">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/50 font-bold">{label}</div>
    </div>
  );
}
