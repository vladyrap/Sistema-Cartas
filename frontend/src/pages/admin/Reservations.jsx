import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Shield, Check, X, CreditCard, Clock, Filter, AlertTriangle, Crown, Sparkles } from 'lucide-react';
import Layout from '../../components/Layout';
import { useAuth } from '../../lib/useAuth';
import { api } from '../../lib/api';

const STATUSES = ['PENDING', 'APPROVED', 'PAID', 'REJECTED', 'EXPIRED', 'CANCELLED'];
const STATUS_CLS = {
  PENDING: 'bg-elite-violet/10 text-elite-violet border-elite-violet/30',
  APPROVED: 'bg-elite-blue/10 text-elite-blue border-elite-blue/30',
  PAID: 'bg-green-500/10 text-green-300 border-green-500/30',
  REJECTED: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  EXPIRED: 'bg-white/5 text-white/40 border-white/10',
  CANCELLED: 'bg-white/5 text-white/40 border-white/10',
};
const ACCESS_CLS = {
  NORMAL: 'text-white/60',
  ELITE_ACCESS: 'text-elite-blue',
  ELITE_PRO: 'text-elite-gold',
};

export default function AdminReservations() {
  const { user, loading: authLoading, isAuthed } = useAuth();
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('PENDING');
  const [fetching, setFetching] = useState(true);

  async function load() {
    setFetching(true);
    try {
      const params = filter === 'ALL' ? {} : { status: filter };
      const { data } = await api.get('/admin/reservations', { params });
      setRows(data);
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => {
    if (isAuthed && user?.role === 'ADMIN') load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAuthed, user, filter]);

  if (authLoading) return <Layout><div className="p-10 text-white/40">Cargando…</div></Layout>;
  if (!isAuthed) return <Navigate to="/login" replace />;
  if (user?.role !== 'ADMIN') return <Layout><div className="p-10 text-rose-400">Acceso solo para administradores.</div></Layout>;

  async function action(id, kind, label) {
    try {
      await api.post(`/admin/reservations/${id}/${kind}`);
      toast.success(label);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  }

  async function expireOverdue() {
    try {
      const { data } = await api.post('/admin/reservations/expire-overdue');
      toast.success(`${data.expired} reservas expiradas y stock devuelto`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  }

  const counts = rows.reduce((acc, r) => {
    acc[r.reservation.status] = (acc[r.reservation.status] || 0) + 1;
    return acc;
  }, {});

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-6 py-10">
        <header className="mb-8 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-elite-gold/10 border border-elite-gold/30 mb-3">
              <Shield size={12} className="text-elite-gold" />
              <span className="text-[10px] tracking-widest uppercase text-elite-gold">Panel admin</span>
            </div>
            <h1 className="font-display text-3xl font-bold">Reservas</h1>
            <p className="text-white/50 mt-1 text-sm">Aprobar, rechazar, marcar como pagadas o expirar las vencidas.</p>
          </div>
          <button
            onClick={expireOverdue}
            className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-xs flex items-center gap-2"
          >
            <Clock size={14} /> Expirar vencidas
          </button>
        </header>

        <div className="mb-5 flex flex-wrap items-center gap-2">
          <div className="text-xs text-white/40 flex items-center gap-1.5"><Filter size={12} /> Filtrar:</div>
          {['ALL', ...STATUSES].map((s) => (
            <button
              key={s}
              onClick={() => setFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs border transition ${
                filter === s ? 'bg-elite-violet/15 text-elite-violet border-elite-violet/40' : 'bg-white/5 text-white/60 border-white/10 hover:bg-white/10'
              }`}
            >
              {s === 'ALL' ? 'Todas' : s} {counts[s] ? `· ${counts[s]}` : ''}
            </button>
          ))}
        </div>

        {fetching ? (
          <p className="text-white/40">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="text-white/40">Sin reservas con ese filtro.</p>
        ) : (
          <div className="rounded-2xl border border-bg-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg-elevated/60 text-[10px] uppercase tracking-widest text-white/50">
                <tr>
                  <th className="text-left px-4 py-3">#</th>
                  <th className="text-left px-4 py-3">Jugador</th>
                  <th className="text-left px-4 py-3">Producto</th>
                  <th className="text-left px-4 py-3">Cant</th>
                  <th className="text-left px-4 py-3">Nivel</th>
                  <th className="text-left px-4 py-3">Estado</th>
                  <th className="text-right px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bg-border">
                {rows.map(({ reservation: r, product_name, product_access, player_alias, player_elite_id, player_level }) => (
                  <tr key={r.id} className="bg-bg-surface hover:bg-bg-elevated/50">
                    <td className="px-4 py-3 font-mono text-white/40">#{r.id}</td>
                    <td className="px-4 py-3">
                      <p className="font-semibold text-white">{player_alias}</p>
                      <p className="font-mono text-[10px] text-white/40">{player_elite_id}</p>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-white truncate max-w-[200px]">{product_name}</p>
                      <span className={`text-[10px] font-mono ${ACCESS_CLS[product_access]}`}>
                        {product_access === 'ELITE_PRO' && <Crown size={10} className="inline mr-1" />}
                        {product_access === 'ELITE_ACCESS' && <Sparkles size={10} className="inline mr-1" />}
                        {product_access}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono">{r.quantity}</td>
                    <td className="px-4 py-3 font-mono text-white/70">{player_level ?? '—'}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex text-[10px] px-2 py-0.5 rounded border ${STATUS_CLS[r.status]}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      {r.status === 'PENDING' && (
                        <>
                          <button onClick={() => action(r.id, 'approve', 'Aprobada')}
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-elite-blue/10 text-elite-blue border border-elite-blue/30 hover:bg-elite-blue/20">
                            <Check size={11} /> Aprobar
                          </button>
                          <button onClick={() => action(r.id, 'reject', 'Rechazada')}
                            className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20">
                            <X size={11} /> Rechazar
                          </button>
                        </>
                      )}
                      {(r.status === 'PENDING' || r.status === 'APPROVED') && (
                        <button onClick={() => action(r.id, 'mark-paid', 'Marcada como pagada')}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded bg-green-500/10 text-green-300 border border-green-500/30 hover:bg-green-500/20">
                          <CreditCard size={11} /> Pagada
                        </button>
                      )}
                      {!['PENDING', 'APPROVED'].includes(r.status) && (
                        <span className="text-xs text-white/30">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Layout>
  );
}
