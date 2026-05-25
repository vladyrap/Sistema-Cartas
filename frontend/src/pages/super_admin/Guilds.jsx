import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Plus, Edit3, Archive, Users, Shield, Crown } from 'lucide-react';
import Layout from '../../components/Layout';
import AdminFormModal, { Field, Input, Textarea, Toggle, Select } from '../../components/AdminFormModal';
import ImageUpload from '../../components/ImageUpload';
import { useAuth } from '../../lib/useAuth';
import { useGuild } from '../../lib/useGuild';
import { api } from '../../lib/api';

const EMPTY = {
  code: '', name: '', tagline: '', description: '',
  logo_url: '', banner_url: '', accent_color: '',
  owner_user_id: '', is_public: true, seed_initial: true,
};

export default function SuperAdminGuilds() {
  const { user, loading: authLoading, isAuthed } = useAuth();
  const { refresh: refreshMyGuilds } = useGuild();
  const [items, setItems] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [membersOf, setMembersOf] = useState(null); // {guild, members:[]}

  async function load() {
    setLoading(true);
    try {
      const r = await api.get('/super-admin/guilds');
      setItems(r.data);
    } finally { setLoading(false); }
  }

  useEffect(() => { if (isAuthed && user?.role === 'SUPER_ADMIN') load(); }, [isAuthed, user]);

  function openNew() { setEditing('new'); setForm(EMPTY); }
  function openEdit(g) {
    setEditing(g.id);
    setForm({
      code: g.code,
      name: g.name,
      tagline: g.tagline || '',
      description: g.description || '',
      logo_url: g.logo_url || '',
      banner_url: g.banner_url || '',
      accent_color: g.accent_color || '',
      owner_user_id: g.owner_user_id ?? '',
      is_public: g.is_public,
      status: g.status,
    });
  }

  async function submit() {
    setSaving(true);
    try {
      const payload = { ...form };
      if (payload.owner_user_id === '' || payload.owner_user_id === null) delete payload.owner_user_id;
      else payload.owner_user_id = Number(payload.owner_user_id);

      if (editing === 'new') {
        await api.post('/super-admin/guilds', payload);
        toast.success('Gremio creado');
      } else {
        const { code, seed_initial, ...rest } = payload;
        await api.patch(`/super-admin/guilds/${editing}`, rest);
        toast.success('Gremio actualizado');
      }
      setEditing(null);
      await load();
      await refreshMyGuilds();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally {
      setSaving(false);
    }
  }

  async function archive(g) {
    if (!confirm(`¿Archivar "${g.name}"? Soft-delete, no borra datos.`)) return;
    try {
      await api.delete(`/super-admin/guilds/${g.id}`);
      toast.success('Gremio archivado');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  }

  async function openMembers(g) {
    try {
      const r = await api.get(`/super-admin/guilds/${g.id}/members`);
      setMembersOf({ guild: g, members: r.data });
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  }

  if (authLoading) return <Layout><div className="p-10 text-white/40">Cargando…</div></Layout>;
  if (!isAuthed) return <Navigate to="/login" replace />;
  if (user?.role !== 'SUPER_ADMIN') {
    return <Layout><div className="p-10 text-rose-400">Acceso solo para SUPER_ADMIN.</div></Layout>;
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6">
        <header className="mb-6 flex items-end justify-between gap-3 flex-wrap">
          <div>
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-elite-gold/10 border border-elite-gold/30 mb-2">
              <Crown size={12} className="text-elite-gold" />
              <span className="text-[10px] tracking-widest uppercase text-elite-gold font-semibold">SuperAdmin</span>
            </div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold">Gremios</h1>
            <p className="text-white/50 mt-1 text-sm">Gestión global: crear, editar o archivar Gremios.</p>
          </div>
          <button onClick={openNew} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white font-medium hover:shadow-glow-violet transition text-sm">
            <Plus size={14} /> Nuevo Gremio
          </button>
        </header>

        {loading ? <p className="text-white/40">Cargando…</p> : items.length === 0 ? (
          <div className="p-10 rounded-2xl bg-bg-surface border border-bg-border text-center">
            <Shield size={32} className="mx-auto text-white/30 mb-3" />
            <p className="text-white/60">Sin Gremios. Crea el primero.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-bg-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg-elevated/60 text-[10px] uppercase tracking-widest text-white/50">
                <tr>
                  <th className="text-left px-4 py-3">Code</th>
                  <th className="text-left px-4 py-3">Nombre</th>
                  <th className="text-left px-4 py-3">Estado</th>
                  <th className="text-left px-4 py-3">Público</th>
                  <th className="text-left px-4 py-3">Miembros</th>
                  <th className="text-right px-4 py-3">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-bg-border">
                {items.map((g) => (
                  <tr key={g.id} className="bg-bg-surface hover:bg-bg-elevated/50">
                    <td className="px-4 py-3 font-mono text-xs text-white/60">{g.code}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {g.logo_url ? (
                          <img src={g.logo_url} alt="" className="w-7 h-7 rounded object-cover" />
                        ) : (
                          <div className="w-7 h-7 rounded bg-gradient-to-br from-elite-violet to-elite-blue flex items-center justify-center">
                            <Shield size={12} className="text-white" />
                          </div>
                        )}
                        <span className="font-semibold">{g.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] uppercase tracking-wider ${
                        g.status === 'ACTIVE' ? 'bg-emerald-500/10 text-emerald-300 border border-emerald-500/30'
                          : g.status === 'ARCHIVED' ? 'bg-white/5 text-white/40 border border-white/10'
                          : 'bg-amber-500/10 text-amber-300 border border-amber-500/30'
                      }`}>{g.status}</span>
                    </td>
                    <td className="px-4 py-3 text-white/60">{g.is_public ? 'Sí' : 'No'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => openMembers(g)} className="inline-flex items-center gap-1 text-xs text-elite-blue hover:text-white">
                        <Users size={11} /> {g.member_count}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-right space-x-1">
                      <button onClick={() => openEdit(g)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10">
                        <Edit3 size={11} /> Editar
                      </button>
                      {g.status !== 'ARCHIVED' && (
                        <button onClick={() => archive(g)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20">
                          <Archive size={11} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <AdminFormModal
          open={editing !== null}
          title={editing === 'new' ? 'Nuevo Gremio' : 'Editar Gremio'}
          onClose={() => setEditing(null)}
          onSubmit={submit}
          submitting={saving}
        >
          <Field label="Código (único, slug)" hint="Solo minúsculas, números, guiones. No se puede cambiar después.">
            <Input
              value={form.code}
              disabled={editing !== 'new'}
              onChange={(e) => setForm({ ...form, code: e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, '') })}
              required
              placeholder="dragon-store"
            />
          </Field>
          <Field label="Nombre">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required placeholder="Dragon Store TCG" />
          </Field>
          <Field label="Tagline" hint="Frase corta para el directorio.">
            <Input value={form.tagline} onChange={(e) => setForm({ ...form, tagline: e.target.value })} placeholder="Donde nacen los campeones" />
          </Field>
          <Field label="Descripción">
            <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
          <Field label="Logo" hint="Cuadrado, 256×256 recomendado.">
            <ImageUpload
              value={form.logo_url}
              onChange={(url) => setForm({ ...form, logo_url: url })}
              category="guild_logos"
              aspect="square"
            />
          </Field>
          <Field label="Banner" hint="Ancho, 1600×400 recomendado.">
            <ImageUpload
              value={form.banner_url}
              onChange={(url) => setForm({ ...form, banner_url: url })}
              category="guild_banners"
              aspect="wide"
            />
          </Field>
          <Field label="Accent color (HEX)" hint="Se usa como acento en el navbar del Gremio.">
            <Input value={form.accent_color} onChange={(e) => setForm({ ...form, accent_color: e.target.value })} placeholder="#8b5cf6" />
          </Field>
          <Field label="Owner user_id" hint="ID del usuario que será GUILD_ADMIN. Opcional.">
            <Input
              type="number"
              value={form.owner_user_id}
              onChange={(e) => setForm({ ...form, owner_user_id: e.target.value })}
              placeholder="123"
            />
          </Field>
          <Toggle label="Público (visible en directorio)" checked={form.is_public} onChange={(v) => setForm({ ...form, is_public: v })} />
          {editing === 'new' && (
            <Toggle
              label="Seedear con datos iniciales (T1 + 3 misiones + 5 medallas)"
              checked={form.seed_initial}
              onChange={(v) => setForm({ ...form, seed_initial: v })}
            />
          )}
          {editing !== 'new' && (
            <Field label="Estado">
              <Select value={form.status || 'ACTIVE'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                <option value="ACTIVE">ACTIVE</option>
                <option value="PENDING">PENDING</option>
                <option value="ARCHIVED">ARCHIVED</option>
              </Select>
            </Field>
          )}
        </AdminFormModal>

        {/* Members modal */}
        <AdminFormModal
          open={membersOf !== null}
          title={membersOf ? `Miembros de "${membersOf.guild.name}"` : ''}
          onClose={() => setMembersOf(null)}
          onSubmit={() => setMembersOf(null)}
          submitting={false}
          size="lg"
        >
          {membersOf?.members?.length === 0 ? (
            <p className="text-white/40 text-sm">Sin miembros.</p>
          ) : (
            <div className="rounded-lg border border-bg-border overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-bg-elevated/40 text-[10px] uppercase tracking-widest text-white/50">
                  <tr>
                    <th className="text-left px-3 py-2">User ID</th>
                    <th className="text-left px-3 py-2">Rol</th>
                    <th className="text-left px-3 py-2">Activo</th>
                    <th className="text-left px-3 py-2">Joined</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-bg-border">
                  {membersOf?.members?.map((m) => (
                    <tr key={m.id}>
                      <td className="px-3 py-2 font-mono text-xs">{m.user_id}</td>
                      <td className="px-3 py-2">{m.role}</td>
                      <td className="px-3 py-2">{m.is_active ? 'Sí' : 'No'}</td>
                      <td className="px-3 py-2 text-white/50 text-xs">{m.joined_at ? new Date(m.joined_at).toLocaleString('es-CL') : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </AdminFormModal>
      </div>
    </Layout>
  );
}
