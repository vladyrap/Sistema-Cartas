import { useEffect, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Activity, Crown, Shield } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../lib/api';
import { useAuth } from '../lib/useAuth';
import { useGuild } from '../lib/useGuild';
import { describeAction, formatPayload } from '../lib/activityActions';

export default function GuildAdminActivity() {
  const { isAuthed, loading } = useAuth();
  const { current } = useGuild();
  const [entries, setEntries] = useState([]);
  const [loadingList, setLoadingList] = useState(true);
  const [filter, setFilter] = useState('');

  async function load() {
    if (!current) return;
    setLoadingList(true);
    try {
      const r = await api.get(`/guilds/${current.guild.id}/activity?limit=200`);
      setEntries(r.data);
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
          <p className="text-rose-300">Solo el Maestro del Gremio puede ver la auditoría.</p>
          <Link to="/guilds" className="inline-block mt-4 text-sm text-elite-violet hover:text-white">← Volver</Link>
        </div>
      </Layout>
    );
  }

  const filtered = entries.filter((e) => {
    if (!filter) return true;
    const q = filter.toLowerCase();
    return e.action.toLowerCase().includes(q)
      || (e.admin_alias || '').toLowerCase().includes(q)
      || (e.admin_email || '').toLowerCase().includes(q)
      || (e.payload || '').toLowerCase().includes(q);
  });

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <div className="flex items-center gap-2 text-sm text-white/50 mb-2">
          <Crown size={14} className="text-elite-gold" />
          <span>Maestro del Gremio</span>
        </div>
        <h1 className="font-display text-3xl font-bold mb-1">Actividad de {current.guild.name}</h1>
        <p className="text-sm text-white/50 mb-6">Auditoría de las últimas {entries.length} acciones administrativas.</p>

        <input
          type="text" value={filter} onChange={(e) => setFilter(e.target.value)}
          placeholder="Filtrar por acción, admin o contenido..."
          className="w-full px-3 py-2 mb-5 rounded-lg bg-bg-elevated border border-bg-border text-sm placeholder:text-white/30 focus:outline-none focus:border-elite-violet/60"
        />

        {loadingList ? (
          <p className="text-white/40 text-sm">Cargando…</p>
        ) : filtered.length === 0 ? (
          <div className="p-10 rounded-2xl bg-bg-surface border border-bg-border text-center text-white/40 text-sm">
            <Activity size={28} className="mx-auto mb-2 opacity-50" />
            Sin actividad registrada aún.
          </div>
        ) : (
          <div className="rounded-2xl bg-bg-surface border border-bg-border overflow-hidden divide-y divide-bg-border/60">
            {filtered.map((e, i) => {
              const meta = describeAction(e);
              const detail = formatPayload(e);
              const date = new Date(e.created_at);
              return (
                <motion.div
                  key={e.id}
                  initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i * 0.01, 0.4) }}
                  className="px-4 py-3 flex items-start gap-3 hover:bg-white/[0.02]"
                >
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-bg-elevated border border-white/5 flex-shrink-0`}>
                    <meta.Icon size={14} className={meta.color} />
                  </div>
                  <div className="flex-grow min-w-0">
                    <p className="text-sm leading-snug">
                      <span className="font-semibold">{e.admin_alias || e.admin_email}</span>
                      <span className="text-white/60"> {meta.verb}</span>
                      {detail && <span className="ml-1 font-semibold">{detail}</span>}
                    </p>
                    <p className="text-[10px] text-white/40 font-mono mt-0.5">
                      {date.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })} · {e.action}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </Layout>
  );
}
