import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Megaphone, Plus, Edit3, Trash2, Pin } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import AdminFormModal, { Field, Input, Textarea, Toggle } from '../../components/AdminFormModal';
import { api } from '../../lib/api';
import { useGuild } from '../../lib/useGuild';

const EMPTY = { title: '', body: '', is_pinned: true, expires_at: '' };

export default function AdminAnnouncements() {
  const { current } = useGuild();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  async function load() {
    setLoading(true);
    try { setItems((await api.get('/announcements')).data); }
    finally { setLoading(false); }
  }

  useEffect(() => { load(); }, [current?.guild?.id]);

  function openNew() { setEditing('new'); setForm(EMPTY); }
  function openEdit(a) {
    setEditing(a.id);
    setForm({
      title: a.title,
      body: a.body || '',
      is_pinned: a.is_pinned,
      expires_at: a.expires_at ? a.expires_at.slice(0, 16) : '',
    });
  }

  async function submit() {
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        body: form.body || null,
        is_pinned: form.is_pinned,
        expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
      };
      if (editing === 'new') {
        await api.post('/announcements', payload);
        toast.success('Anuncio creado');
      } else {
        await api.patch(`/announcements/${editing}`, payload);
        toast.success('Actualizado');
      }
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setSaving(false); }
  }

  async function del(a) {
    if (!confirm(`¿Borrar "${a.title}"?`)) return;
    try {
      await api.delete(`/announcements/${a.id}`);
      toast.success('Borrado');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  }

  return (
    <AdminLayout title="Anuncios del Gremio" subtitle="Publica avisos que aparecen al tope para todos los miembros." actions={
      <button onClick={openNew} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white text-sm font-medium hover:shadow-glow-violet">
        <Plus size={14} /> Nuevo anuncio
      </button>
    }>
      {loading ? (
        <p className="text-white/40 text-sm">Cargando…</p>
      ) : items.length === 0 ? (
        <div className="p-10 rounded-2xl bg-bg-surface border border-bg-border text-center">
          <Megaphone size={28} className="mx-auto text-white/30 mb-3" />
          <p className="text-white/60 text-sm">Sin anuncios activos.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {items.map((a) => (
            <div key={a.id} className="flex items-start gap-3 p-4 rounded-xl bg-bg-surface border border-bg-border">
              <Megaphone size={16} className="text-elite-violet flex-shrink-0 mt-0.5" />
              <div className="flex-grow min-w-0">
                <div className="flex items-baseline gap-2">
                  <p className="font-semibold">{a.title}</p>
                  {a.is_pinned && <Pin size={10} className="text-elite-gold" />}
                  {a.expires_at && (
                    <span className="text-[10px] text-white/40">vence {new Date(a.expires_at).toLocaleString('es-CL')}</span>
                  )}
                </div>
                {a.body && <p className="text-sm text-white/70 mt-1 leading-snug">{a.body}</p>}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={() => openEdit(a)} className="p-1.5 rounded text-white/50 hover:text-white hover:bg-white/5" title="Editar">
                  <Edit3 size={13} />
                </button>
                <button onClick={() => del(a)} className="p-1.5 rounded text-rose-400 hover:text-rose-300 hover:bg-rose-500/10" title="Borrar">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AdminFormModal
        open={editing !== null}
        title={editing === 'new' ? 'Nuevo anuncio' : 'Editar anuncio'}
        onClose={() => setEditing(null)}
        onSubmit={submit}
        submitting={saving}
      >
        <Field label="Título">
          <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required minLength={2} maxLength={160} />
        </Field>
        <Field label="Cuerpo">
          <Textarea rows={3} value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        </Field>
        <Field label="Vencimiento (opcional)" hint="Después de esta fecha el anuncio deja de aparecer.">
          <Input type="datetime-local" value={form.expires_at} onChange={(e) => setForm({ ...form, expires_at: e.target.value })} />
        </Field>
        <Toggle label="Pinnear (sube el anuncio al tope)" checked={form.is_pinned} onChange={(v) => setForm({ ...form, is_pinned: v })} />
      </AdminFormModal>
    </AdminLayout>
  );
}
