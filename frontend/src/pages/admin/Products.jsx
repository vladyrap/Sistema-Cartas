import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Plus, Edit3, Trash2, Package, Crown, Sparkles, Zap, Lock } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import AdminFormModal, { Field, Input, Select, Textarea, Toggle } from '../../components/AdminFormModal';
import { api } from '../../lib/api';

const ACCESS = ['NORMAL', 'ELITE_ACCESS', 'ELITE_PRO'];
const EMPTY = {
  name: '', game_id: '', category: '', price_clp: 0, stock: 0,
  image_url: '', description: '', access: 'NORMAL', required_level: 1,
  per_player_limit: '', is_preorder: false, is_active: true,
};

export default function AdminProducts() {
  const [items, setItems] = useState([]);
  const [games, setGames] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const [p, g] = await Promise.all([api.get('/admin/products'), api.get('/admin/games')]);
      setItems(p.data);
      setGames(g.data);
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openNew() { setEditing('new'); setForm(EMPTY); }
  function openEdit(p) {
    setEditing(p.id);
    setForm({
      name: p.name, game_id: p.game_id || '', category: p.category || '',
      price_clp: p.price_clp, stock: p.stock, image_url: p.image_url || '',
      description: p.description || '', access: p.access, required_level: p.required_level,
      per_player_limit: p.per_player_limit ?? '', is_preorder: p.is_preorder, is_active: p.is_active,
    });
  }

  async function submit() {
    setSaving(true);
    try {
      const payload = {
        ...form,
        game_id: form.game_id ? parseInt(form.game_id) : null,
        category: form.category || null,
        price_clp: parseInt(form.price_clp),
        stock: parseInt(form.stock),
        image_url: form.image_url || null,
        description: form.description || null,
        required_level: parseInt(form.required_level),
        per_player_limit: form.per_player_limit === '' ? null : parseInt(form.per_player_limit),
      };
      if (editing === 'new') {
        await api.post('/admin/products', payload);
        toast.success('Producto creado');
      } else {
        await api.patch(`/admin/products/${editing}`, payload);
        toast.success('Producto actualizado');
      }
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setSaving(false); }
  }

  async function remove(id) {
    if (!confirm('¿Eliminar producto? Si tiene reservas activas, mejor desactívalo.')) return;
    try { await api.delete(`/admin/products/${id}`); toast.success('Eliminado'); load(); }
    catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  }

  return (
    <AdminLayout
      title="Productos"
      subtitle="Catálogo Normal · Elite Access · Elite Pro · Preventas"
      actions={
        <button onClick={openNew} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white font-medium hover:shadow-glow-violet transition text-sm">
          <Plus size={14} /> Nuevo producto
        </button>
      }
    >
      {loading ? <p className="text-white/40">Cargando…</p> : items.length === 0 ? (
        <div className="p-10 rounded-2xl bg-bg-surface border border-bg-border text-center">
          <Package size={32} className="mx-auto text-white/30 mb-3" />
          <p className="text-white/60">Sin productos aún.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-bg-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-elevated/60 text-[10px] uppercase tracking-widest text-white/50">
              <tr>
                <th className="text-left px-3 py-3">Producto</th>
                <th className="text-left px-3 py-3">Categoría</th>
                <th className="text-left px-3 py-3">Precio</th>
                <th className="text-left px-3 py-3">Stock</th>
                <th className="text-left px-3 py-3">Access</th>
                <th className="text-left px-3 py-3">Req</th>
                <th className="text-left px-3 py-3">Activo</th>
                <th className="text-right px-3 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg-border">
              {items.map((p) => (
                <tr key={p.id} className="bg-bg-surface hover:bg-bg-elevated/50">
                  <td className="px-3 py-2">
                    <p className="font-semibold">{p.name}</p>
                    {p.is_preorder && (
                      <span className="inline-flex items-center gap-1 text-[9px] text-elite-violet mt-0.5"><Zap size={9} /> PREVENTA</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-white/60 text-xs">{p.category || '—'}</td>
                  <td className="px-3 py-2 font-mono">${p.price_clp.toLocaleString('es-CL')}</td>
                  <td className="px-3 py-2 font-mono">{p.stock}</td>
                  <td className="px-3 py-2">
                    <AccessBadge access={p.access} />
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">
                    {p.required_level > 1 ? <><Lock size={10} className="inline mr-1 text-elite-violet" />N{p.required_level}</> : '—'}
                  </td>
                  <td className="px-3 py-2">{p.is_active ? '✓' : '✗'}</td>
                  <td className="px-3 py-2 text-right space-x-1">
                    <button onClick={() => openEdit(p)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10">
                      <Edit3 size={11} />
                    </button>
                    <button onClick={() => remove(p.id)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-rose-500/10 text-rose-300 border border-rose-500/30 hover:bg-rose-500/20">
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
        title={editing === 'new' ? 'Nuevo producto' : 'Editar producto'}
        onClose={() => setEditing(null)}
        onSubmit={submit}
        submitting={saving}
        size="lg"
      >
        <Field label="Nombre">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </Field>
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Juego">
            <Select value={form.game_id} onChange={(e) => setForm({ ...form, game_id: e.target.value })}>
              <option value="">— Sin juego —</option>
              {games.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
          </Field>
          <Field label="Categoría">
            <Input value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Booster, Deck, Sealed…" />
          </Field>
          <Field label="Precio CLP">
            <Input type="number" min={0} value={form.price_clp} onChange={(e) => setForm({ ...form, price_clp: e.target.value })} required />
          </Field>
          <Field label="Stock">
            <Input type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.value })} required />
          </Field>
          <Field label="Access">
            <Select value={form.access} onChange={(e) => setForm({ ...form, access: e.target.value })}>
              {ACCESS.map((a) => <option key={a} value={a}>{a}</option>)}
            </Select>
          </Field>
          <Field label="Nivel requerido (1-30)">
            <Input type="number" min={1} max={30} value={form.required_level} onChange={(e) => setForm({ ...form, required_level: e.target.value })} />
          </Field>
          <Field label="Límite por jugador (vacío = sin límite)">
            <Input type="number" min={1} value={form.per_player_limit} onChange={(e) => setForm({ ...form, per_player_limit: e.target.value })} />
          </Field>
          <Field label="URL imagen">
            <Input value={form.image_url} onChange={(e) => setForm({ ...form, image_url: e.target.value })} />
          </Field>
        </div>
        <Field label="Descripción">
          <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </Field>
        <div className="flex items-center gap-6">
          <Toggle label="Preventa" checked={form.is_preorder} onChange={(v) => setForm({ ...form, is_preorder: v })} />
          <Toggle label="Activo" checked={form.is_active} onChange={(v) => setForm({ ...form, is_active: v })} />
        </div>
      </AdminFormModal>
    </AdminLayout>
  );
}

function AccessBadge({ access }) {
  const map = {
    NORMAL: { cls: 'bg-white/5 text-white/60 border-white/10', Icon: Package },
    ELITE_ACCESS: { cls: 'bg-elite-blue/10 text-elite-blue border-elite-blue/30', Icon: Sparkles },
    ELITE_PRO: { cls: 'bg-elite-gold/10 text-elite-gold border-elite-gold/30', Icon: Crown },
  };
  const m = map[access] || map.NORMAL;
  const Icon = m.Icon;
  return <span className={`inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded border ${m.cls}`}><Icon size={9} /> {access}</span>;
}
