import { useEffect, useState } from 'react';
import { Link, useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  ArrowLeft, Calendar, Users, Sparkles, Trophy, Check, X, Shield,
  CreditCard, Scroll, Gift, Tv, Zap, QrCode, Clock, AlertCircle,
} from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../lib/api';
import { useAuth } from '../lib/useAuth';
import { useLevelUp } from '../lib/useLevelUp';

export default function EventDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user, isAuthed } = useAuth();
  const { checkLevelUp } = useLevelUp();
  const isAdmin = user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN';
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

  // Vuelta desde MercadoPago: ?payment=success|failure|pending
  useEffect(() => {
    const p = searchParams.get('payment');
    if (!p) return;
    if (p === 'success') toast.success('Pago recibido — se confirma en segundos vía webhook', { duration: 6000 });
    else if (p === 'pending') toast('Pago pendiente de confirmación', { icon: '⏱' });
    else if (p === 'failure') toast.error('El pago no se completó');
    // limpiar query sin recargar
    window.history.replaceState({}, '', `/events/${id}`);
  }, [searchParams, id]);

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

  async function payRegistration() {
    if (!ev?.my_registration_id) return;
    setSubmitting(true);
    try {
      const r = await api.post(`/events/registrations/${ev.my_registration_id}/pay`);
      if (r.data.mock) {
        toast('MercadoPago en modo mock — un admin puede marcar tu pago manualmente', { icon: 'ℹ️', duration: 5000 });
      } else if (r.data.init_point) {
        window.location.href = r.data.init_point;
      } else {
        toast.error('No se pudo crear el checkout');
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al iniciar pago');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-6 py-10">
          <div className="rounded-3xl glass h-64 animate-pulse" />
        </div>
      </Layout>
    );
  }

  if (error || !ev) {
    return (
      <Layout>
        <div className="max-w-4xl mx-auto px-6 py-10 text-center">
          <AlertCircle className="mx-auto mb-3 text-rose-400" size={40} />
          <p className="text-rose-300">{error || 'Sin datos'}</p>
        </div>
      </Layout>
    );
  }

  const starts = new Date(ev.starts_at);
  const slotsPct = Math.min(100, Math.round((ev.registered_count / Math.max(1, ev.slots)) * 100));
  const isFull = ev.registered_count >= ev.slots;
  const isPaid = ev.my_payment_status === 'PAID';
  const needsPayment = ev.is_registered && ev.price_clp > 0 && !isPaid;
  const isLive = ev.status === 'CLOSED';
  const isFinished = ev.status === 'FINISHED';

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-6 py-10">
        <Link to="/events" className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white mb-6">
          <ArrowLeft size={14} /> Volver a eventos
        </Link>

        {/* HERO */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="relative rounded-3xl glass aurora-bg grain overflow-hidden mb-6"
        >
          <div className="relative p-8">
            <div className="flex items-center gap-2 flex-wrap mb-3">
              <span className="text-[10px] tracking-[0.3em] uppercase px-2.5 py-1 rounded-full bg-elite-violet/20 border border-elite-violet/40 text-elite-violet font-bold">
                {ev.event_type}
              </span>
              <StatusPill status={ev.status} />
              {isPaid && (
                <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 font-bold flex items-center gap-1">
                  <Check size={10} /> PAGADO
                </span>
              )}
            </div>

            <h1 className="font-display text-3xl md:text-5xl font-black leading-tight mb-4">
              {ev.name}
            </h1>

            <div className="grid sm:grid-cols-3 gap-3">
              <HeroStat icon={Calendar} label={starts.toLocaleDateString('es-CL', { weekday: 'long', day: 'numeric', month: 'long' })}
                sub={starts.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' }) + ' hrs'} />
              <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                <div className="flex items-center gap-2 text-sm text-white/80 mb-1.5">
                  <Users size={14} className="text-elite-blue shrink-0" />
                  <span className="font-bold">{ev.registered_count}/{ev.slots}</span>
                  <span className="text-white/40 text-xs">inscritos</span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }} animate={{ width: `${slotsPct}%` }}
                    className={`h-full ${isFull ? 'bg-rose-500' : slotsPct > 75 ? 'bg-amber-400' : 'bg-emerald-400'}`}
                  />
                </div>
              </div>
              <HeroStat
                icon={CreditCard}
                label={ev.price_clp > 0 ? `$${ev.price_clp.toLocaleString('es-CL')} CLP` : 'Gratis'}
                sub={ev.price_clp > 0 ? 'pago vía MercadoPago' : 'sin costo de entrada'}
              />
            </div>
          </div>
        </motion.div>

        {/* CTA de inscripción / pago */}
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08 }}
          className="rounded-2xl glass p-6 mb-6"
        >
          {ev.is_registered ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-emerald-300 font-bold">
                <Check size={18} /> Estás inscrito en este evento
              </div>
              {needsPayment && (
                <div className="rounded-xl bg-amber-500/10 border border-amber-400/40 p-4 flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="font-bold text-amber-200 flex items-center gap-2">
                      <Clock size={14} /> Pago pendiente
                      {ev.my_payment_expires_at && (
                        <ExpiryCountdown until={ev.my_payment_expires_at} />
                      )}
                    </div>
                    <p className="text-xs text-white/60 mt-1">
                      Tu cupo no está confirmado hasta pagar la entrada de ${ev.price_clp.toLocaleString('es-CL')} CLP.
                      {ev.my_payment_expires_at && ' Si no pagás a tiempo, el cupo se libera automáticamente.'}
                    </p>
                  </div>
                  <button
                    onClick={payRegistration}
                    disabled={submitting}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white font-bold shadow-lg shadow-sky-500/30 hover:scale-[1.02] transition disabled:opacity-50 flex items-center gap-2"
                  >
                    <CreditCard size={16} /> {submitting ? 'Abriendo…' : 'Pagar con MercadoPago'}
                  </button>
                </div>
              )}
            </div>
          ) : isFull ? (
            <WaitlistPanel eventId={ev.id} isAuthed={isAuthed} navigate={navigate} />
          ) : ev.status !== 'OPEN' && ev.status !== 'DRAFT' ? (
            <div className="flex items-center gap-2 text-white/50">
              Inscripciones cerradas
            </div>
          ) : (
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <div className="font-bold text-lg">¿Te sumás?</div>
                <p className="text-xs text-white/50">
                  +100 EXP por asistir · +50 por ronda ganada · Top 8 y campeón con bonus.
                  {ev.price_clp > 0 && ' Después de inscribirte podés pagar la entrada online.'}
                </p>
              </div>
              <button
                onClick={register}
                disabled={submitting}
                className="px-6 py-3 rounded-xl bg-gradient-to-r from-elite-violet to-elite-blue text-white font-bold shadow-lg shadow-elite-violet/30 hover:scale-[1.02] transition flex items-center gap-2 disabled:opacity-50"
              >
                <Trophy size={16} /> {submitting ? 'Inscribiendo…' : 'Inscribirme'}
              </button>
            </div>
          )}
        </motion.div>

        {/* Quick links del evento */}
        {(isLive || isFinished || ev.is_registered) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12 }}
            className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"
          >
            <QuickLink to={`/events/${ev.id}/spectate`} icon={Tv} label="Spectator" desc="Pairings + standings live" color="violet" />
            <QuickLink to={`/events/${ev.id}/universe`} icon={Zap} label="Universe" desc="Apuestas · hype · logros" color="fuchsia" />
            {ev.is_registered && (
              <QuickLink to={`/events/${ev.id}/checkin`} icon={QrCode} label="Check-in" desc="Tu QR de entrada" color="emerald" />
            )}
            {isFinished && (
              <QuickLink to={`/events/${ev.id}/timelapse`} icon={Clock} label="Replay" desc="Time-lapse del torneo" color="cyan" />
            )}
          </motion.div>
        )}

        {/* Secciones de contenido */}
        <div className="space-y-4">
          {ev.description && (
            <ContentSection icon={Sparkles} title="Información" color="text-elite-gold" text={ev.description} delay={0.15} />
          )}
          {ev.rules && (
            <ContentSection icon={Scroll} title="Reglas" color="text-elite-blue" text={ev.rules} delay={0.2} />
          )}
          {ev.prizes && (
            <ContentSection icon={Gift} title="Premios" color="text-elite-magenta" text={ev.prizes} delay={0.25} />
          )}
        </div>

        {isAdmin && (
          <div className="mt-6 flex gap-2 flex-wrap">
            <Link to={`/admin/events/${ev.id}`}
              className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-elite-gold/10 text-elite-gold border border-elite-gold/30 hover:bg-elite-gold/20 transition">
              <Shield size={12} /> Gestionar
            </Link>
            <Link to={`/admin/events/${ev.id}/pairings`}
              className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 transition">
              Pairings
            </Link>
            <Link to={`/admin/events/${ev.id}/health`}
              className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 transition">
              Health
            </Link>
            <Link to={`/admin/events/${ev.id}/checkin-desk`}
              className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-white/5 text-white/70 border border-white/10 hover:bg-white/10 transition">
              Mesa check-in
            </Link>
            {ev.price_clp > 0 && (
              <Link to={`/admin/events/${ev.id}/finance`}
                className="inline-flex items-center gap-2 text-xs px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/20 transition">
                💰 Caja
              </Link>
            )}
          </div>
        )}
      </div>
    </Layout>
  );
}

