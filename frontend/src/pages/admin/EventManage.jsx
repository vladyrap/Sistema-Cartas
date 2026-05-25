import { useEffect, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Shield, Zap, Check, X, Clock, Trophy, Save } from 'lucide-react';
import Layout from '../../components/Layout';
import { useAuth } from '../../lib/useAuth';
import { api } from '../../lib/api';

const ATTENDANCE_OPTIONS = [
  { value: 'PENDING', label: 'Pendiente', cls: 'bg-white/5 text-white/60 border-white/10', Icon: Clock },
  { value: 'ATTENDED', label: 'Asistió', cls: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30', Icon: Check },
  { value: 'NO_SHOW', label: 'No vino', cls: 'bg-rose-500/10 text-rose-300 border-rose-500/30', Icon: X },
];
const PAYMENT_OPTIONS = ['PENDING', 'PAID', 'CANCELLED', 'REFUNDED'];

export default function AdminEventManage() {
  const { id } = useParams();
  const { user, loading: authLoading, isAuthed } = useAuth();
  const [event, setEvent] = useState(null);
  const [regs, setRegs] = useState([]);
  const [edits, setEdits] = useState({}); // {reg_id: {final_position, rounds_won, rounds_lost}}
  const [saving, setSaving] = useState(false);

  async function load() {
    const [ev, r] = await Promise.all([
      api.get(`/events/${id}`),
      api.get(`/admin/events/${id}/registrations`),
    ]);
    setEvent(ev.data);
    setRegs(r.data);
    setEdits(Object.fromEntries(
      r.data.map((row) => [row.registration.id, {
        final_position: row.registration.final_position ?? '',
        rounds_won: row.registration.rounds_won ?? 0,
        rounds_lost: row.registration.rounds_lost ?? 0,
      }])
    ));
  }

  useEffect(() => {
    if (isAuthed && user?.role === 'ADMIN') load().catch((e) => toast.error(e.response?.data?.detail || 'Error'));
    // eslint-disable-next-line
  }, [id, isAuthed, user]);

  if (authLoading) return <Layout><div className="p-10 text-white/40">Cargando…</div></Layout>;
  if (!isAuthed) return <Navigate to="/login" replace />;
  if (user?.role !== 'ADMIN') return <Layout><div className="p-10 text-rose-400">Acceso solo para administradores.</div></Layout>;

  async function setAttendance(regId, value) {
    try {
      await api.post(`/admin/events/registrations/${regId}/attendance`, { attendance_status: value });
      toast.success('Asistencia actualizada');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  }

  async function setPayment(regId, value) {
    try {
      await api.post(`/admin/events/registrations/${regId}/payment`, { payment_status: value });
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  }

  async function saveResults() {
    setSaving(true);
    try {
      const results = regs.map((row) => {
        const e = edits[row.registration.id] || {};
        const pos = e.final_position === '' || e.final_position == null ? null : parseInt(e.final_position);
        return {
          player_id: row.registration.player_id,
          final_position: Number.isNaN(pos) ? null : pos,
          rounds_won: parseInt(e.rounds_won) || 0,
          rounds_lost: parseInt(e.rounds_lost) || 0,
        };
      });
      await api.post(`/admin/events/${id}/results`, { results });
      toast.success('Resultados guardados');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al guardar');
    } finally {
      setSaving(false);
    }
  }

  async function awardExp() {
    if (!confirm('¿Asignar EXP automática a todos los inscritos? Esta acción no se puede deshacer fácilmente.')) return;
    try {
      const { data } = await api.post(`/admin/events/${id}/award-exp`);
      toast.success(`EXP asignada · ${data.players_awarded} jugadores · ${data.total_exp_distributed} EXP totales`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al asignar EXP');
    }
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-6 py-10">
        <Link to="/events" className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white mb-6">
          <ArrowLeft size={14} /> Volver a eventos
        </Link>

        {!event ? (
          <p className="text-white/40">Cargando…</p>
        ) : (
          <>
            <header className="mb-8">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-elite-gold/10 border border-elite-gold/30 mb-3">
                <Shield size={12} className="text-elite-gold" />
                <span className="text-[10px] tracking-widest uppercase text-elite-gold">Gestión de evento</span>
              </div>
              <div className="flex items-start justify-between gap-4 flex-wrap">
                <div>
                  <h1 className="font-display text-3xl font-bold">{event.name}</h1>
                  <p className="text-white/50 mt-1 text-sm">
                    {new Date(event.starts_at).toLocaleString('es-CL')} · {event.registered_count}/{event.slots} inscritos · Estado <span className="font-mono">{event.status}</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={saveResults} disabled={saving}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm transition disabled:opacity-50">
                    <Save size={14} /> {saving ? 'Guardando…' : 'Guardar resultados'}
                  </button>
                  <button onClick={awardExp}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white text-sm font-semibold hover:shadow-glow-violet transition">
                    <Zap size={14} /> Asignar EXP automática
                  </button>
                </div>
              </div>
            </header>

            {regs.length === 0 ? (
              <p className="text-white/40">Aún no hay inscritos en este evento.</p>
            ) : (
              <div className="rounded-2xl border border-bg-border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-bg-elevated/60 text-[10px] uppercase tracking-widest text-white/50">
                    <tr>
                      <th className="text-left px-3 py-3">Jugador</th>
                      <th className="text-left px-3 py-3">Nivel</th>
                      <th className="text-left px-3 py-3">Asistencia</th>
                      <th className="text-left px-3 py-3">Pago</th>
                      <th className="text-left px-3 py-3">Pos.</th>
                      <th className="text-left px-3 py-3">W</th>
                      <th className="text-left px-3 py-3">L</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-bg-border">
                    {regs.map(({ registration: r, player_alias, player_elite_id, player_level }) => (
                      <tr key={r.id} className="bg-bg-surface hover:bg-bg-elevated/50">
                        <td className="px-3 py-2">
                          <p className="font-semibold">{player_alias}</p>
                          <p className="font-mono text-[10px] text-white/40">{player_elite_id}</p>
                        </td>
                        <td className="px-3 py-2 font-mono text-white/70">{player_level ?? '—'}</td>
                        <td className="px-3 py-2">
                          <div className="flex gap-1">
                            {ATTENDANCE_OPTIONS.map(({ value, label, cls, Icon }) => (
                              <button key={value} onClick={() => setAttendance(r.id, value)}
                                title={label}
                                className={`p-1.5 rounded border ${r.attendance_status === value ? cls : 'bg-white/3 text-white/30 border-white/5 hover:bg-white/10'}`}>
                                <Icon size={12} />
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="px-3 py-2">
                          <select value={r.payment_status} onChange={(e) => setPayment(r.id, e.target.value)}
                            className="px-2 py-1 rounded bg-bg-elevated border border-bg-border text-xs">
                            {PAYMENT_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min={1} placeholder="—"
                            value={edits[r.id]?.final_position ?? ''}
                            onChange={(e) => setEdits((s) => ({ ...s, [r.id]: { ...s[r.id], final_position: e.target.value } }))}
                            className="w-16 px-2 py-1 rounded bg-bg-elevated border border-bg-border text-sm font-mono text-center" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min={0}
                            value={edits[r.id]?.rounds_won ?? 0}
                            onChange={(e) => setEdits((s) => ({ ...s, [r.id]: { ...s[r.id], rounds_won: e.target.value } }))}
                            className="w-14 px-2 py-1 rounded bg-bg-elevated border border-bg-border text-sm font-mono text-center" />
                        </td>
                        <td className="px-3 py-2">
                          <input type="number" min={0}
                            value={edits[r.id]?.rounds_lost ?? 0}
                            onChange={(e) => setEdits((s) => ({ ...s, [r.id]: { ...s[r.id], rounds_lost: e.target.value } }))}
                            className="w-14 px-2 py-1 rounded bg-bg-elevated border border-bg-border text-sm font-mono text-center" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="mt-6 p-4 rounded-2xl bg-elite-violet/5 border border-elite-violet/20 text-xs text-white/60 leading-relaxed">
              <p className="font-semibold text-elite-violet mb-1 flex items-center gap-1"><Trophy size={12} /> Cómo funciona la EXP</p>
              <p>Asistió +100 · No-show -100 · Cada ronda ganada +50 · Top 8 +200 · Top 4 +300 · Finalista +400 · Campeón +600. La EXP se asigna al hacer click en "Asignar EXP automática". El sistema impide doble crédito por evento.</p>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
