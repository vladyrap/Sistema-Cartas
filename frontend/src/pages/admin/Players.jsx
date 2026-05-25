import { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { Edit3, Zap, Shield, ShieldOff, Crown, Users } from 'lucide-react';
import AdminLayout from '../../components/AdminLayout';
import AdminFormModal, { Field, Input, Select, Toggle } from '../../components/AdminFormModal';
import RankBadge from '../../components/RankBadge';
import { api } from '../../lib/api';

const ROLES = ['PLAYER', 'ORGANIZER', 'ADMIN'];
const CLASSES = ['DUELISTA', 'COLECCIONISTA', 'ESTRATEGA', 'MENTOR', 'TRADER', 'EXPLORADOR'];

export default function AdminPlayers() {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(true);

  // Editar perfil
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [saving, setSaving] = useState(false);

  // EXP adjust
  const [exp, setExp] = useState(null);
  const [expForm, setExpForm] = useState({ amount: 0, reason: '' });

  async function load() {
    setLoading(true);
    try { setItems((await api.get('/admin/players-full')).data); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function openEdit(p) {
    setEditing(p);
    setForm({
      alias: p.alias,
      full_name: p.full_name || '',
      player_class: p.player_class,
      role: p.role,
      is_active: p.is_active,
      new_password: '',
    });
  }

  async function submitEdit() {
    setSaving(true);
    try {
      // PATCH profile
      await api.patch(`/admin/players/${editing.id}/profile`, {
        alias: form.alias, full_name: form.full_name || null,
        player_class: form.player_class,
      });
      // PATCH user
      const userPayload = { role: form.role, is_active: form.is_active };
      if (form.new_password) userPayload.new_password = form.new_password;
      await api.patch(`/admin/players/${editing.id}/user`, userPayload);
      toast.success('Jugador actualizado');
      setEditing(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setSaving(false); }
  }

  function openExp(p) { setExp(p); setExpForm({ amount: 0, reason: '' }); }
  async function submitExp() {
    if (!expForm.reason || expForm.amount === 0) {
      toast.error('Indica monto y razón');
      return;
    }
    try {
      const { data } = await api.post('/admin/exp/adjust', {
        player_id: exp.id,
        amount: parseInt(expForm.amount),
        reason: expForm.reason,
      });
      toast.success(`EXP ajustada · nivel ${data.new_level} · ${data.new_exp_total.toLocaleString()} EXP total`);
      setExp(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  }

  const filtered = items.filter((p) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return p.alias.toLowerCase().includes(q) || p.email.toLowerCase().includes(q) || p.elite_id_code.toLowerCase().includes(q);
  });

  return (
    <AdminLayout
      title="Jugadores"
      subtitle="Edita perfil, rol, contraseña y ajusta EXP de cualquier jugador."
    >
      <div className="mb-4">
        <Input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Buscar por alias, email o Elite ID…" />
      </div>

      {loading ? <p className="text-white/40">Cargando…</p> : filtered.length === 0 ? (
        <div className="p-10 rounded-2xl bg-bg-surface border border-bg-border text-center">
          <Users size={32} className="mx-auto text-white/30 mb-3" />
          <p className="text-white/60">Sin jugadores con ese filtro.</p>
        </div>
      ) : (
        <div className="rounded-2xl border border-bg-border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-bg-elevated/60 text-[10px] uppercase tracking-widest text-white/50">
              <tr>
                <th className="text-left px-3 py-3">Alias</th>
                <th className="text-left px-3 py-3">Email</th>
                <th className="text-left px-3 py-3">Elite ID</th>
                <th className="text-left px-3 py-3">Rol</th>
                <th className="text-left px-3 py-3">Clase</th>
                <th className="text-left px-3 py-3">Rango T-actual</th>
                <th className="text-left px-3 py-3">Prestigio</th>
                <th className="text-left px-3 py-3">Estado</th>
                <th className="text-right px-3 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-bg-border">
              {filtered.map((p) => (
                <tr key={p.id} className="bg-bg-surface hover:bg-bg-elevated/50">
                  <td className="px-3 py-2 font-semibold">{p.alias}</td>
                  <td className="px-3 py-2 text-xs text-white/60">{p.email}</td>
                  <td className="px-3 py-2 font-mono text-[10px] text-white/50">{p.elite_id_code}</td>
                  <td className="px-3 py-2">
                    <span className={`text-[10px] px-2 py-0.5 rounded border ${
                      p.role === 'ADMIN' ? 'bg-elite-gold/10 text-elite-gold border-elite-gold/30'
                      : p.role === 'ORGANIZER' ? 'bg-elite-blue/10 text-elite-blue border-elite-blue/30'
                      : 'bg-white/5 text-white/60 border-white/10'
                    }`}>
                      {p.role === 'ADMIN' && <Crown size={9} className="inline mr-1" />}
                      {p.role}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-white/60">{p.player_class.toLowerCase()}</td>
                  <td className="px-3 py-2">
                    {p.current_rank ? <RankBadge rank={p.current_rank} level={p.current_level} size="sm" /> : <span className="text-white/30 text-xs">—</span>}
                  </td>
                  <td className="px-3 py-2 font-mono text-elite-gold">{p.prestige.toLocaleString()}</td>
                  <td className="px-3 py-2">
                    {p.is_active ? <Shield size={12} className="text-emerald-300" /> : <ShieldOff size={12} className="text-rose-300" />}
                  </td>
                  <td className="px-3 py-2 text-right space-x-1">
                    <button onClick={() => openExp(p)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-elite-gold/10 text-elite-gold border border-elite-gold/30 hover:bg-elite-gold/20" title="Ajustar EXP">
                      <Zap size={11} />
                    </button>
                    <button onClick={() => openEdit(p)} className="inline-flex items-center gap-1 text-xs px-2 py-1 rounded bg-white/5 border border-white/10 hover:bg-white/10">
                      <Edit3 size={11} /> Editar
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
        title={editing ? `Editar · ${editing.alias}` : ''}
        onClose={() => setEditing(null)}
        onSubmit={submitEdit}
        submitting={saving}
      >
        <Field label="Alias">
          <Input value={form.alias} onChange={(e) => setForm({ ...form, alias: e.target.value })} required minLength={3} />
        </Field>
        <Field label="Nombre completo">
          <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Clase">
            <Select value={form.player_class} onChange={(e) => setForm({ ...form, player_class: e.target.value })}>
              {CLASSES.map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Rol">
            <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
              {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
            </Select>
          </Field>
        </div>
        <Field label="Nueva contraseña (vacío = no cambiar)" hint="Mínimo 6 caracteres.">
          <Input type="password" value={form.new_password} onChange={(e) => setForm({ ...form, new_password: e.target.value })} placeholder="Dejar vacío para no cambiar" />
        </Field>
        <Toggle label="Cuenta activa" checked={form.is_active ?? true} onChange={(v) => setForm({ ...form, is_active: v })} />
      </AdminFormModal>

      <AdminFormModal
        open={exp !== null}
        title={exp ? `Ajustar EXP · ${exp.alias}` : ''}
        onClose={() => setExp(null)}
        onSubmit={submitExp}
      >
        <p className="text-xs text-white/60">
          Asigna EXP positiva (premio) o negativa (penalización) en la temporada activa. La transacción queda auditada.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Monto (puede ser negativo)">
            <Input type="number" value={expForm.amount} onChange={(e) => setExpForm({ ...expForm, amount: e.target.value })} required />
          </Field>
          <Field label="Nivel actual">
            <div className="px-3 py-2 rounded-lg bg-bg-elevated/40 border border-bg-border font-mono text-sm text-white/60">
              {exp?.current_level ?? '—'}
            </div>
          </Field>
        </div>
        <Field label="Razón">
          <Input value={expForm.reason} onChange={(e) => setExpForm({ ...expForm, reason: e.target.value })} required placeholder="Premio por contribución a la comunidad" />
        </Field>
      </AdminFormModal>
    </AdminLayout>
  );
}
