import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { Shield, Users, Calendar, Trophy, Sparkles, ArrowRight, Check, Clock } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../lib/api';
import { useAuth } from '../lib/useAuth';
import { useGuild } from '../lib/useGuild';

export default function GuildLanding() {
  const { slug } = useParams();
  const { isAuthed } = useAuth();
  const { myGuilds, refresh, switchTo } = useGuild();
  const [guild, setGuild] = useState(null);
  const [loading, setLoading] = useState(true);
  const [events, setEvents] = useState([]);
  const [activeSeason, setActiveSeason] = useState(null);
  const [myRequest, setMyRequest] = useState(null);
  const [joining, setJoining] = useState(false);
  const [requesting, setRequesting] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const g = (await api.get(`/guilds/${slug}`)).data;
        setGuild(g);
        // Cargar eventos + temporada del Gremio (usando header X-Guild-Id ad-hoc)
        const headers = { 'X-Guild-Id': String(g.id) };
        const [ev, se] = await Promise.all([
          api.get('/events', { headers }).catch(() => ({ data: [] })),
          api.get('/seasons/active', { headers }).catch(() => ({ data: null })),
        ]);
        setEvents(ev.data.slice(0, 6));
        setActiveSeason(se.data);

        if (isAuthed) {
          const reqs = (await api.get('/guilds/me/requests').catch(() => ({ data: [] }))).data;
          const pending = reqs.find((r) => r.guild_id === g.id && r.status === 'PENDING');
          setMyRequest(pending || null);
        }
      } catch (e) {
        if (e.response?.status === 404) setGuild(null);
        else toast.error(e.response?.data?.detail || 'Error');
      } finally { setLoading(false); }
    })();
  }, [slug, isAuthed]);

  const amMember = guild && myGuilds.some((g) => g.guild.id === guild.id);
  const accent = guild?.accent_color || '#8b5cf6';

  async function requestJoin() {
    if (!isAuthed) { window.location.href = '/login'; return; }
    setRequesting(true);
    try {
      const { data } = await api.post(`/guilds/${guild.id}/join`, { message: message || null });
      setMyRequest(data);
      setMessage('');
      toast.success('Solicitud enviada — espera la aprobación del Maestro');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setRequesting(false); }
  }

  async function cancelRequest() {
    if (!myRequest) return;
    setRequesting(true);
    try {
      await api.delete(`/guilds/join-requests/${myRequest.id}`);
      setMyRequest(null);
      toast.success('Solicitud cancelada');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setRequesting(false); }
  }

  if (loading) {
    return <Layout><div className="max-w-5xl mx-auto px-6 py-16 text-white/40">Cargando…</div></Layout>;
  }
  if (!guild) {
    return (
      <Layout>
        <div className="max-w-5xl mx-auto px-6 py-16 text-center">
          <Shield size={32} className="mx-auto text-white/30 mb-3" />
          <p className="text-white/60">Gremio no encontrado.</p>
          <Link to="/guilds" className="inline-block mt-4 text-sm text-elite-violet hover:text-white">← Volver al directorio</Link>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      {/* Banner */}
      <div className="relative">
        {guild.banner_url ? (
          <div
            className="h-44 sm:h-56 bg-cover bg-center"
            style={{ backgroundImage: `url(${guild.banner_url})` }}
          />
        ) : (
          <div className="h-44 sm:h-56" style={{ background: `linear-gradient(135deg, ${accent}33, ${accent}11)` }} />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent to-bg" />
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 -mt-16 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="p-5 sm:p-6 rounded-2xl bg-bg-surface border border-bg-border"
          style={{ borderTopColor: accent, borderTopWidth: 3 }}
        >
          <div className="flex items-start gap-4">
            {guild.logo_url ? (
              <img src={guild.logo_url} alt="" className="w-20 h-20 rounded-xl object-cover ring-2 ring-bg-border" />
            ) : (
              <div
                className="w-20 h-20 rounded-xl flex items-center justify-center"
                style={{ background: `linear-gradient(135deg, ${accent}, ${accent}aa)` }}
              >
                <Shield size={32} className="text-white" />
              </div>
            )}
            <div className="flex-grow min-w-0">
              <p className="font-mono text-[10px] tracking-widest uppercase text-white/40 mb-1">{guild.code}</p>
              <h1 className="font-display text-2xl sm:text-3xl font-bold leading-tight">{guild.name}</h1>
              {guild.tagline && <p className="text-white/70 italic mt-1 text-sm">"{guild.tagline}"</p>}
              <div className="flex items-center gap-4 mt-3 text-xs text-white/50">
                <span className="inline-flex items-center gap-1"><Users size={12} /> {guild.member_count} miembros</span>
                {activeSeason && <span className="inline-flex items-center gap-1"><Trophy size={12} /> {activeSeason.name}</span>}
              </div>
            </div>

            {/* Estado de membresía */}
            <div className="hidden sm:block">
              {amMember ? (
                <button
                  onClick={() => switchTo(guild.id)}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm border"
                  style={{ borderColor: `${accent}66`, color: accent, background: `${accent}11` }}
                >
                  <Check size={14} /> Eres miembro · Cambiar a este Gremio
                </button>
              ) : myRequest ? (
                <button
                  onClick={cancelRequest}
                  disabled={requesting}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/30 text-sm hover:bg-amber-500/20 disabled:opacity-50"
                >
                  <Clock size={14} /> Solicitud pendiente · Cancelar
                </button>
              ) : null}
            </div>
          </div>

          {guild.description && (
            <p className="mt-5 text-sm text-white/70 leading-relaxed whitespace-pre-line">{guild.description}</p>
          )}
        </motion.div>

        {/* Bloque solicitar (mobile + no miembro/sin request) */}
        {!amMember && !myRequest && (
          <div className="mt-5 p-5 rounded-2xl bg-bg-surface border border-bg-border">
            <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
              <Sparkles size={14} style={{ color: accent }} /> ¿Quieres unirte?
            </h2>
            <p className="text-xs text-white/50 mb-3">
              Tu solicitud queda pendiente hasta que el Maestro del Gremio la apruebe.
            </p>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Mensaje opcional para el Maestro (presentación, juegos que practicas, etc.)"
              rows={3}
              className="w-full px-3 py-2 rounded-lg bg-bg-elevated border border-bg-border text-sm placeholder:text-white/30 focus:outline-none focus:border-elite-violet/60 resize-none mb-3"
            />
            <button
              onClick={requestJoin}
              disabled={requesting}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white font-medium hover:shadow-lg transition disabled:opacity-50 text-sm"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accent}cc)` }}
            >
              <ArrowRight size={14} /> {requesting ? 'Enviando…' : 'Solicitar unirme'}
            </button>
          </div>
        )}

        {/* Eventos próximos del Gremio */}
        <div className="mt-6">
          <h2 className="font-display font-semibold mb-3 flex items-center gap-2">
            <Calendar size={14} style={{ color: accent }} /> Próximos eventos
          </h2>
          {events.length === 0 ? (
            <p className="text-white/40 text-sm">Sin eventos publicados.</p>
          ) : (
            <div className="grid sm:grid-cols-2 gap-3">
              {events.map((ev) => (
                <Link
                  key={ev.id}
                  to={`/events/${ev.id}`}
                  className="block p-4 rounded-xl bg-bg-surface border border-bg-border hover:border-white/20 transition"
                  onClick={() => switchTo(guild.id)}
                >
                  <p className="font-semibold leading-tight">{ev.name}</p>
                  <p className="text-xs text-white/50 mt-1">
                    {new Date(ev.starts_at).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}
                  </p>
                  <div className="flex items-center justify-between mt-2 text-[10px] text-white/40">
                    <span>{ev.event_type}</span>
                    <span>{ev.registered_count}/{ev.slots} cupos</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div className="h-12" />
      </div>
    </Layout>
  );
}
