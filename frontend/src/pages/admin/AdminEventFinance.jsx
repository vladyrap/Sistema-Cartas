import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Wallet, Clock, RotateCcw, Users, Loader2, CreditCard,
  HandCoins, ListOrdered, AlertTriangle,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/Navbar';
import AuthGuard from '../../components/AuthGuard';
import { api } from '../../lib/api';

export default function AdminEventFinance() {
  return (
    <AuthGuard feature="la caja del evento" returnUrl={window.location.pathname} accent="emerald">
      <Inner />
    </AuthGuard>
  );
}

function Inner() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await api.get(`/events/${id}/finance`);
      setData(r.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo cargar la caja');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); const t = setInterval(load, 15000); return () => clearInterval(t); }, [id]);

  const markPaid = async (regId, alias) => {
    setBusy(true);
    try {
      await api.post(`/events/registrations/${regId}/mark-paid`);
      toast.success(`💵 ${alias} marcado pagado`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    finally { setBusy(false); }
  };

  const markRefunded = async (regId, alias) => {
    if (!confirm(`Marcar REFUNDED a ${alias}? El refund real en MP lo hacés desde su panel.`)) return;
    setBusy(true);
    try {
      await api.post(`/events/registrations/${regId}/mark-refunded`);
      toast.success(`↩️ ${alias} reembolsado`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    finally { setBusy(false); }
  };

  const refundAll = async () => {
    if (!confirm('Marcar REFUNDED todas las inscripciones PAGADAS? (típico: evento cancelado)')) return;
    setBusy(true);
    try {
      const r = await api.post(`/events/${id}/refund-all`);
      toast.success(`${r.data.refunded_count} inscripciones marcadas reembolsadas`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
    finally { setBusy(false); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg text-white">
        <Navbar />
        <div className="pt-24 grid place-items-center"><Loader2 className="animate-spin text-emerald-300" /></div>
      </div>
    );
  }
  if (!data) return null;

  const clp = (n) => `$${(n || 0).toLocaleString('es-CL')}`;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-emerald-950/10 to-slate-950 text-white">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 pt-24 pb-16 space-y-6">
        <Link to={`/admin/events/${id}`} className="flex items-center gap-2 text-white/60 hover:text-white text-sm w-fit">
          <ArrowLeft size={16} /> Manage event
        </Link>

        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-emerald-300 mb-1">
              <Wallet size={14} /> Caja del evento
            </div>
            <h1 className="font-display text-3xl font-black">{data.event_name}</h1>
            <p className="text-white/50 text-sm mt-1">
              Entrada: <span className="text-elite-gold font-mono">{clp(data.price_clp)}</span> ·{' '}
              {data.registrations}/{data.slots} inscritos
            </p>
          </div>
          <button
            onClick={refundAll}
            disabled={busy || !data.counts.PAID}
            className="px-4 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/30 border border-rose-400/30 text-rose-200 text-sm font-bold disabled:opacity-40 flex items-center gap-2"
          >
            <RotateCcw size={14} /> Refund masivo
          </button>
        </div>

        {/* Resumen */}
        <div className="grid grid-cols-3 gap-4">
          <FinanceStat icon={Wallet} label="Recaudado" value={clp(data.collected_clp)}
            sub={`${data.counts.PAID || 0} pagos`} color="emerald" />
          <FinanceStat icon={Clock} label="Pendiente" value={clp(data.pending_clp)}
            sub={`${data.counts.PENDING || 0} sin pagar`} color="amber" />
          <FinanceStat icon={RotateCcw} label="Reembolsado" value={clp(data.refunded_clp)}
            sub={`${data.counts.REFUNDED || 0} refunds`} color="cyan" />
        </div>

        {data.counts.PENDING > 0 && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 p-3 flex items-center gap-2 text-amber-200 text-sm">
            <AlertTriangle size={14} className="shrink-0" />
            Hay {clp(data.pending_clp)} sin cobrar — los cupos impagos expiran automáticamente.
          </div>
        )}

        {/* Detalle por inscripción */}
        <div className="rounded-2xl glass overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 text-xs uppercase tracking-wider text-white/50 font-bold flex items-center gap-2">
            <CreditCard size={12} /> Detalle por inscripción
          </div>
          <div className="divide-y divide-white/5 max-h-[420px] overflow-y-auto">
            {data.detail.map(r => (
              <div key={r.registration_id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{r.alias}</div>
                  <div className="text-[10px] text-white/40 font-mono truncate">
                    {r.mp_payment_id ? `MP #${r.mp_payment_id}` : r.method === 'manual' ? 'pago manual' : '—'}
                    {r.paid_at && ` · ${new Date(r.paid_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}`}
                  </div>
                </div>
                <PayChip status={r.payment_status} />
                {r.payment_status === 'PENDING' && (
                  <button onClick={() => markPaid(r.registration_id, r.alias)} disabled={busy}
                    className="px-2.5 py-1 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 text-amber-200 text-xs font-bold disabled:opacity-40 flex items-center gap-1">
                    <HandCoins size={11} /> Pagado
                  </button>
                )}
                {r.payment_status === 'PAID' && (
                  <button onClick={() => markRefunded(r.registration_id, r.alias)} disabled={busy}
                    className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-cyan-500/20 text-white/50 hover:text-cyan-200 text-xs disabled:opacity-40 flex items-center gap-1">
                    <RotateCcw size={11} /> Refund
                  </button>
                )}
              </div>
            ))}
            {!data.detail.length && (
              <div className="px-4 py-10 text-center text-white/40 text-sm">Sin inscripciones</div>
            )}
          </div>
        </div>

        {/* Waitlist */}
        <div className="rounded-2xl glass overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 text-xs uppercase tracking-wider text-violet-300 font-bold flex items-center gap-2">
            <ListOrdered size={12} /> Lista de espera ({data.waitlist.length})
          </div>
          <div className="divide-y divide-white/5">
            {data.waitlist.map(w => (
              <div key={w.player_id} className="px-4 py-2.5 flex items-center gap-3 text-sm">
                <div className="w-8 h-8 rounded-lg bg-violet-500/15 grid place-items-center font-mono font-bold text-violet-300">
                  {w.position}
                </div>
                <div className="flex-1 font-semibold truncate">{w.alias}</div>
                <span className="text-[10px] text-white/40 font-mono">
                  desde {new Date(w.since).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
                </span>
              </div>
            ))}
            {!data.waitlist.length && (
              <div className="px-4 py-8 text-center text-white/40 text-sm">
                Nadie esperando. Cuando el evento se llene, los jugadores pueden anotarse y entran automático al liberarse un cupo.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FinanceStat({ icon: Icon, label, value, sub, color }) {
  const colors = {
    emerald: 'from-emerald-500/20 border-emerald-400/30 text-emerald-300',
    amber:   'from-amber-500/20 border-amber-400/30 text-amber-300',
    cyan:    'from-cyan-500/20 border-cyan-400/30 text-cyan-300',
  };
  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl bg-gradient-to-br ${colors[color]} to-slate-900/30 border p-4`}>
      <Icon size={16} className="mb-2" />
      <div className="font-display text-2xl font-black font-mono tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-white/50 font-bold mt-1">{label} · {sub}</div>
    </motion.div>
  );
}

function PayChip({ status }) {
  const map = {
    PAID:      'bg-emerald-500/15 text-emerald-300 border-emerald-400/30',
    PENDING:   'bg-amber-500/15 text-amber-300 border-amber-400/30',
    REFUNDED:  'bg-cyan-500/15 text-cyan-300 border-cyan-400/30',
    CANCELLED: 'bg-rose-500/15 text-rose-300 border-rose-400/30',
  };
  const labels = { PAID: 'Pagado', PENDING: 'Pendiente', REFUNDED: 'Reembolsado', CANCELLED: 'Cancelado' };
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full border font-bold shrink-0 ${map[status] || map.PENDING}`}>
      {labels[status] || status}
    </span>
  );
}