function WaitlistPanel({ eventId, isAuthed, navigate }) {
  const [wl, setWl] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await api.get(`/events/${eventId}/waitlist`);
      setWl(r.data);
    } catch {}
  };
  useEffect(() => { if (isAuthed) load(); }, [eventId, isAuthed]);

  const join = async () => {
    if (!isAuthed) { navigate('/login'); return; }
    setBusy(true);
    try {
      const r = await api.post(`/events/${eventId}/waitlist`);
      toast.success(`En lista de espera — posición #${r.data.position}`);
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setBusy(false); }
  };

  const leave = async () => {
    setBusy(true);
    try {
      await api.delete(`/events/${eventId}/waitlist`);
      toast.success('Saliste de la lista de espera');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-rose-300 font-bold">
        <X size={18} /> Sin cupos disponibles
      </div>
      {wl?.my_position ? (
        <div className="rounded-xl bg-violet-500/10 border border-violet-400/40 p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="font-bold text-violet-200">
              Estás #{wl.my_position} en la lista de espera
            </div>
            <p className="text-xs text-white/60 mt-1">
              Si se libera un cupo entrás automático y te avisamos. {wl.total_waiting} esperando en total.
            </p>
          </div>
          <button onClick={leave} disabled={busy}
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-rose-500/20 text-white/70 hover:text-rose-200 text-sm transition disabled:opacity-50">
            Salir de la lista
          </button>
        </div>
      ) : (
        <div className="rounded-xl bg-violet-500/10 border border-violet-400/40 p-4 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="font-bold text-violet-200">Lista de espera</div>
            <p className="text-xs text-white/60 mt-1">
              {wl?.total_waiting > 0 ? `${wl.total_waiting} esperando. ` : ''}
              Si alguien no paga a tiempo o se baja, entrás automático.
            </p>
          </div>
          <button onClick={join} disabled={busy}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-bold shadow-lg shadow-violet-500/30 hover:scale-[1.02] transition disabled:opacity-50">
            {busy ? 'Anotando…' : 'Anotarme en la lista'}
          </button>
        </div>
      )}
    </div>
  );
}

