import { useState } from 'react';
import toast from 'react-hot-toast';
import { Mail, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuth } from '../lib/useAuth';

const DISMISS_KEY = 'elitecards.verify_banner_dismissed_at';
const DISMISS_HOURS = 12;

export default function VerifyEmailBanner() {
  const { user, isAuthed } = useAuth();
  const [sending, setSending] = useState(false);
  const [dismissed, setDismissed] = useState(() => {
    const ts = Number(localStorage.getItem(DISMISS_KEY) || 0);
    return ts > 0 && (Date.now() - ts) < DISMISS_HOURS * 3600 * 1000;
  });

  // Solo se muestra al usuario autenticado que NO ha verificado.
  if (!isAuthed || !user || user.email_verified_at) return null;
  if (dismissed) return null;

  async function resend() {
    setSending(true);
    try {
      await api.post('/auth/email/verify-request');
      toast.success('Te reenviamos el email de verificación');
    } catch (e) {
      if (e.response?.status === 429) {
        toast.error('Demasiados intentos. Esperá una hora.');
      } else {
        toast.error('No se pudo reenviar');
      }
    } finally { setSending(false); }
  }

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  }

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-2 flex items-center gap-3 text-xs">
        <Mail size={14} className="text-amber-300 flex-shrink-0" />
        <p className="text-amber-100/90 flex-grow leading-snug">
          Verifica tu email <span className="font-mono text-amber-200">{user.email}</span> para
          desbloquear todas las funciones.
        </p>
        <button
          onClick={resend}
          disabled={sending}
          className="text-amber-200 hover:text-white underline disabled:opacity-50 flex-shrink-0"
        >
          {sending ? 'Enviando…' : 'Reenviar'}
        </button>
        <button onClick={dismiss} className="text-amber-200/60 hover:text-amber-200 flex-shrink-0" title="Cerrar por 12h">
          <X size={12} />
        </button>
      </div>
    </div>
  );
}
