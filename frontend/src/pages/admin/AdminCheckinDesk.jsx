import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft, Camera, CheckCircle2, Users, UserCheck, UserX, Clock,
  Loader2, ScanLine, Search,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/Navbar';
import AuthGuard from '../../components/AuthGuard';
import { api } from '../../lib/api';

export default function AdminCheckinDesk() {
  return (
    <AuthGuard feature="la mesa de check-in del torneo" returnUrl={window.location.pathname} accent="cyan">
      <DeskContent />
    </AuthGuard>
  );
}

function DeskContent() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [registrations, setRegistrations] = useState([]);
  const [filter, setFilter] = useState('');
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [autoNoShowBusy, setAutoNoShowBusy] = useState(false);
  const [lockBusy, setLockBusy] = useState(false);

  const load = async () => {
    try {
      const [ev, regs] = await Promise.all([
        api.get(`/events/${id}`),
        api.get(`/admin/events/${id}/registrations`),
      ]);
      setEvent(ev.data);
      // Backend devuelve {registration, player_alias, ...} — aplanamos
      setRegistrations((regs.data || []).map(r => ({
        ...r.registration,
        player_alias: r.player_alias,
        player_elite_id: r.player_elite_id,
      })));
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo cargar');
    }
  };

  const markPaid = async (regId, alias) => {
    setBusy(true);
    try {
      await api.post(`/events/registrations/${regId}/mark-paid`);
      toast.success(`💵 ${alias} marcado pagado (efectivo)`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [id]);

  const submitToken = async (e) => {
    e?.preventDefault();
    if (!token.trim()) return;
    setBusy(true);
    try {
      const r = await api.post(`/api/tour-flow/events/${id}/checkin/qr`, { token: token.trim() });
      if (r.data.already_checked_in) {
        toast(`Ya estaba: ${r.data.player_alias}`, { icon: 'ℹ️' });
      } else {
        toast.success(`✓ ${r.data.player_alias} ingresado`);
      }
      setToken('');
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Token inválido');
    } finally {
      setBusy(false);
    }
  };

  const manualCheckin = async (playerId, alias) => {
    setBusy(true);
    try {
      await api.post(`/api/tour-flow/events/${id}/checkin/manual`, { player_id: playerId });
      toast.success(`✓ ${alias} marcado manual`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    } finally {
      setBusy(false);
    }
  };

  const autoNoShow = async () => {
    if (!confirm('Marcar como NO_SHOW a todos los inscritos que NO hicieron check-in?')) return;
    setAutoNoShowBusy(true);
    try {
      const r = await api.post(`/api/tour-flow/events/${id}/checkin/auto-noshow`);
      toast.success(`${r.data.marked_no_show} jugadores marcados NO_SHOW`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    } finally {
      setAutoNoShowBusy(false);
    }
  };

  const lockDecks = async () => {
    setLockBusy(true);
    try {
      const r = await api.post(`/api/tour-flow/events/${id}/lock-all-decks`);
      toast.success(`${r.data.decks_locked} decks bloqueados + hasheados`);
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    } finally {
      setLockBusy(false);
    }
  };

  if (!event) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="pt-24 grid place-items-center"><Loader2 className="animate-spin" /></div>
      </div>
    );
  }

  const filtered = filter
    ? registrations.filter(r =>
        (r.player_alias || '').toLowerCase().includes(filter.toLowerCase())
        || String(r.player_id).includes(filter)
      )
    : registrations;
  const checkedIn = registrations.filter(r => r.checked_in_at).length;
  const pending = registrations.length - checkedIn;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-cyan-950/20 to-slate-950 text-white">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 pt-24 pb-16 space-y-6">
        <Link to={`/admin/events/${id}`} className="flex items-center gap-2 text-white/60 hover:text-white text-sm w-fit">
          <ArrowLeft size={16} /> Manage event
        </Link>

        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-cyan-300 mb-1">Mesa de Check-in</div>
            <h1 className="text-3xl font-black">{event.name}</h1>
          </div>
          <div className="flex gap-2">
            <Link
              to={`/admin/events/${id}/finance`}
              className="px-4 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/30 border border-emerald-400/30 text-emerald-200 text-sm font-medium"
            >
              💰 Caja
            </Link>
            <button
              onClick={lockDecks}
              disabled={lockBusy}
              className="px-4 py-2 rounded-xl bg-violet-500/20 hover:bg-violet-500/30 border border-violet-400/30 text-violet-200 text-sm font-medium disabled:opacity-50"
            >
              {lockBusy ? 'Bloqueando…' : 'Lock decks (hash)'}
            </button>
            <button
              onClick={autoNoShow}
              disabled={autoNoShowBusy}
              className="px-4 py-2 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 border border-rose-400/30 text-rose-200 text-sm font-medium disabled:opacity-50"
            >
              {autoNoShowBusy ? 'Marcando…' : 'Auto NO_SHOW'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4">
          <Stat icon={Users} label="Inscritos" value={registrations.length} color="cyan" />
          <Stat icon={UserCheck} label="Check-in OK" value={checkedIn} color="emerald" />
          <Stat icon={UserX} label="Pendientes" value={pending} color="amber" />
        </div>

        <form
          onSubmit={submitToken}
          className="rounded-3xl bg-gradient-to-br from-cyan-900/30 to-slate-900/50 border border-cyan-400/30 p-5"
        >
          <div className="text-sm text-cyan-200 font-bold mb-3 flex items-center gap-2">
            <ScanLine size={18} /> Escanear QR del jugador
          </div>
          <div className="flex gap-2">
            <input
              autoFocus
              value={token}
              onChange={e => setToken(e.target.value)}
              placeholder="Pega el token aquí o usa un escáner USB"
              className="flex-1 px-4 py-3 rounded-xl bg-slate-900/70 border border-white/10 focus:border-cyan-400/60 outline-none font-mono text-sm"
            />
            <button
              type="submit"
              disabled={busy || !token.trim()}
              className="px-6 py-3 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold disabled:opacity-50"
            >
              {busy ? '…' : 'Marcar'}
            </button>
          </div>
        </form>

        <div className="rounded-3xl bg-slate-900/40 border border-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/10 flex items-center gap-2">
            <Search size={16} className="text-white/40" />
            <input
              placeholder="Filtrar por alias o ID…"
              value={filter}
              onChange={e => setFilter(e.target.value)}
              className="flex-1 bg-transparent outline-none text-sm"
            />
            <span className="text-xs text-white/50">{filtered.length}</span>
          </div>
          <div className="divide-y divide-white/5 max-h-[500px] overflow-y-auto">
            {filtered.map(r => (
              <div key={r.id} className="px-4 py-3 flex items-center gap-3 hover:bg-white/5 transition">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{r.player_alias || `#${r.player_id}`}</div>
                  <div className="text-xs text-white/40 truncate font-mono">{r.player_elite_id}</div>
                </div>
                <PaymentChip status={r.payment_status} />
                {r.payment_status === 'PENDING' && (
                  <button
                    onClick={() => markPaid(r.id, r.player_alias)}
                    disabled={busy}
                    className="px-2.5 py-1.5 rounded-lg bg-amber-500/15 hover:bg-amber-500/30 text-amber-200 text-xs font-bold disabled:opacity-50"
                    title="Pagó en efectivo / transferencia"
                  >
                    💵 Pagado
                  </button>
                )}
                {r.checked_in_at ? (
                  <div className="flex items-center gap-1 text-emerald-300 text-xs font-bold">
                    <CheckCircle2 size={14} />
                    {new Date(r.checked_in_at).toLocaleTimeString('es-CL', { timeStyle: 'short' })}
                    {r.checkin_method === 'qr' && <Camera size={12} className="text-cyan-400" />}
                  </div>
                ) : (
                  <button
                    onClick={() => manualCheckin(r.player_id, r.player_alias)}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg bg-white/10 hover:bg-emerald-500/30 text-xs font-medium disabled:opacity-50"
                  >
                    Check-in
                  </button>
                )}
              </div>
            ))}
            {!filtered.length && (
              <div className="px-4 py-12 text-center text-white/40 text-sm">Sin resultados</div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function PaymentChip({ status }) {
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

function Stat({ icon: Icon, label, value, color }) {
  const colors = {
    cyan: 'from-cyan-500/20 border-cyan-400/30 text-cyan-300',
    emerald: 'from-emerald-500/20 border-emerald-400/30 text-emerald-300',
    amber: 'from-amber-500/20 border-amber-400/30 text-amber-300',
  };
  return (
    <div className={`rounded-2xl bg-gradient-to-br ${colors[color]} to-slate-900/30 border p-4`}>
      <Icon size={18} className="mb-2" />
      <div className="text-3xl font-black">{value}</div>
      <div className="text-xs uppercase tracking-wider text-white/60">{label}</div>
    </div>
  );
}
