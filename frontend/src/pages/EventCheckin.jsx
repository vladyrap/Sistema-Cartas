import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { QrCode, CheckCircle2, Clock, AlertCircle, ArrowLeft, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import AuthGuard from '../components/AuthGuard';
import { api } from '../lib/api';

export default function EventCheckin() {
  return (
    <AuthGuard feature="el check-in del evento" returnUrl={window.location.pathname} accent="emerald">
      <CheckinContent />
    </AuthGuard>
  );
}

function CheckinContent() {
  const { id } = useParams();
  const nav = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const r = await api.get(`/api/tour-flow/events/${id}/checkin`);
      setData(r.data);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo cargar el check-in');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [id]);

  const selfCheckin = async () => {
    setBusy(true);
    try {
      await api.post(`/api/tour-flow/events/${id}/checkin/self`);
      toast.success('Check-in registrado 🎉');
      load();
    } catch (e) {
      if (e.response?.status === 402) {
        toast.error('Tu inscripción no está pagada — pagá online en el detalle del evento o en la mesa.', { duration: 6000 });
      } else {
        toast.error(e.response?.data?.detail || 'Error al hacer check-in');
      }
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="pt-24 grid place-items-center"><Loader2 className="animate-spin" /></div>
      </div>
    );
  }

  const now = new Date();
  const opens = new Date(data.checkin_opens_at);
  const closes = new Date(data.checkin_closes_at);
  const starts = new Date(data.starts_at);
  const minutesToOpen = Math.round((opens - now) / 60000);
  const minutesToClose = Math.round((closes - now) / 60000);

  let status = 'idle';
  if (data.is_checked_in) status = 'done';
  else if (data.is_open_now) status = 'open';
  else if (now < opens) status = 'waiting';
  else if (now > closes) status = 'closed';

  const qrUrl = data.my_token
    ? `https://api.qrserver.com/v1/create-qr-code/?size=300x300&margin=10&data=${encodeURIComponent(data.my_token)}`
    : null;

  const pctChecked = data.total_registered > 0
    ? Math.round((data.total_checked_in / data.total_registered) * 100)
    : 0;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-emerald-950/20 to-slate-950 text-white">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4 pt-24 pb-16 space-y-6">
        <button
          onClick={() => nav(`/events/${id}`)}
          className="flex items-center gap-2 text-white/60 hover:text-white text-sm"
        >
          <ArrowLeft size={16} /> Volver al evento
        </button>

        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl bg-gradient-to-br from-emerald-900/30 via-slate-900/60 to-slate-900/60 border border-emerald-500/30 p-6"
        >
          <div className="text-xs uppercase tracking-wider text-emerald-300 mb-1">Check-in</div>
          <h1 className="text-3xl font-black">{data.event_name}</h1>
          <p className="text-white/60 text-sm mt-1">
            Inicia {starts.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </motion.div>

        {status === 'done' && (
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
            className="rounded-3xl bg-gradient-to-br from-emerald-500/20 to-emerald-600/10 border border-emerald-400/40 p-8 text-center"
          >
            <CheckCircle2 className="mx-auto mb-3 text-emerald-400" size={64} />
            <div className="text-2xl font-black text-emerald-300">¡Check-in confirmado!</div>
            <p className="text-emerald-100/70 text-sm mt-2">
              Registrado {new Date(data.checked_in_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}
            </p>
            <p className="text-white/60 text-xs mt-4">
              Cuando empiece el evento, vas a aparecer en el primer pairing automáticamente.
            </p>
          </motion.div>
        )}

        {status === 'open' && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-3xl bg-gradient-to-br from-emerald-900/40 to-slate-900/60 border border-emerald-400/30 p-6 space-y-4"
          >
            <div className="flex items-center gap-2 text-emerald-300">
              <Clock size={20} />
              <span className="font-bold">Ventana abierta — cierra en {Math.max(0, minutesToClose)} min</span>
            </div>
            <button
              onClick={selfCheckin}
              disabled={busy}
              className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white font-black text-lg shadow-lg shadow-emerald-500/30 disabled:opacity-50 transition"
            >
              {busy ? 'Procesando…' : 'Hacer check-in ahora'}
            </button>

            {qrUrl && (
              <div className="border-t border-white/10 pt-4">
                <div className="flex items-center gap-2 mb-3 text-white/70 text-sm">
                  <QrCode size={16} /> O muéstrale este QR a un juez
                </div>
                <div className="bg-white rounded-2xl p-3 inline-block mx-auto block max-w-fit">
                  <img src={qrUrl} alt="Mi QR de check-in" className="w-48 h-48" />
                </div>
                <p className="text-center text-white/40 text-xs mt-2 font-mono">{data.my_token?.slice(0, 12)}…</p>
              </div>
            )}
          </motion.div>
        )}

        {status === 'waiting' && (
          <div className="rounded-3xl bg-slate-900/50 border border-white/10 p-6 text-center">
            <Clock className="mx-auto mb-3 text-cyan-400" size={48} />
            <div className="text-lg font-bold">Check-in abre en {minutesToOpen} min</div>
            <p className="text-white/50 text-sm mt-1">
              {opens.toLocaleString('es-CL', { timeStyle: 'short' })} hrs
            </p>
          </div>
        )}

        {status === 'closed' && (
          <div className="rounded-3xl bg-rose-500/10 border border-rose-400/30 p-6 text-center">
            <AlertCircle className="mx-auto mb-3 text-rose-400" size={48} />
            <div className="text-lg font-bold text-rose-200">Ventana de check-in cerrada</div>
            <p className="text-white/60 text-sm mt-1">
              Habla con un juez si llegaste tarde y querés que te marquen manualmente.
            </p>
          </div>
        )}

        <div className="rounded-2xl bg-slate-900/40 border border-white/10 p-4">
          <div className="flex items-center justify-between text-sm mb-2">
            <span className="text-white/60">Jugadores que ya hicieron check-in</span>
            <span className="font-mono font-bold text-emerald-300">{data.total_checked_in} / {data.total_registered}</span>
          </div>
          <div className="h-2 rounded-full bg-white/5 overflow-hidden">
            <motion.div
              initial={{ width: 0 }} animate={{ width: `${pctChecked}%` }}
              className="h-full bg-gradient-to-r from-emerald-500 to-teal-400"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
