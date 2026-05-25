import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Sparkles, Shield, Lock, Play, Plus, Calendar, AlertTriangle, Crown } from 'lucide-react';
import Layout from '../../components/Layout';
import RankBadge from '../../components/RankBadge';
import { useAuth } from '../../lib/useAuth';
import { api } from '../../lib/api';

export default function AdminSeasons() {
  const { user, loading: authLoading, isAuthed } = useAuth();
  const [seasons, setSeasons] = useState([]);
  const [active, setActive] = useState(null);
  const [promotedNow, setPromotedNow] = useState([]);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', starts_at: '', ends_at: '', description: '' });

  async function load() {
    const [s, a, p] = await Promise.all([
      api.get('/seasons'),
      api.get('/seasons/active').catch(() => ({ data: null })),
      api.get('/admin/seasons/active/promoted-players').catch(() => ({ data: [] })),
    ]);
    setSeasons(s.data);
    setActive(a.data);
    setPromotedNow(p.data);
  }

  useEffect(() => { if (isAuthed) load(); }, [isAuthed]);

  if (authLoading) return <Layout><div className="p-10 text-white/40">Cargando…</div></Layout>;
  if (!isAuthed) return <Navigate to="/login" replace />;
  if (user?.role !== 'ADMIN') {
    return <Layout><div className="p-10 text-rose-400">Acceso solo para administradores.</div></Layout>;
  }

  async function doPreview(seasonId) {
    setPreviewing(seasonId);
    try {
      const { data } = await api.get(`/admin/seasons/${seasonId}/reset-preview`);
      setPreview(data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally {
      setPreviewing(null);
    }
  }

  async function doActivate(seasonId) {
    if (!confirm('¿Activar temporada? Esto crea SeasonProgress para todos los jugadores aplicando la regla de reset.')) return;
    try {
      const { data } = await api.post(`/admin/seasons/${seasonId}/activate`);
      toast.success(`Temporada activada · ${data.promoted_to_duelista} promovidos a Duelista N10`);
      setPreview(null);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al activar');
    }
  }

  async function doClose(seasonId) {
    if (!confirm('¿Cerrar temporada? Se calcularán posiciones finales y se asignará prestigio.')) return;
    try {
      const { data } = await api.post(`/admin/seasons/${seasonId}/close`);
      toast.success(`Temporada cerrada · ${data.total_players} jugadores · ${data.prestige_awarded_total.toLocaleString()} prestigio total`);
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al cerrar');
    }
  }

  async function doCreate(e) {
    e.preventDefault();
    setCreating(true);
    try {
      await api.post('/admin/seasons', {
        name: form.name,
        starts_at: new Date(form.starts_at).toISOString(),
        ends_at: new Date(form.ends_at).toISOString(),
        description: form.description || null,
      });
      toast.success('Temporada creada en DRAFT');
      setForm({ name: '', starts_at: '', ends_at: '', description: '' });
      await load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al crear');
    } finally {
      setCreating(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-6 py-10">
        <header className="mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-elite-gold/10 border border-elite-gold/30 mb-3">
            <Shield size={12} className="text-elite-gold" />
            <span className="text-[10px] tracking-widest uppercase text-elite-gold">Panel admin</span>
          </div>
          <h1 className="font-display text-3xl font-bold">Gestión de temporadas</h1>
          <p className="text-white/50 mt-1 text-sm">Cerrar la temporada activa, crear la siguiente, y previsualizar la regla de reset.</p>
        </header>

        {/* Promovidos en temporada actual */}
        {active && (
          <section className="mb-8 p-6 rounded-2xl bg-gradient-to-br from-elite-gold/5 via-bg-surface to-bg-surface border border-elite-gold/20">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg font-semibold flex items-center gap-2">
                <Crown size={18} className="text-elite-gold" />
                Promovidos en {active.name}
              </h2>
              <span className="text-xs text-white/40">{promotedNow.length} jugadores</span>
            </div>
            <p className="text-xs text-white/50 mb-4">
              Estos jugadores comenzaron como Duelista N10 por haber alcanzado Maestro o Campeón en la temporada anterior. Sus beneficios se evalúan con el nivel actual — no llevan Catálogo Pro consigo.
            </p>
            {promotedNow.length === 0 ? (
              <p className="text-white/40 text-sm">Ninguno aún.</p>
            ) : (
              <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-2">
                {promotedNow.map((p) => (
                  <div key={p.id} className="px-3 py-2 rounded-lg bg-bg-elevated/60 border border-bg-border flex items-center gap-2">
                    <Sparkles size={12} className="text-elite-gold" />
                    <span className="text-sm">{p.alias}</span>
                    <span className="ml-auto font-mono text-[10px] text-white/40">{p.elite_id_code}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        )}

        {/* Listado de temporadas */}
        <section className="mb-8">
          <h2 className="font-display text-lg font-semibold mb-3">Temporadas</h2>
          <div className="space-y-2">
            {seasons.map((s) => (
              <div key={s.id} className="p-4 rounded-xl bg-bg-surface border border-bg-border flex items-center justify-between flex-wrap gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-white/50">T{s.number}</span>
                    <span className="font-semibold">{s.name}</span>
                    <StatusBadge status={s.status} />
                  </div>
                  <p className="text-xs text-white/40 mt-1">
                    {new Date(s.starts_at).toLocaleDateString()} → {new Date(s.ends_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {s.status === 'ACTIVE' && (
                    <button onClick={() => doClose(s.id)}
                      className="px-3 py-1.5 rounded-md bg-rose-500/10 text-rose-300 border border-rose-500/30 text-xs hover:bg-rose-500/20 transition flex items-center gap-1.5">
                      <Lock size={12} /> Cerrar temporada
                    </button>
                  )}
                  {s.status === 'DRAFT' && (
                    <>
                      <button onClick={() => doPreview(s.id)} disabled={previewing === s.id}
                        className="px-3 py-1.5 rounded-md bg-white/5 border border-white/10 text-xs hover:bg-white/10 transition flex items-center gap-1.5 disabled:opacity-50">
                        <Sparkles size={12} /> {previewing === s.id ? 'Calculando…' : 'Preview reset'}
                      </button>
                      <button onClick={() => doActivate(s.id)}
                        className="px-3 py-1.5 rounded-md bg-elite-violet/20 text-elite-violet border border-elite-violet/40 text-xs hover:bg-elite-violet/30 transition flex items-center gap-1.5">
                        <Play size={12} /> Activar
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Preview de reset */}
        {preview && (
          <motion.section
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="mb-8 p-6 rounded-2xl bg-bg-surface border border-elite-violet/30"
          >
            <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
              <h2 className="font-display text-lg font-semibold flex items-center gap-2">
                <AlertTriangle size={18} className="text-elite-gold" />
                Preview — {preview.target_season_name}
              </h2>
              <button onClick={() => setPreview(null)} className="text-xs text-white/50 hover:text-white">Cerrar preview</button>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 mb-4">
              <Pill label="Promovidos a Duelista N10" value={preview.promoted_count} color="gold" />
              <Pill label="Inician como Iniciado N1" value={preview.regular_count} color="default" />
            </div>
            <div className="rounded-xl border border-bg-border overflow-hidden bg-bg-elevated/30 max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-bg-elevated/80 sticky top-0">
                  <tr className="text-left text-[10px] tracking-widest uppercase text-white/50">
                    <th className="px-3 py-2">Jugador</th>
                    <th className="px-3 py-2">Rango previo</th>
                    <th className="px-3 py-2">→</th>
                    <th className="px-3 py-2">Inicio</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.rows.map((row) => (
                    <tr key={row.player_id} className="border-b border-bg-border last:border-0">
                      <td className="px-3 py-2 font-medium">{row.alias}</td>
                      <td className="px-3 py-2 text-white/60 text-xs">{row.previous_max_rank || '—'}</td>
                      <td className="px-3 py-2 text-white/30">→</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <RankBadge rank={row.starting_rank} level={row.starting_level} size="sm" />
                          {row.was_promoted_start && <Sparkles size={11} className="text-elite-gold" />}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.section>
        )}

        {/* Crear nueva temporada */}
        <section>
          <h2 className="font-display text-lg font-semibold mb-3 flex items-center gap-2">
            <Plus size={16} /> Crear nueva temporada
          </h2>
          <form onSubmit={doCreate} className="p-6 rounded-2xl bg-bg-surface border border-bg-border space-y-4">
            <p className="text-xs text-white/40 flex items-start gap-2">
              <Calendar size={12} className="mt-0.5" />
              Quedará en estado DRAFT. La activación aplica la regla de reset (Maestro/Campeón → Duelista N10).
            </p>
            <div className="grid sm:grid-cols-2 gap-4">
              <Input label="Nombre" value={form.name} onChange={(v) => setForm({ ...form, name: v })} required />
              <Input label="Descripción" value={form.description} onChange={(v) => setForm({ ...form, description: v })} />
              <Input label="Inicio" type="datetime-local" value={form.starts_at} onChange={(v) => setForm({ ...form, starts_at: v })} required />
              <Input label="Fin" type="datetime-local" value={form.ends_at} onChange={(v) => setForm({ ...form, ends_at: v })} required />
            </div>
            <button type="submit" disabled={creating}
              className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white text-sm font-semibold hover:shadow-glow-violet transition disabled:opacity-50">
              {creating ? 'Creando…' : 'Crear temporada (DRAFT)'}
            </button>
          </form>
        </section>
      </div>
    </Layout>
  );
}

function StatusBadge({ status }) {
  const map = {
    ACTIVE: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
    DRAFT: 'bg-white/5 text-white/60 border-white/10',
    CLOSED: 'bg-white/5 text-white/40 border-white/10',
  };
  return <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${map[status]}`}>{status}</span>;
}

function Pill({ label, value, color }) {
  const cls = color === 'gold'
    ? 'bg-elite-gold/10 border-elite-gold/30 text-elite-gold'
    : 'bg-white/5 border-white/10 text-white/80';
  return (
    <div className={`p-3 rounded-lg border ${cls}`}>
      <p className="text-[10px] tracking-widest uppercase opacity-70">{label}</p>
      <p className="font-mono text-xl font-bold mt-0.5">{value}</p>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text', required }) {
  return (
    <label className="block">
      <span className="text-xs text-white/60 mb-1.5 block">{label}</span>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required}
        className="w-full px-3 py-2.5 rounded-lg bg-bg-elevated border border-bg-border focus:border-elite-violet/60 outline-none text-sm"
      />
    </label>
  );
}
