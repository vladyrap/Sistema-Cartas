import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Edit3, Trash2, Award, Crown, EyeOff } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import AdminFormModal, { Field, Input, Select, Textarea, Toggle } from '../../components/AdminFormModal';
import { api } from '../../lib/api';

const EMPTY = {
  code: '', name: '', description: '', icon: '',
  is_seasonal: false, is_secret: false,
};

export default function AdminAchievements() {
  const [items, setItems] = useState([]);
  const [players, setPlayers] = useState([]);
  const [seasons, setSeasons] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Grant modal
  const [grant, setGrant] = useState(null);
  const [grantForm, setGrantForm] = useState({ player_id: '', season_id: '' });

  async function load() {
    setLoading(true);
    try {
      const [a, p, s] = await Promise.all([
        api.get('/admin/achievements'),
        api.get('/admin/players-full'),
        api.get('/seasons'),
      ]);
      setItems(a.data);
      setPlayers(p.data);
      setSeasons(s.data);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing('new'); setForm(EMPTY); }
  function openEdit(a) {
    setEditing(a.id);
    setForm({
      code: a.code, name: a.name, description: a.description || '',
      icon: a.icon || '', is_seasonal: a.is_seasonal, is_secret: a.is_secret,
    });
  }

  async function submit() {
    setSaving(true);
    try {
      const payload = { ...form, description: form.description || null, icon: form.icon || null };
      if (editing === 'new') {
        await api.post('/admin/achievements', payload);
        toast.success('Medalla creada');
      } else {
        const { code, ...rest } = payload;
        await api.patch(`/admin/achievements/${editing}`, rest);
        toast.success('Medalla actualizada');
      }
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setSaving(false); }
  }

  async function remove(id) {
    if (!confirm('¿Eliminar medalla? Si ya se otorgó a jugadores, se perderán las asignaciones.')) return;
    try { await api.delete(`/admin/achievements/${id}`); toast.success('Eliminada'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  }

  function openGrant(a) { setGrant(a); setGrantForm({ player_id: '', season_id: '' }); }
  async function submitGrant() {
    if (!grantForm.player_id) { toast.error('Selecciona jugador'); return; }
    try {
      await api.post('/admin/gamification/achievements/grant', {
        player_id: parseInt(grantForm.player_id),
        achievement_id: grant.id,
        season_id: grantForm.season_id ? parseInt(grantForm.season_id) : null,
      });
      toast.success('Medalla otorgada');
      setGrant(null);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  }

  return (
    <AdminLayout
      title="Medallas y logros"
      subtitle="Crea medallas y otórgalas manualmente a jugadores específicos."
      actions={
        <button onClick={openNew} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white font-medium hover:shadow-glow-violet transition text-sm">
          <Plus size={14} /> Nueva medalla
        </button>
      }
    >
      {loading ? <p className="text-white/40">Cargando…</p> : items.length === 0 ? (
        <div className="p-10 rounded-2xl bg-bg-surface border border-bg-border text-center">
          <Award size={32} className="mx-auto text-white/30 mb-3" />
          <p className="text-white/60">Sin medallas aún.</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {items.map((a) => (
            <div key={a.id} className="p-4 rounded-2xl bg-gradient-to-br from-elite-magenta/10 to-bg-surface border border-elite-magenta/20">
              <div className="flex items-start justify-between mb-2">
                <Crown size={20} className="text-elite-magenta" />
                <div className="flex gap-1">
                  {a.is_secret && <span title="Secreta"><EyeOff size={12} className="text-white/40" /></span>}
                  {a.is_seasonal && <span className="text-[9px] font-mono text-elite-gold">Estacional</span>}
                </div>
              </div>
              <p className="text-xs font-mono text-white/40">{a.code}</p>
              <h3 className="font-semibold mt-1">{a.name}</h3>
              {a.description && <p className="text-xs text-white/60 mt-1 leading-snug">{a.description}</p>}
              <div className="mt-3 flex gap-1.5">
                <button onClick={() => openGrant(a)} className="flex-grow inline-flex items-center justify-center gap-1 text-xs px-2 py-1.5 rounded bg-elite-gold/10 text-elite-gold border border-elite-gold/30 hover:bg-elite-gold/20">
                  <Award size={11} /> Otorgar
                </button>
                <button onClick={() => openEdit(a)} className="inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded bg-white/5 border border-white/10 hover:bg-white/10">
                  <Edit3 size={11} />
                </button>
                <button onClick={() => remove(a.id)} className="inline-flex items-center gap-1 text-xs px-2 py-1.5 rounded bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20">
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AdminFormModal
        open={editing !== null}
        title={editing === 'new' ? 'Nueva medalla' : 'Editar medalla'}
        onClose={() => setEditing(null)}
        onSubmit={submit}
        submitting={saving}
      >
        <Field label="Código (único)" hint="No se puede cambiar después.">
          <Input value={form.code} disabled={editing !== 'new'}
            onChange={(e) => setForm({ ...form, code: e.target.value })} required placeholder="perfect_run" />
        </Field>
        <Field label="Nombre">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Carrera Perfecta" />
        </Field>
        <Field label="Descripción">
          <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <Field label="Icono (nombre Lucide o URL SVG)">
          <Input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="Crown" />
        </Field>
        <div className="flex items-center gap-6">
          <Toggle label="Estacional" checked={form.is_seasonal} onChange={(v) => setForm({ ...form, is_seasonal: v })} />
          <Toggle label="Secreta" checked={form.is_secret} onChange={(v) => setForm({ ...form, is_secret: v })} />
        </div>
      </AdminFormModal>

      <AdminFormModal
        open={grant !== null}
        title={grant ? `Otorgar · ${grant.name}` : ''}
        onClose={() => setGrant(null)}
        onSubmit={submitGrant}
      >
        <Field label="Jugador">
          <Select value={grantForm.player_id} onChange={(e) => setGrantForm({ ...grantForm, player_id: e.target.value })} required>
            <option value="">Seleccionar…</option>
            {players.map((p) => <option key={p.id} value={p.id}>{p.alias} · {p.elite_id_code}</option>)}
          </Select>
        </Field>
        <Field label="Temporada (vacío = sin asociar)">
          <Select value={grantForm.season_id} onChange={(e) => setGrantForm({ ...grantForm, season_id: e.target.value })}>
            <option value="">— Sin temporada —</option>
            {seasons.map((s) => <option key={s.id} value={s.id}>T{s.number} · {s.name}</option>)}
          </Select>
        </Field>
      </AdminFormModal>
    </AdminLayout>
  );
}
