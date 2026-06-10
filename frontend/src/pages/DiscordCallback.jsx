import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Loader2, AlertCircle, Home } from 'lucide-react';
import { api } from '../lib/api';

export default function DiscordCallback() {
  const [params] = useSearchParams();
  const code = params.get('code');
  const error = params.get('error');
  const [status, setStatus] = useState('exchanging'); // 'exchanging' | 'ok' | 'error'
  const [msg, setMsg] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (error) {
      setStatus('error');
      setMsg(`Discord rechazó la autorización: ${error}`);
      return;
    }
    if (!code) {
      setStatus('error');
      setMsg('No vino el code de Discord');
      return;
    }
    api.post('/discord/callback', { code })
      .then((r) => {
        // Persistir tokens
        const { access_token, refresh_token } = r.data;
        if (access_token) localStorage.setItem('ec_access_token', access_token);
        if (refresh_token) localStorage.setItem('ec_refresh_token', refresh_token);
        setStatus('ok');
        setTimeout(() => navigate('/dashboard', { replace: true }), 600);
      })
      .catch((err) => {
        setStatus('error');
        setMsg(err?.response?.data?.detail || 'No se pudo completar el login');
      });
  }, [code, error, navigate]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-violet-950/30 text-white flex items-center justify-center px-6">
      <div className="max-w-md w-full text-center">
        {status === 'exchanging' && (
          <>
            <Loader2 size={48} className="mx-auto mb-4 text-violet-400 animate-spin" />
            <h1 className="text-2xl font-black mb-2">Conectando con Discord…</h1>
            <p className="text-slate-400">Un segundo.</p>
          </>
        )}
        {status === 'ok' && (
          <>
            <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/20 ring-1 ring-emerald-400/40 flex items-center justify-center text-emerald-300 mb-4 text-3xl">
              ✓
            </div>
            <h1 className="text-2xl font-black mb-2">Listo</h1>
            <p className="text-slate-400">Te llevamos al dashboard…</p>
          </>
        )}
        {status === 'error' && (
          <>
            <AlertCircle size={48} className="mx-auto mb-4 text-rose-400" />
            <h1 className="text-2xl font-black mb-2">No pudimos conectar Discord</h1>
            <p className="text-slate-400 mb-6">{msg}</p>
            <Link
              to="/login"
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.06] hover:bg-white/10 text-white font-bold text-sm transition"
            >
              <Home size={14} /> Volver al login
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
