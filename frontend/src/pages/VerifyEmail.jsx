import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { MailCheck, MailX, Loader2 } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../lib/api';

export default function VerifyEmail() {
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [status, setStatus] = useState('loading'); // 'loading' | 'ok' | 'fail'

  useEffect(() => {
    if (!token) { setStatus('fail'); return; }
    api.post('/auth/email/verify', { token })
      .then(() => setStatus('ok'))
      .catch(() => setStatus('fail'));
  }, [token]);

  return (
    <Layout>
      <div className="max-w-md mx-auto px-6 py-16 text-center">
        {status === 'loading' && (
          <>
            <Loader2 size={36} className="mx-auto text-elite-violet animate-spin mb-4" />
            <h1 className="font-display text-xl font-bold">Verificando…</h1>
            <p className="text-sm text-white/50 mt-2">Estamos validando tu link.</p>
          </>
        )}

        {status === 'ok' && (
          <>
            <div className="w-16 h-16 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center mx-auto mb-4">
              <MailCheck size={28} className="text-emerald-300" />
            </div>
            <h1 className="font-display text-2xl font-bold">¡Email confirmado!</h1>
            <p className="text-sm text-white/60 mt-3 leading-relaxed">
              Tu cuenta queda verificada. Ya podés usar todas las funciones de EliteCards.
            </p>
            <div className="mt-6 flex gap-2 justify-center">
              <Link to="/dashboard" className="px-5 py-2.5 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white text-sm font-medium hover:shadow-glow-violet transition">
                Ir al dashboard
              </Link>
            </div>
          </>
        )}

        {status === 'fail' && (
          <>
            <div className="w-16 h-16 rounded-full bg-rose-500/15 border border-rose-500/40 flex items-center justify-center mx-auto mb-4">
              <MailX size={28} className="text-rose-300" />
            </div>
            <h1 className="font-display text-2xl font-bold">Link inválido o vencido</h1>
            <p className="text-sm text-white/60 mt-3 leading-relaxed">
              El link puede haber expirado (los de verificación duran 24h) o ya fue usado. Pide
              uno nuevo desde tu perfil.
            </p>
            <div className="mt-6 flex gap-2 justify-center">
              <Link to="/profile" className="px-5 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm">
                Ir a mi perfil
              </Link>
              <Link to="/dashboard" className="px-5 py-2.5 rounded-lg bg-elite-violet/15 border border-elite-violet/40 text-elite-violet text-sm hover:bg-elite-violet/20">
                Dashboard
              </Link>
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
