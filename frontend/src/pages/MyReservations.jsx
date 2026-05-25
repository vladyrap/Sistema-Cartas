import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Sparkles, Package, X, Clock, Check, CreditCard, Ban } from 'lucide-react';
import Layout from '../components/Layout';
import { useAuth } from '../lib/useAuth';
import { api } from '../lib/api';

const STATUS_META = {
  PENDING: { label: 'Pendiente', icon: Clock, cls: 'bg-elite-violet/10 text-elite-violet border-elite-violet/30' },
  APPROVED: { label: 'Aprobada', icon: Check, cls: 'bg-elite-blue/10 text-elite-blue border-elite-blue/30' },
  PAID: { label: 'Pagada', icon: CreditCard, cls: 'bg-green-500/10 text-green-300 border-green-500/30' },
  REJECTED: { label: 'Rechazada', icon: X, cls: 'bg-rose-500/10 text-rose-300 border-rose-500/30' },
  EXPIRED: { label: 'Expirada', icon: Clock, cls: 'bg-white/5 text-white/40 border-white/10' },
  CANCELLED: { label: 'Cancelada', icon: Ban, cls: 'bg-white/5 text-white/40 border-white/10' },
};

export default function MyReservations() {
  const { isAuthed, loading } = useAuth();
  const [rows, setRows] = useState([]);
  const [fetching, setFetching] = useState(true);

  async function load() {
    setFetching(true);
    try {
      const { data } = await api.get('/reservations/me');
      setRows(data);
    } finally {
      setFetching(false);
    }
  }

  useEffect(() => { if (isAuthed) load(); }, [isAuthed]);

  if (loading) return <Layout><div className="p-10 text-white/40">Cargando…</div></Layout>;
  if (!isAuthed) return <Navigate to="/login" replace />;

  async function cancel(id) {
    if (!confirm('¿Cancelar esta reserva? Se libera el stock al producto.')) return;
    try {
      await api.post(`/reservations/me/${id}/cancel`);
      toast.success('Reserva cancelada');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo cancelar');
    }
  }

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-6 py-10">
        <header className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-elite-blue/10 border border-elite-blue/30 mb-3">
            <Sparkles size={12} className="text-elite-blue" />
            <span className="text-[10px] tracking-widest uppercase text-elite-blue">Mis reservas</span>
          </div>
          <h1 className="font-display text-3xl font-bold">Reservas y preventas</h1>
        </header>

        {fetching ? (
          <p className="text-white/40">Cargando…</p>
        ) : rows.length === 0 ? (
          <div className="p-8 rounded-2xl bg-bg-surface border border-bg-border text-center">
            <Package size={28} className="mx-auto text-white/30 mb-3" />
            <p className="text-white/60">Aún no tienes reservas.</p>
            <a href="/catalog" className="inline-block mt-4 text-sm text-elite-blue hover:underline">Ir al catálogo →</a>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map(({ reservation: r, product: p }) => {
              const meta = STATUS_META[r.status];
              const Icon = meta.icon;
              const canCancel = r.status === 'PENDING' || r.status === 'APPROVED';
              return (
                <div key={r.id} className="p-4 rounded-xl bg-bg-surface border border-bg-border flex items-center gap-4 flex-wrap">
                  <div className="w-12 h-12 rounded-md bg-bg-elevated flex items-center justify-center flex-shrink-0">
                    <Package size={18} className="text-white/40" />
                  </div>
                  <div className="flex-grow min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold truncate">{p.name}</p>
                      <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border ${meta.cls}`}>
                        <Icon size={10} /> {meta.label}
                      </span>
                    </div>
                    <p className="text-xs text-white/40 mt-0.5 font-mono">
                      x{r.quantity} · ${(p.price_clp * r.quantity).toLocaleString('es-CL')} CLP · #{r.id}
                    </p>
                    {r.note && <p className="text-xs text-white/50 mt-1 italic">"{r.note}"</p>}
                    {r.expires_at && r.status === 'PENDING' && (
                      <p className="text-[10px] text-white/40 mt-1">
                        Expira: {new Date(r.expires_at).toLocaleString('es-CL')}
                      </p>
                    )}
                  </div>
                  {canCancel && (
                    <button
                      onClick={() => cancel(r.id)}
                      className="text-xs px-3 py-1.5 rounded-md bg-white/5 border border-white/10 hover:bg-rose-500/10 hover:text-rose-300 hover:border-rose-500/30 transition"
                    >
                      Cancelar
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
