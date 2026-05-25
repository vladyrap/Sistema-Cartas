import { useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Users, Crown, Hammer, Sword, Shield, X, Save } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../lib/api';
import { useAuth } from '../lib/useAuth';
import { useGuild } from '../lib/useGuild';

const ROLES = [
  { value: 'MEMBER',      label: 'Aventurero',   Icon: Shield,  cls: 'text-white/70' },
  { value: 'ORGANIZER',   label: 'Organizador',  Icon: Hammer,  cls: 'text-elite-blue' },
  { value: 'JUDGE',       label: 'Juez',         Icon: Sword,   cls: 'text-elite-magenta' },
  { value: 'GUILD_ADMIN', label: 'Maestro',      Icon: Crown,   cls: 'text-elite-gold' },
];
const ROLE_META = Object.fromEntries(ROLES.map((r) => [r.value, r]));

export default function GuildAdminMembers() {
  const { isAuthed, user, loading } = useAuth();
  const { current } = useGuild();
  const [members, setMembers] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [saving, setSaving] = useState(null);
  const [filter, setFilter] = useState('');
  const [confirmKick, setConfirmKick] = useState(null);

  async function load() {
    if (!current) return;
    setLoadingList(true);
    try {
      const r = await api.get(`/guilds/${current.guild.id}/members`);
      setMembers(r.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setLoadingList(false); }
  }

  useEffect(() => { load(); }, [current?.guild?.id]);

  if (loading) return <Layout><div className="p-10 text-white/40">Cargando…</div></Layout>;
  if (!isAuthed) return <Navigate to="/login" replace />;
  if (!current) {
    return <Layout><div className="max-w-3xl mx-auto px-6 py-16 text-center text-white/60">Selecciona un Gremio.</div></Layout>;
  }
  if (current.role !== 'GUILD_ADMIN') {
    return (
      <Layout>
        <div className="max-w-3xl mx-auto px-6 py-16 text-center">
          <Shield size={32} className="mx-auto text-rose-400/60 mb-3" />
          <p className="text-rose-300">Solo el Maestro del Gremio puede gestionar miembros.</p>
          <Link to="/guilds" className="inline-block mt-4 text-sm text-elite-violet hover:text-white">← Volver</Link>
        </div>
      </Layout>
    );
  }

  async function changeRole(m, newRole) {
    if (newRole === m.role) return;
    setSaving(m.user_id);
    try {
      await api.patch(`/guilds/${current.guild.id}/members/${m.user_id}/role`, { role: newRole });
      toast.success(`Rol actualizado a ${ROLE_META[newRole].label}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setSaving(null); }
  }

  async function kick() {
    if (!confirmKick) return;
    setSaving(confirmKick.user_id);
    try {
      await api.delete(`/guilds/${current.guild.id}/members/${confirmKick.user_id}`);
      toast.success(`${confirmKick.alias || confirmKick.email} removido del Gremio`);
      setConfirmKick(null);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setSaving(null); }
  }

  const filtered = members.filter((m) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return (m.alias || '').toLowerCase().includes(q)
      || (m.email || '').toLowerCase().includes(q)
      || (m.elite_id_code || '').toLowerCase().includes(q);
  });

  const counts = ROLES.map((r) => ({
    ...r,
    n: members.filter((m) => m.role === r.value).length,
  }));

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-white/50 mb-2">
          <Crown size={14} className="text-elite-gold" />
          <span>Maestro del Gremio</span>
        </div>
        <h1 className="font-display text-3xl font-bold mb-1">Miembros de {current.guild.name}</h1>
        <p className="text-sm text-white/50 mb-6">{members.length} miembros activos</p>

        {/* Stats por rol */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
          {counts.map(({ value, label, Icon, cls, n }) => (
            <div key={value} className="p-3 rounded-xl bg-bg-surface border border-bg-border">
              <Icon size={14} className={cls} />
              <p className="text-2xl font-display font-bold mt-1.5">{n}</p>
              <p className="text-[10px] uppercase tracking-wider text-white/40">{label}{n !== 1 && 's'}</p>
            </div>
          ))}
        </div>

        {/* Filtro */}
        <input
          type="text" value={filter} onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar por alias, email o Elite ID..."
          className="w-full px-3 py-2 mb-3 rounded-lg bg-bg-elevated border border-bg-border text-sm placeholder:text-white/30 focus:outline-none focus:border-elite-violet/60"
        />

        {loadingList ? (
          <p className="text-white/40 text-sm">Cargando…</p>
        ) : filtered.length === 0 ? (
          <div className="p-10 rounded-2xl bg-bg-surface border border-bg-border text-center text-white/40 text-sm">
            <Users size={28} className="mx-auto mb-2 opacity-50" />
            Sin miembros que coincidan.
          </div>
        ) : (
          <div className="rounded-2xl bg-bg-surface border border-bg-border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-bg-elevated/50 text-[10px] uppercase tracking-widest text-white/40">
                <tr>
                  <th className="text-left px-3 py-2.5 font-medium">Miembro</th>
                  <th className="text-left px-3 py-2.5 font-medium hidden sm:table-cell">Desde</th>
                  <th className="text-left px-3 py-2.5 font-medium">Rol</th>
                  <th className="text-right px-3 py-2.5 font-medium">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m, i) => {
                  const isMe = m.user_id === user.id;
                  const meta = ROLE_META[m.role];
                  const RoleIcon = meta?.Icon || Shield;
                  return (
                    <motion.tr
                      key={m.user_id}
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.02 }}
                      className="border-t border-bg-border hover:bg-white/[0.02]"
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold">{m.alias || m.email}</span>
                          {isMe && <span className="text-[10px] px-1.5 py-0.5 rounded bg-elite-violet/20 text-elite-violet">tú</span>}
                        </div>
                        <p className="text-[10px] text-white/40 font-mono">{m.elite_id_code || m.email}</p>
                      </td>
                      <td className="px-3 py-2.5 text-white/50 text-xs hidden sm:table-cell">
                        {m.joined_at ? new Date(m.joined_at).toLocaleDateString('es-CL') : '—'}
                      </td>
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          <RoleIcon size={12} className={meta?.cls} />
                          <select
                            value={m.role}
                            onChange={(e) => changeRole(m, e.target.value)}
                            disabled={saving === m.user_id}
                            title={isMe ? 'Solo puedes auto-degradarte si hay otro Maestro' : ''}
                            className="bg-bg-elevated border border-bg-border rounded px-2 py-1 text-xs focus:outline-none focus:border-elite-violet/60 disabled:opacity-50"
                          >
                            {ROLES.map((r) => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                        </div>
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {!isMe && (
                          <button
                            onClick={() => setConfirmKick(m)}
                            disabled={saving === m.user_id}
                            className="inline-flex items-center gap-1 text-xs text-rose-400 hover:text-rose-300 disabled:opacity-50"
                          >
                            <X size={12} /> Quitar
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Confirm kick modal */}
      {confirmKick && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setConfirmKick(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md p-5 rounded-2xl bg-bg-surface border border-bg-border">
            <h3 className="font-display font-semibold mb-2">¿Quitar a {confirmKick.alias || confirmKick.email}?</h3>
            <p className="text-sm text-white/60 mb-4">
              Esta acción retira al miembro del Gremio. Podrá solicitar volver a unirse después.
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmKick(null)} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm">
                Cancelar
              </button>
              <button onClick={kick} disabled={saving !== null}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm disabled:opacity-50">
                {saving !== null ? 'Quitando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