function ExpiryCountdown({ until }) {
  const [, force] = useState(0);
  useEffect(() => {
    const t = setInterval(() => force(x => x + 1), 30000);
    return () => clearInterval(t);
  }, []);
  const ms = new Date(until) - Date.now();
  if (ms <= 0) return <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/30 text-rose-200 font-mono">expirado</span>;
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const urgent = ms < 2 * 3600000;
  return (
    <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono font-bold ${
      urgent ? 'bg-rose-500/30 text-rose-200 animate-pulse' : 'bg-amber-500/25 text-amber-100'
    }`}>
      expira en {h > 0 ? `${h}h ` : ''}{m}m
    </span>
  );
}

function HeroStat({ icon: Icon, label, sub }) {
  return (
    <div className="rounded-xl bg-white/5 border border-white/10 p-3">
      <div className="flex items-center gap-2 text-sm text-white/80">
        <Icon size={14} className="text-elite-blue shrink-0" />
        <span className="font-bold capitalize truncate">{label}</span>
      </div>
      {sub && <div className="text-xs text-white/40 mt-1 ml-6">{sub}</div>}
    </div>
  );
}

function QuickLink({ to, icon: Icon, label, desc, color }) {
  return (
    <Link to={to}
      className={`rounded-xl glass p-3 border border-${color}-400/20 hover:border-${color}-400/50 card-lift block`}>
      <Icon size={16} className={`text-${color}-300 mb-1.5`} />
      <div className="text-sm font-bold">{label}</div>
      <div className="text-[10px] text-white/40 leading-tight">{desc}</div>
    </Link>
  );
}

function ContentSection({ icon: Icon, title, color, text, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}
      className="rounded-2xl glass p-6"
    >
      <h2 className="font-display text-base font-bold mb-3 flex items-center gap-2">
        <Icon size={15} className={color} /> {title}
      </h2>
      <p className="text-white/70 text-sm leading-relaxed whitespace-pre-wrap">{text}</p>
    </motion.div>
  );
}

function StatusPill({ status }) {
  const map = {
    DRAFT:     { cls: 'bg-white/5 text-white/60 border-white/10', label: 'Borrador' },
    OPEN:      { cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', label: 'Inscripciones abiertas' },
    CLOSED:    { cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40', label: 'En juego' },
    FINISHED:  { cls: 'bg-elite-gold/15 text-elite-gold border-elite-gold/40', label: 'Finalizado' },
    CANCELLED: { cls: 'bg-rose-500/15 text-rose-300 border-rose-500/40', label: 'Cancelado' },
  };
  const m = map[status] || map.DRAFT;
  return <span className={`text-[10px] px-2.5 py-1 rounded-full border font-bold ${m.cls}`}>{m.label}</span>;
}
