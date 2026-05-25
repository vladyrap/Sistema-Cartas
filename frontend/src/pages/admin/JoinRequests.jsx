import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { UserPlus, Check, X, Clock } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import { api } from '../../lib/api';
import { useGuild } from '../../lib/useGuild';

export default function AdminJoinRequests() {
  const { current } = useGuild();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(null);
  const [decisionFor, setDecisionFor] = useState(null); // {request, kind: 'approve'|'reject'}
  const [note, setNote] = useState('');

  async function load() {
    if (!current) return;
    setLoading(true);
    try {
      const r = await api.get(`/guilds/${current.guild.id}/join-requests`);
      setItems(r.data);
    } finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [current?.guild?.id]);

  function openDecision(req, kind) {
    setDecisionFor({ request: req, kind });
    setNote('');
  }

  async function submitDecision() {
    if (!decisionFor) return;
    setActing(decisionFor.request.id);
    const url = decisionFor.kind === 'approve'
      ? `/guilds/join-requests/${decisionFor.request.id}/approve`
      : `/guilds/join-requests/${decisionFor.request.id}/reject`;
    try {
      await api.post(url, { note: note || null });
      toast.success(decisionFor.kind === 'approve' ? 'Solicitud aprobada' : 'Solicitud rechazada');
      setDecisionFor(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setActing(null); }
  }

  return (
    <AdminLayout
      title="Solicitudes de ingreso"
      subtitle={current ? `Pendientes en ${current.guild.name}` : 'Selecciona un Gremio'}
    >
      {!current ? (
        <p className="text-white/40 text-sm">Selecciona un Gremio en el selector superior.</p>
      ) : loading ? (
        <p className="text-white/40 text-sm">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="p-10 rounded-2xl bg-bg-surface border border-bg-border text-center">
          <UserPlus size={32} className="mx-auto text-white/30 mb-3" />
          <p className="text-white/60">No hay solicitudes pendientes.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((it) => (
            <motion.div
              key={it.request.id}
              initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
              className="p-4 rounded-xl bg-bg-surface border border-bg-border flex items-start gap-4"
            >
              <div className="w-10 h-10 rounded-lg bg-elite-violet/15 border border-elite-violet/30 flex items-center justify-center flex-shrink-0">
                <UserPlus size={16} className="text-elite-violet" />
              </div>
              <div className="flex-grow min-w-0">
                <div className="flex items-baseline gap-2 flex-wrap">
                  <p className="font-semibold">{it.user_alias || it.user_email}</p>
                  {it.user_elite_id && <span className="font-mono text-[10px] text-white/40">{it.user_elite_id}</span>}
                  <span className="inline-flex items-center gap-1 text-[10px] text-amber-300 ml-auto sm:ml-0">
                    <Clock size={10} /> {it.request.created_at ? new Date(it.request.created_at).toLocaleString('es-CL') : '—'}
                  </span>
                </div>
                <p className="text-xs text-white/50 mt-0.5">{it.user_email}</p>
                {it.request.message && (
                  <p className="mt-2 text-sm text-white/80 leading-snug bg-bg-elevated/40 p-3 rounded-lg border border-white/5">
                    "{it.request.message}"
                  </p>
                )}
              </div>
              <div className="flex flex-col gap-1.5 flex-shrink-0">
                <button
                  onClick={() => openDecision(it.request, 'approve')}
                  disabled={acting === it.request.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 text-xs disabled:opacity-50"
                >
                  <Check size={12} /> Aprobar
                </button>
                <button
                  onClick={() => openDecision(it.request, 'reject')}
                  disabled={acting === it.request.id}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20 text-xs disabled:opacity-50"
                >
                  <X size={12} /> Rechazar
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* Decision modal */}
      {decisionFor && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setDecisionFor(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md p-5 rounded-2xl bg-bg-surface border border-bg-border">
            <h3 className="font-display font-semibold mb-3">
              {decisionFor.kind === 'approve' ? 'Aprobar solicitud' : 'Rechazar solicitud'}
            </h3>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={decisionFor.kind === 'approve' ? 'Mensaje de bienvenida (opcional)' : 'Razón del rechazo (opcional)'}
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border text-sm placeholder:text-white/30 focus:outline-none focus:border-elite-violet/60 resize-none"
            />
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setDecisionFor(null)} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm">
                Cancelar
              </button>
              <button
                onClick={submitDecision}
                disabled={acting !== null}
                className={`px-4 py-2 rounded-lg text-white text-sm disabled:opacity-50 ${
                  decisionFor.kind === 'approve' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'
                }`}
              >
                {acting !== null ? 'Procesando…' : (decisionFor.kind === 'approve' ? 'Confirmar aprobación' : 'Confirmar rechazo')}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
