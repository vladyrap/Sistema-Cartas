import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Plus, Edit3, Trash2, Sparkles, Save, Loader2, X } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/Navbar';
import AuthGuard from '../../components/AuthGuard';
import { api } from '../../lib/api';

const KIND_OPTIONS = [
  { value: 'exp',         label: 'EXP directo' },
  { value: 'exp_boost',   label: 'EXP boost (cosmético)' },
  { value: 'freeze_days', label: 'Freeze days' },
  { value: 'cosmetic',    label: 'Cosmético' },
  { value: 'nothing',     label: 'Nothing (visual)' },
];

export default function AdminBattlePass() {
  return (
    <AuthGuard feature="el editor de Battle Pass" returnUrl={window.location.pathname} accent="violet">
      <Inner />
    </AuthGuard>
  );
}

function Inner() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get('/api/battle-pass/active');
      setData(r.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const saveTier = async (payload) => {
    if (!data?.pass) return;
    try {
      await api.post(`/api/battle-pass/admin/${data.pass.id}/tier`, payload);
      toast.success(`Tier ${payload.tier_number} guardado`);
      setEditing(null);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };

  const deleteTier = async (tier_number) => {
    if (!data?.pass) return;
    if (!confirm(`Eliminar tier ${tier_number}?`)) return;
    try {
      await api.delete(`/api/battle-pass/admin/${data.pass.id}/tier/${tier_number}`);
      toast.success('Eliminado');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-bg text-white">
        <Navbar />
        <div className="pt-24 grid place-items-center"><Loader2 className="animate-spin" /></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-bg text-white">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 pt-24 pb-16 space-y-6">
        <Link to="/admin" className="flex items-center gap-2 text-white/60 hover:text-white text-sm w-fit">
          <ArrowLeft size={16} /> Admin
        </Link>

        <div>
          <div className="text-xs uppercase tracking-[0.3em] text-violet-300 mb-1 flex items-center gap-2">
            <Sparkles size={14} /> Battle Pass
          </div>
          <h1 className="font-display text-3xl font-black">Editor del Pase</h1>
        </div>

        {!data?.pass ? (
          <CreatePassPanel onCreated={load} />
        ) : (
          <>
            <div className="rounded-2xl glass p-5">
              <h2 className="font-bold text-lg">{data.pass.name}</h2>
              <p className="text-white/50 text-sm mt-1">{data.pass.description || 'Sin descripción'}</p>
              <div className="grid grid-cols-4 gap-3 mt-4 text-xs">
                <Stat label="Max tier" value={data.pass.max_tier} />
                <Stat label="XP/tier" value={data.pass.xp_per_tier} />
                <Stat label="Tiers definidos" value={data.tiers?.length || 0} />
                <Stat label="Premium" value={`$${data.pass.premium_price_clp.toLocaleString('es-CL')}`} />
              </div>
            </div>

            <div className="rounded-2xl glass overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <span className="font-bold">Tiers</span>
                <button
                  onClick={() => setEditing({ tier_number: (data.tiers?.length || 0) + 1 })}
                  className="px-3 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-400 text-white text-sm font-bold flex items-center gap-1"
                >
                  <Plus size={12} /> Tier
                </button>
              </div>
              <div className="divide-y divide-white/5 max-h-[500px] overflow-y-auto">
                {(data.tiers || []).map(t => (
                  <div key={t.tier_number} className="px-4 py-3 flex items-center gap-3 hover:bg-white/5">
                    <div className="w-12 text-center font-display text-2xl font-black text-violet-300">{t.tier_number}</div>
                    <div className="flex-1 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <div className="text-[10px] text-cyan-300 font-bold uppercase">Free</div>
                        <div className="truncate">{t.free_reward_label || t.free_reward_kind || '—'}</div>
                        {t.free_reward_amount > 0 && <div className="text-[10px] text-white/40 font-mono">{t.free_reward_amount}</div>}
                      </div>
                      <div>
                        <div className="text-[10px] text-amber-300 font-bold uppercase">Premium</div>
                        <div className="truncate">{t.premium_reward_label || t.premium_reward_kind || '—'}</div>
                        {t.premium_reward_amount > 0 && <div className="text-[10px] text-white/40 font-mono">{t.premium_reward_amount}</div>}
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button onClick={() => setEditing(t)} className="p-2 rounded-lg bg-white/5 hover:bg-white/10"><Edit3 size={14} /></button>
                      <button onClick={() => deleteTier(t.tier_number)} className="p-2 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300"><Trash2 size={14} /></button>
                    </div>
                  </div>
                ))}
                {(!data.tiers || data.tiers.length === 0) && (
                  <div className="px-4 py-12 text-center text-white/40 text-sm">Sin tiers todavía — agregá el primero.</div>
                )}
              </div>
            </div>
          </>
        )}
      </div>

      {editing && (
        <TierEditor tier={editing} onClose={() => setEditing(null)} onSave={saveTier} />
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-white/5 p-3">
      <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold">{label}</div>
      <div className="font-mono font-bold mt-1">{value}</div>
    </div>
  );
}

function CreatePassPanel({ onCreated }) {
  const [seasons, setSeasons] = useState([]);
  const [form, setForm] = useState({
    season_id: '', name: 'Pase Competitivo Temporada', description: '',
    starts_at: '', ends_at: '', max_tier: 50, xp_per_tier: 1000, premium_price_clp: 4990,
  });
  useEffect(() => { api.get('/seasons').then(r => setSeasons(r.data || [])).catch(() => {}); }, []);
  const submit = async () => {
    if (!form.season_id || !form.starts_at || !form.ends_at) { toast.error('Faltan campos'); return; }
    try {
      await api.post('/api/battle-pass/admin/create', {
        ...form, season_id: parseInt(form.season_id, 10),
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
      });
      toast.success('Pase creado');
      onCreated();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };
  return (
    <div className="rounded-2xl glass p-5">
      <h2 className="font-bold text-lg mb-2">Crear nuevo pase</h2>
      <p className="text-white/50 text-sm mb-4">No hay pase activo. Creá uno para la temporada vigente.</p>
      <div className="grid md:grid-cols-2 gap-3">
        <select value={form.season_id} onChange={e => setForm({ ...form, season_id: e.target.value })}
          className="px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm">
          <option value="">— Elegir temporada —</option>
          {seasons.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Nombre"
          className="px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm" />
        <input type="datetime-local" value={form.starts_at} onChange={e => setForm({ ...form, starts_at: e.target.value })}
          className="px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm" />
        <input type="datetime-local" value={form.ends_at} onChange={e => setForm({ ...form, ends_at: e.target.value })}
          className="px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm" />
        <input type="number" value={form.max_tier} onChange={e => setForm({ ...form, max_tier: parseInt(e.target.value, 10) || 50 })} placeholder="Max tier"
          className="px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm" />
        <input type="number" value={form.xp_per_tier} onChange={e => setForm({ ...form, xp_per_tier: parseInt(e.target.value, 10) || 1000 })} placeholder="XP/tier"
          className="px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm" />
      </div>
      <button onClick={submit} className="mt-4 px-4 py-2 rounded-lg bg-violet-500 text-white font-bold text-sm">
        Crear pase
      </button>
    </div>
  );
}

function TierEditor({ tier, onClose, onSave }) {
  const [form, setForm] = useState({
    tier_number: tier.tier_number,
    free_reward_kind: tier.free_reward_kind || 'exp',
    free_reward_amount: tier.free_reward_amount || 0,
    free_reward_label: tier.free_reward_label || '',
    free_reward_image_url: tier.free_reward_image_url || '',
    premium_reward_kind: tier.premium_reward_kind || 'exp',
    premium_reward_amount: tier.premium_reward_amount || 0,
    premium_reward_label: tier.premium_reward_label || '',
    premium_reward_image_url: tier.premium_reward_image_url || '',
  });
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={e => e.stopPropagation()}
        className="bg-bg-elevated border border-violet-400/30 rounded-2xl max-w-2xl w-full p-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display font-bold text-xl">Editar tier {form.tier_number}</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-wider text-cyan-300 font-bold">Free track</div>
            <select value={form.free_reward_kind} onChange={e => setForm({ ...form, free_reward_kind: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm">
              {KIND_OPTIONS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <input type="number" value={form.free_reward_amount} onChange={e => setForm({ ...form, free_reward_amount: parseInt(e.target.value, 10) || 0 })} placeholder="Cantidad"
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm" />
            <input value={form.free_reward_label} onChange={e => setForm({ ...form, free_reward_label: e.target.value })} placeholder="Label"
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm" />
          </div>
          <div className="space-y-3">
            <div className="text-xs uppercase tracking-wider text-amber-300 font-bold">Premium track</div>
            <select value={form.premium_reward_kind} onChange={e => setForm({ ...form, premium_reward_kind: e.target.value })}
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm">
              {KIND_OPTIONS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <input type="number" value={form.premium_reward_amount} onChange={e => setForm({ ...form, premium_reward_amount: parseInt(e.target.value, 10) || 0 })} placeholder="Cantidad"
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm" />
            <input value={form.premium_reward_label} onChange={e => setForm({ ...form, premium_reward_label: e.target.value })} placeholder="Label"
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm" />
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm">Cancelar</button>
          <button onClick={() => onSave(form)} className="px-5 py-2 rounded-lg bg-violet-500 hover:bg-violet-400 text-white font-bold text-sm flex items-center gap-1.5">
            <Save size={12} /> Guardar
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}
