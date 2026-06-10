import { useEffect, useState } from 'react';
import { Mail, X, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuth } from '../lib/useAuth';
import { api } from '../lib/api';

const DISMISS_KEY = 'ec-verify-email-dismissed';

export default function VerifyEmailBanner() {
  const { user, isAuthed } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    try {
      setDismissed(localStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      /* no-op */
    }
  }, []);

  if (!isAuthed) return null;
  if (user?.email_verified_at) return null;
  if (dismissed) return null;

  const handleResend = async () => {
    setSending(true);
    try {
      await api.post('/auth/email/verify-request');
      toast.success('Email de verificación enviado. Revisá tu casilla.');
    } catch (err) {
      const msg = err?.response?.data?.detail || 'No se pudo reenviar. Intentá más tarde.';
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* no-op */
    }
  };

  return (
    <div className="bg-gradient-to-r from-amber-500/15 via-amber-500/10 to-transparent border-b border-amber-500/30 backdrop-blur-sm">
      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-2.5 flex items-center gap-3 text-sm">
        <Mail size={14} className="text-amber-300 shrink-0" />
        <span className="text-amber-100 flex-1 min-w-0 truncate">
          Verificá tu email para desbloquear notificaciones y reservas.
        </span>
        <button
          onClick={handleResend}
          disabled={sending}
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md bg-amber-500/20 hover:bg-amber-500/30 text-amber-100 text-xs font-bold uppercase tracking-widest transition disabled:opacity-50 whitespace-nowrap"
        >
          {sending ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}
          {sending ? 'Enviando…' : 'Reenviar'}
        </button>
        <button
          onClick={handleDismiss}
          className="text-amber-300/60 hover:text-amber-100 transition shrink-0"
          aria-label="Cerrar"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
