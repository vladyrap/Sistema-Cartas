import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowLeft, Calendar, Users, Sparkles, Trophy, Check, X, Shield } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../lib/api';
import { useAuth } from '../lib/useAuth';
import { useLevelUp } from '../lib/useLevelUp';

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user, isAuthed } = useAuth();
  const { checkLevelUp } = useLevelUp();
  const isAdmin = user?.role === 'ADMIN';
  const [ev, setEv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  async function load() {
    setLoading(true);
    try {
      const path = isAuthed ? `/events/${id}/me` : `/events/${id}`;
      const { data } = await api.get(path);
      setEv(data);
    } catch (e) {
      setError(e.response?.data?.detail || 'Evento no encontrado');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id, isAuthed]);

  async function register() {
    if (!isAuthed) { navigate('/login'); return; }
    setSubmitting(true);
    try {
      await api.post(`/events/${id}/register`);
      toast.success('¡Inscripción confirmada!');
      await load();
      checkLevelUp();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo inscribir');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link to="/events" className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white mb-6">
          <ArrowLeft size={14} /> Volver a eventos
        </Link>

        {loading && <p className="text-white/40">Cargando…</p>}
        {error && <p className="text-rose-400">{error}</p>}

        {ev && (
          <div className="rounded-2xl bg-bg-surface border border-bg-border overflow-hidden">
            <div className="p-8 bg-gradient-to-br from-elite-violet/10 via-bg-surface to-bg-surface border-b border-bg-border">
              <p className="text-[10px] tracking-widest uppercase text-elite-violet font-semibold mb-2">{ev.event_type}</p>
              <h1 className="font-display text-3xl font-bold leading-tight">{ev.name}</h1>
              <div className="flex items-center gap-5 mt-5 text-sm text-white/70 flex-wrap">
                <span className="flex items-center gap-1.5"><Calendar size={14} className="text-elite-blue" /> {new Date(ev.starts_at).toLocaleString('es-CL')}</span>
                <span className="flex items-center gap-1.5"><Users size={14} className="text-elite-blue" /> {ev.registered_count}/{ev.slots} inscritos</span>
                {ev.price_clp > 0 && <span className="font-mono">${ev.price_clp.toLocaleString()} CLP</span>}
                <StatusPill status={ev.status} />
              </div>
            </div>

            {ev.description && (
              <div className="p-8">
                <h2 className="font-display text-base font-semibold mb-2 flex items-center gap-2">
                  <Sparkles size={14} className="text-elite-gold" /> Información
                </h2>
                <p className="text-white/70 text-sm leading-relaxed">{ev.description}</p>
              </div>
            )}

            <div className="p-8 border-t border-bg-border bg-bg-elevated/30 space-y-3">
              {ev.is_registered ? (
                <div className="px-5 py-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 inline-flex items-center gap-2">
                  <Check size={16} /> Estás inscrito en este evento
                </div>
              ) : ev.registered_count >= ev.slots ? (
                <div className="px-5 py-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 inline-flex items-center gap-2">
                  <X size={16} /> Sin cupos disponibles
                </div>
              ) : ev.status !== 'OPEN' && ev.status !== 'DRAFT' ? (
                <div className="px-5 py-3 rounded-lg bg-white/5 border border-white/10 text-white/50 inline-flex items-center gap-2">
                  Inscripciones cerradas
                </div>
              ) : (
                <button
                  onClick={register}
                  disabled={submitting}
                  className="px-6 py-3 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white font-semibold hover:shadow-glow-violet transition flex items-center gap-2 disabled:opacity-50"
                >
                  <Trophy size={16} /> {submitting ? 'Inscribiendo…' : 'Inscribirme'}
                </button>
              )}

              <p className="text-xs text-white/40">
                Al asistir ganas +100 EXP · +50 por ronda ganada · Top 8/4 y campeón otorgan EXP adicional.
              </p>

              {isAdmin && (
                <Link
                  to={`/admin/events/${ev.id}`}
                  className="inline-flex items-center gap-2 mt-3 text-xs px-3 py-1.5 rounded-md bg-elite-gold/10 text-elite-gold border border-elite-gold/30 hover:bg-elite-gold/20 transition"
                >
                  <Shield size={12} /> Gestionar como admin
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}

function StatusPill({ status }) {
  const map = {
    DRAFT: 'bg-white/5 text-white/60 border-white/10',
    OPEN: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
    CLOSED: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
    FINISHED: 'bg-elite-gold/10 text-elite-gold border-elite-gold/30',
    CANCELLED: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  };
  return <span className={`text-[10px] px-2 py-0.5 rounded border ${map[status] || map.DRAFT}`}>{status}</span>;
}
