import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Edit3, Trash2, Gamepad2, Check, X } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import AdminFormModal, { Field, Input, Textarea, Toggle } from '../../components/AdminFormModal';
import { api } from '../../lib/api';

const EMPTY = { code: '', name: '', short_name: '', logo_url: '', description: '', is_active: true };

export default function AdminGames() {
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try { setItems((await api.get('/admin/games')).data); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing('new'); setForm(EMPTY); }
  function openEdit(g) {
    setEditing(g.id);
    setForm({
      code: g.code, name: g.name, short_name: g.short_name || '', logo_url: g.logo_url || '',
      description: g.description || '', is_active: g.is_active,
    });
  }

  async function submit() {
    setSaving(true);
    try {
      if (editing === 'new') {
        await api.post('/admin/games', form);
        toast.success('Juego creado');
      } else {
        const { code, ...payload } = form;
        await api.patch(`/admin/games/${editing}`, payload);
        toast.success('Juego actualizado');
      }
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function remove(id) {
    if (!confirm('¿Eliminar juego? No se puede si tiene eventos o productos asociados.')) return;
    try { await api.delete(`/admin/games/${id}`); toast.success('Juego eliminado'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  }

  return (
    <AdminLayout
      title="Juegos"
      subtitle="Catálogo de TCG soportados por la plataforma."
      actions={
        <button onClick={openNew} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white font-medium hover:shadow-glow-violet transition text-sm">
          <Plus size={14} /> Nuevo juego
        </button>
      }
    >
      {loading ? <p className="text-white/40">Cargando…</p> : items.length === 0 ? (
        <div className="p-10 rounded-2xl bg-bg-surface border border-bg-border text-center">
          <Gamepad2 size={32} className="mx-auto text-white/30 mb-3" />
          <p className="text-white/60">Sin juegos aún.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-bg-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-elevated/60 text-[10px] uppercase tracking-widest text-white/50">
              <tr>
                <th className="text-left px-4 py-3">Código</th>
                <th className="text-left px-4 py-3">Nombre</th>
                <th className="text-left px-4 py-3">Short</th>
                <th className="text-left px-4 py-3">Activo</th>
                <th className="text-right px-4 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg-border">
              {items.map((g) => (
                <tr key={g.id} className="bg-bg-surface hover:bg-bg-elevated/50">
                  <td className="px-4 py-3 font-mono text-xs text-white/60">{g.code}</td>
                  <td className="px-4 py-3 font-semibold">{g.name}</td>
                  <td className="px-4 py-3 text-white/60">{g.short_name || '—'}</td>
                  <td className="px-4 py-3">
                    {g.is_active ? <Check size={14} className="text-emerald-300" /> : <X size={14} className="text-rose-300" />}
                  </td>
                  <td className="px-4 py-3 text-right space-x-1">
                    <button onClick={() => openEdit(g)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10">
                      <Edit3 size={11} /> Editar
                    </button>
                    <button onClick={() => remove(g.id)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20">
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
        title={editing === 'new' ? 'Nuevo juego' : 'Editar juego'}
        onClose={() => setEditing(null)}
        onSubmit={submit}
        submitting={saving}
      >
        <Field label="Código (único, sin espacios)" hint="No se puede cambiar después.">
          <Input value={form.code} disabled={editing !== 'new'}
            onChange={(e) => setForm({ ...form, code: e.target.value })} required placeholder="one_piece" />
        </Field>
        <Field label="Nombre">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="One Piece Card Game" />
        </Field>
        <Field label="Nombre corto">
          <Input value={form.short_name} onChange={(e) => setForm({ ...form, short_name: e.target.value })} placeholder="One Piece" />
        </Field>
        <Field label="URL logo">
          <Input value={form.logo_url} onChange={(e) => setForm({ ...form, logo_url: e.target.value })} placeholder="https://…" />
        </Field>
        <Field label="Descripción">
          <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Toggle label="Activo" checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} />
      </AdminFormModal>
    </AdminLayout>
  );
}
