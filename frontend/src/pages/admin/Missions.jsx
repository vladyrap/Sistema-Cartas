import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Edit3, Trash2, Zap, Check, X } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import AdminFormModal, { Field, Input, Select, Textarea, Toggle } from '../../components/AdminFormModal';
import { api } from '../../lib/api';

const EMPTY = {
  code: '', name: '', description: '', exp_reward: 100,
  is_weekly: false, is_active: true, season_id: '',
};

export default function AdminMissions() {
  const [items, setItems] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [m, s] = await Promise.all([api.get('/admin/missions'), api.get('/seasons')]);
      setItems(m.data);
      setSeasons(s.data);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing('new'); setForm(EMPTY); }
  function openEdit(m) {
    setEditing(m.id);
    setForm({
      code: m.code, name: m.name, description: m.description || '',
      exp_reward: m.exp_reward, is_weekly: m.is_weekly, is_active: m.is_active,
      season_id: m.season_id ?? '',
    });
  }

  async function submit() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        exp_reward: parseInt(form.exp_reward),
        season_id: form.season_id ? parseInt(form.season_id) : null,
        description: form.description || null,
      };
      if (editing === 'new') {
        await api.post('/admin/missions', payload);
        toast.success('Misión creada');
      } else {
        const { code, ...rest } = payload;
        await api.patch(`/admin/missions/${editing}`, rest);
        toast.success('Misión actualizada');
      }
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setSaving(false); }
  }

  async function remove(id) {
    if (!confirm('¿Eliminar misión? Si tiene PlayerMissions activas, considera desactivarla.')) return;
    try { await api.delete(`/admin/missions/${id}`); toast.success('Eliminada'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  }

  return (
    <AdminLayout
      title="Misiones"
      subtitle="Misiones semanales y de temporada con EXP de recompensa."
      actions={
        <button onClick={openNew} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white font-medium hover:shadow-glow-violet transition text-sm">
          <Plus size={14} /> Nueva misión
        </button>
      }
    >
      {loading ? <p className="text-white/40">Cargando…</p> : items.length === 0 ? (
        <div className="p-10 rounded-2xl bg-bg-surface border border-bg-border text-center">
          <Zap size={32} className="mx-auto text-white/30 mb-3" />
          <p className="text-white/60">Sin misiones aún.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-bg-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-elevated/60 text-[10px] uppercase tracking-widest text-white/50">
              <tr>
                <th className="text-left px-3 py-3">Código</th>
                <th className="text-left px-3 py-3">Nombre</th>
                <th className="text-left px-3 py-3">Tipo</th>
                <th className="text-left px-3 py-3">EXP</th>
                <th className="text-left px-3 py-3">Temporada</th>
                <th className="text-left px-3 py-3">Activa</th>
                <th className="text-right px-3 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg-border">
              {items.map((m) => (
                <tr key={m.id} className="bg-bg-surface hover:bg-bg-elevated/50">
                  <td className="px-3 py-2 font-mono text-xs text-white/60">{m.code}</td>
                  <td className="px-3 py-2">
                    <p className="font-semibold">{m.name}</p>
                    {m.description && <p className="text-[10px] text-white/40 mt-0.5">{m.description}</p>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded border ${
                      m.is_weekly ? 'bg-elite-blue/10 text-elite-blue border-elite-blue/30' : 'bg-elite-violet/10 text-elite-violet border-elite-violet/30'
                    }`}>
                      {m.is_weekly ? 'Semanal' : 'Temporada'}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-elite-gold">+{m.exp_reward}</td>
                  <td className="px-3 py-2 font-mono text-xs">{m.season_id ? `T${m.season_id}` : 'Global'}</td>
                  <td className="px-3 py-2">
                    {m.is_active ? <Check size={14} className="text-emerald-300" /> : <X size={14} className="text-rose-300" />}
                  </td>
                  <td className="px-3 py-2 text-right space-x-1">
                    <button onClick={() => openEdit(m)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10">
                      <Edit3 size={11} />
                    </button>
                    <button onClick={() => remove(m.id)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20">
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
        title={editing === 'new' ? 'Nueva misión' : 'Editar misión'}
        onClose={() => setEditing(null)}
        onSubmit={submit}
        submitting={saving}
      >
        <Field label="Código (único, sin espacios)" hint="No se puede cambiar después.">
          <Input value={form.code} disabled={editing !== 'new'}
            onChange={(e) => setForm({ ...form, code: e.target.value })} required placeholder="weekly_3_events" />
        </Field>
        <Field label="Nombre">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Asiste a 3 eventos esta semana" />
        </Field>
        <Field label="Descripción">
          <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="EXP de recompensa">
            <Input type="number" min={0} value={form.exp_reward} onChange={(e) => setForm({ ...form, exp_reward: e.target.value })} />
          </Field>
          <Field label="Temporada (vacío = global)">
            <Select value={form.season_id} onChange={(e) => setForm({ ...form, season_id: e.target.value })}>
              <option value="">— Global —</option>
              {seasons.map((s) => <option key={s.id} value={s.id}>T{s.number} · {s.name}</option>)}
            </Select>
          </Field>
        </div>
        <div className="flex items-center gap-6">
          <Toggle label="Semanal" checked={form.is_weekly} onChange={(v) => setForm({ ...form, is_weekly: v })} />
          <Toggle label="Activa" checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} />
        </div>
      </AdminFormModal>
    </AdminLayout>
  );
}
