import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Edit3, Trash2, Settings, Calendar, Users } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import AdminFormModal, { Field, Input, Select, Textarea } from '../../components/AdminFormModal';
import { api } from '../../lib/api';

const EVENT_TYPES = [
  'CASUAL', 'COMPETITIVE', 'ELITE_CHALLENGE', 'TRADE_DAY',
  'WEEKLY_LEAGUE', 'MONTHLY_LEAGUE', 'FINAL_ELITE', 'BEGINNER_EVENT', 'PREORDER_EVENT',
];
const STATUSES = ['DRAFT', 'OPEN', 'CLOSED', 'FINISHED', 'CANCELLED'];

const EMPTY = {
  name: '', game_id: '', event_type: 'CASUAL', status: 'DRAFT',
  starts_at: '', ends_at: '', slots: 16, price_clp: 0,
  description: '', rules: '', prizes: '',
};

export default function AdminEventsList() {
  const [items, setItems] = useState([]);
  const [games, setGames] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [e, g] = await Promise.all([api.get('/admin/events'), api.get('/admin/games')]);
      setItems(e.data);
      setGames(g.data);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openNew() {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    const iso = tomorrow.toISOString().slice(0, 16);
    setForm({ ...EMPTY, game_id: games[0]?.id || '', starts_at: iso });
    setEditing('new');
  }
  function openEdit(ev) {
    setEditing(ev.id);
    setForm({
      name: ev.name,
      game_id: ev.game_id,
      event_type: ev.event_type,
      status: ev.status,
      starts_at: new Date(ev.starts_at).toISOString().slice(0, 16),
      ends_at: ev.ends_at ? new Date(ev.ends_at).toISOString().slice(0, 16) : '',
      slots: ev.slots,
      price_clp: ev.price_clp,
      description: ev.description || '',
      rules: '',
      prizes: '',
    });
  }

  async function submit() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        game_id: parseInt(form.game_id),
        slots: parseInt(form.slots),
        price_clp: parseInt(form.price_clp),
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
        description: form.description || null,
        rules: form.rules || null,
        prizes: form.prizes || null,
      };
      if (editing === 'new') {
        await api.post('/admin/events', payload);
        toast.success('Evento creado');
      } else {
        await api.patch(`/admin/events/${editing}`, payload);
        toast.success('Evento actualizado');
      }
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setSaving(false); }
  }

  async function remove(id) {
    if (!confirm('¿Eliminar evento? No se puede si tiene inscritos.')) return;
    try { await api.delete(`/admin/events/${id}`); toast.success('Eliminado'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  }

  const gameOf = (id) => games.find((g) => g.id === id);

  return (
    <AdminLayout
      title="Eventos"
      subtitle="Crea, edita o elimina torneos y eventos. Para gestionar inscritos, entra al detalle."
      actions={
        <button onClick={openNew} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white font-medium hover:shadow-glow-violet transition text-sm">
          <Plus size={14} /> Nuevo evento
        </button>
      }
    >
      {loading ? <p className="text-white/40">Cargando…</p> : items.length === 0 ? (
        <div className="p-10 rounded-2xl bg-bg-surface border border-bg-border text-center">
          <Calendar size={32} className="mx-auto text-white/30 mb-3" />
          <p className="text-white/60">Sin eventos aún.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-bg-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-elevated/60 text-[10px] uppercase tracking-widest text-white/50">
              <tr>
                <th className="text-left px-3 py-3">Evento</th>
                <th className="text-left px-3 py-3">Juego</th>
                <th className="text-left px-3 py-3">Tipo</th>
                <th className="text-left px-3 py-3">Fecha</th>
                <th className="text-left px-3 py-3">Inscritos</th>
                <th className="text-left px-3 py-3">Estado</th>
                <th className="text-right px-3 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg-border">
              {items.map((ev) => (
                <tr key={ev.id} className="bg-bg-surface hover:bg-bg-elevated/50">
                  <td className="px-3 py-2 font-semibold">{ev.name}</td>
                  <td className="px-3 py-2 text-white/70 text-xs">{gameOf(ev.game_id)?.short_name || '—'}</td>
                  <td className="px-3 py-2 text-[10px] font-mono text-elite-violet">{ev.event_type}</td>
                  <td className="px-3 py-2 text-xs font-mono text-white/60">{new Date(ev.starts_at).toLocaleDateString('es-CL')}</td>
                  <td className="px-3 py-2 font-mono"><Users size={11} className="inline mr-1 text-white/40" />{ev.registered_count}/{ev.slots}</td>
                  <td className="px-3 py-2"><StatusBadge status={ev.status} /></td>
                  <td className="px-3 py-2 text-right space-x-1">
                    <Link to={`/admin/events/${ev.id}`} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-elite-blue/10 text-elite-blue border border-elite-blue/30 hover:bg-elite-blue/20">
                      <Settings size={11} /> Gestionar
                    </Link>
                    <button onClick={() => openEdit(ev)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10">
                      <Edit3 size={11} />
                    </button>
                    <button onClick={() => remove(ev.id)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20">
                      <Trash2 size={11} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <AdminFormModal
        open={editing !== null}
        title={editing === 'new' ? 'Nuevo evento' : 'Editar evento'}
        onClose={() => setEditing(null)}
        onSubmit={submit}
        submitting={saving}
        size="lg"
      >
        <Field label="Nombre">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Torneo Casual One Piece" />
        </Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Juego">
            <Select value={form.game_id} onChange={(e) => setForm({ ...form, game_id: e.target.value })} required>
              <option value="">Seleccionar…</option>
              {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </Field>
          <Field label="Tipo">
            <Select value={form.event_type} onChange={(e) => setForm({ ...form, event_type: e.target.value })}>
              {EVENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </Select>
          </Field>
          <Field label="Inicia">
            <Input type="datetime-local" value={form.starts_at} onChange={(e) => setForm({ ...form, starts_at: e.target.value })} required />
          </Field>
          <Field label="Termina (opcional)">
            <Input type="datetime-local" value={form.ends_at} onChange={(e) => setForm({ ...form, ends_at: e.target.value })} />
          </Field>
          <Field label="Cupos">
            <Input type="number" min={1} value={form.slots} onChange={(e) => setForm({ ...form, slots: e.target.value })} required />
          </Field>
          <Field label="Precio CLP">
            <Input type="number" min={0} value={form.price_clp} onChange={(e) => setForm({ ...form, price_clp: e.target.value })} />
          </Field>
          <Field label="Estado">
            <Select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Descripción">
          <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
      </AdminFormModal>
    </AdminLayout>
  );
}

function StatusBadge({ status }) {
  const map = {
    DRAFT: 'bg-white/5 text-white/60 border-white/10',
    OPEN: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    CLOSED: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    FINISHED: 'bg-elite-gold/10 text-elite-gold border-elite-gold/30',
    CANCELLED: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  };
  return <span className={`text-[10px] px-2 py-0.5 rounded border ${map[status]}`}>{status}</span>;
}
