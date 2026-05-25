import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Shield, Users, Crown, Check, ArrowRight, Compass, Clock, X, LogOut } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../lib/api';
import { useAuth } from '../lib/useAuth';
import { useGuild } from '../lib/useGuild';

export default function Guilds() {
  const { isAuthed } = useAuth();
  const { myGuilds, switchTo, refresh } = useGuild();
  const [leaving, setLeaving] = useState(null);
  const [confirmLeave, setConfirmLeave] = useState(null);
  const [guilds, setGuilds] = useState([]);
  const [pendingByGuild, setPendingByGuild] = useState({}); // {guild_id: request_id}
  const [myRequests, setMyRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState(null);

  async function refreshRequests() {
    if (!isAuthed) return;
    try {
      const r = await api.get('/guilds/me/requests');
      setMyRequests(r.data);
      const map = {};
      r.data.forEach((req) => {
        if (req.status === 'PENDING') map[req.guild_id] = req.id;
      });
      setPendingByGuild(map);
    } catch { /* silent */ }
  }

  useEffect(() => {
    api.get('/guilds').then((r) => setGuilds(r.data)).finally(() => setLoading(false));
    refreshRequests();
  }, [isAuthed]);

  async function cancelRequest(reqId) {
    try {
      await api.delete(`/guilds/join-requests/${reqId}`);
      toast.success('Solicitud cancelada');
      refreshRequests();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  }

  async function leaveGuild() {
    if (!confirmLeave) return;
    setLeaving(confirmLeave.id);
    try {
      await api.post(`/guilds/${confirmLeave.id}/leave`);
      toast.success(`Saliste de ${confirmLeave.name}`);
      setConfirmLeave(null);
      await refresh();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setLeaving(null); }
  }

  const guildById = guilds.reduce((acc, g) => { acc[g.id] = g; return acc; }, {});
  const visibleRequests = myRequests.filter((r) => r.status !== 'CANCELLED');

  const myIds = new Set(myGuilds.map((g) => g.guild.id));

  async function requestJoin(g) {
    if (!isAuthed) { window.location.href = '/login'; return; }
    setRequesting(g.id);
    try {
      await api.post(`/guilds/${g.id}/join`, {});
      toast.success('Solicitud enviada — espera la aprobación del Maestro');
      refreshRequests();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setRequesting(null); }
  }

  return (
    <Layout>
      <div className="max-w-6xl mx-auto px-6 py-10">
        <header className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-elite-violet/10 border border-elite-violet/30 mb-3">
            <Compass size={12} className="text-elite-violet" />
            <span className="text-[10px] tracking-widest uppercase text-elite-violet">Directorio</span>
          </div>
          <h1 className="font-display text-4xl font-bold">Gremios de Aventureros</h1>
          <p className="text-white/50 mt-2 text-sm max-w-xl mx-auto">
            Cada Gremio es una tienda TCG. Únete a uno o varios para participar en su Ruta del Campeón.
          </p>
        </header>

        {loading ? (
          <p className="text-center text-white/40">Cargando…</p>
        ) : guilds.length === 0 ? (
          <p className="text-center text-white/40">No hay Gremios disponibles aún.</p>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {guilds.map((g, i) => {
              const am = myIds.has(g.id);
              return (
                <motion.div
                  key={g.id}
                  initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className="p-5 rounded-2xl bg-bg-surface border border-bg-border hover:border-elite-violet/40 transition flex flex-col"
                  style={g.accent_color ? { borderTopColor: g.accent_color, borderTopWidth: 3 } : {}}
                >
                  <Link to={`/guilds/${g.code}`} className="flex items-start gap-3 mb-3 hover:opacity-90">
                    {g.logo_url ? (
                      <img src={g.logo_url} alt="" className="w-12 h-12 rounded-lg object-cover" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-elite-violet to-elite-blue flex items-center justify-center">
                        <Shield size={20} className="text-white" />
                      </div>
                    )}
                    <div className="flex-grow min-w-0">
                      <h3 className="font-display font-bold leading-tight truncate">{g.name}</h3>
                      <p className="font-mono text-[10px] text-white/40 mt-0.5">{g.code}</p>
                    </div>
                  </Link>

                  {g.tagline && <p className="text-xs text-white/70 italic mb-2 leading-snug">"{g.tagline}"</p>}
                  {g.description && <p className="text-xs text-white/50 leading-relaxed flex-grow line-clamp-3">{g.description}</p>}

                  <div className="flex items-center justify-between mt-4 pt-3 border-t border-white/5">
                    <span className="flex items-center gap-1 text-xs text-white/50">
                      <Users size={11} /> {g.member_count} miembros
                    </span>
                    {am ? (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-300">
                        <Check size={11} /> Miembro
                      </span>
                    ) : pendingByGuild[g.id] ? (
                      <span className="inline-flex items-center gap-1 text-xs text-amber-300">
                        <Clock size={11} /> Pendiente
                      </span>
                    ) : (
                      <button onClick={() => requestJoin(g)} disabled={requesting === g.id}
                        className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded bg-elite-violet/10 text-elite-violet border border-elite-violet/30 hover:bg-elite-violet/20 transition disabled:opacity-50">
                        {requesting === g.id ? 'Enviando…' : (<><ArrowRight size={11} /> Solicitar</>)}
                      </button>
                    )}
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}

        {isAuthed && visibleRequests.length > 0 && (
          <div className="mt-12 p-5 rounded-2xl bg-amber-500/5 border border-amber-500/20">
            <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
              <Clock size={14} className="text-amber-300" /> Mis solicitudes ({visibleRequests.length})
            </h2>
            <div className="space-y-2">
              {visibleRequests.map((r) => {
                const g = guildById[r.guild_id];
                const isPending = r.status === 'PENDING';
                const isApproved = r.status === 'APPROVED';
                const isRejected = r.status === 'REJECTED';
                return (
                  <div key={r.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-elevated/40 border border-bg-border">
                    {g?.logo_url ? (
                      <img src={g.logo_url} alt="" className="w-7 h-7 rounded object-cover" />
                    ) : (
                      <div className="w-7 h-7 rounded bg-gradient-to-br from-elite-violet to-elite-blue flex items-center justify-center">
                        <Shield size={12} className="text-white" />
                      </div>
                    )}
                    <div className="flex-grow min-w-0">
                      <p className="text-sm font-semibold truncate">{g?.name || `Gremio #${r.guild_id}`}</p>
                      {r.message && <p className="text-[10px] text-white/40 truncate italic">"{r.message}"</p>}
                      {r.decision_note && <p className="text-[10px] text-white/50 truncate">Nota: {r.decision_note}</p>}
                    </div>
                    <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${
                      isPending ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                        : isApproved ? 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        : 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                    }`}>
                      {isPending ? 'Pendiente' : isApproved ? 'Aprobada' : 'Rechazada'}
                    </span>
                    {isPending && (
                      <button onClick={() => cancelRequest(r.id)} className="text-white/40 hover:text-rose-300" title="Cancelar">
                        <X size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {isAuthed && myGuilds.length > 0 && (
          <div className="mt-12 p-5 rounded-2xl bg-elite-violet/5 border border-elite-violet/20">
            <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
              <Crown size={14} className="text-elite-gold" /> Mis Gremios ({myGuilds.length})
            </h2>
            <div className="grid sm:grid-cols-2 gap-2">
              {myGuilds.map(({ guild: g, role }) => (
                <div key={g.id} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-bg-elevated/40 border border-bg-border">
                  {g.logo_url ? (
                    <img src={g.logo_url} alt="" className="w-7 h-7 rounded object-cover" />
                  ) : (
                    <div className="w-7 h-7 rounded bg-gradient-to-br from-elite-violet to-elite-blue flex items-center justify-center">
                      <Shield size={12} className="text-white" />
                    </div>
                  )}
                  <div className="flex-grow min-w-0">
                    <p className="text-sm font-semibold truncate">{g.name}</p>
                    <p className="text-[10px] text-white/50">{role.toLowerCase().replace('_', ' ')}</p>
                  </div>
                  <button onClick={() => switchTo(g.id)} className="text-xs text-elite-blue hover:text-white">
                    Cambiar
                  </button>
                  <button
                    onClick={() => setConfirmLeave(g)}
                    disabled={leaving === g.id}
                    className="text-white/40 hover:text-rose-300 disabled:opacity-50"
                    title={role === 'GUILD_ADMIN' ? 'Salir (debes tener otro Maestro)' : 'Salir del Gremio'}
                  >
                    <LogOut size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {confirmLeave && (() => {
        const myEntry = myGuilds.find((mg) => mg.guild.id === confirmLeave.id);
        const isMaestro = myEntry?.role === 'GUILD_ADMIN';
        return (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4" onClick={() => setConfirmLeave(null)}>
          <div onClick={(e) => e.stopPropagation()} className="w-full max-w-md p-5 rounded-2xl bg-bg-surface border border-bg-border">
            <h3 className="font-display font-semibold mb-2">¿Salir de {confirmLeave.name}?</h3>
            <p className="text-sm text-white/60 mb-4">
              Perderás acceso a los eventos, productos y rankings de este Gremio. Tu progreso histórico se conserva. Podrás solicitar volver a unirte después.
            </p>
            {isMaestro && (
              <p className="text-xs text-amber-300 bg-amber-500/10 border border-amber-500/30 rounded-lg p-3 mb-4">
                Eres Maestro de este Gremio. Solo podrás salir si hay otro miembro con rol GUILD_ADMIN; de lo contrario, primero promueve a alguien en "Gestionar miembros".
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setConfirmLeave(null)} className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm">
                Cancelar
              </button>
              <button onClick={leaveGuild} disabled={leaving !== null}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-sm disabled:opacity-50">
                <LogOut size={13} /> {leaving !== null ? 'Saliendo…' : 'Confirmar salida'}
              </button>
            </div>
          </div>
        </div>
        );
      })()}
    </Layout>
  );
}
