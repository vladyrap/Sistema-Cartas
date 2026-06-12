/** Login — limpio y directo: card centrada, email/contraseña, listo. */
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Sparkles, Mail, Lock, Eye, EyeOff, ArrowRight, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';

import { auth } from '../lib/auth';

const DEMO_USERS = [
  { label: 'Admin',  email: 'admin@elitecards.cl',        pass: 'admin123' },
  { label: 'Player', email: 'shadowkaiser@elitecards.cl', pass: 'player123' },
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');

  async function onSubmit(e) {
    e.preventDefault();
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      await auth.login(email, password);
      navigate(returnUrl || '/dashboard');
    } catch (err) {
      let msg;
      if (!err.response) {
        // Sin respuesta = el backend no está corriendo o no es alcanzable.
        msg = 'No se pudo conectar con el servidor. ¿Está corriendo el backend?';
      } else if (err.response.status === 401 || err.response.status === 400) {
        msg = err.response.data?.detail || 'Credenciales inválidas';
      } else if (err.response.status === 429) {
        msg = 'Demasiados intentos. Esperá un momento e intentá de nuevo.';
      } else {
        msg = err.response.data?.detail || `Error del servidor (${err.response.status})`;
      }
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-white flex flex-col aurora-bg">
      {/* Header simple */}
      <header className="px-6 py-5">
        <Link to="/" className="inline-flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-elite-violet to-elite-blue flex items-center justify-center">
            <Sparkles size={15} className="text-white" />
          </div>
          <span className="font-display font-bold tracking-tight text-lg">
            Elite<span className="text-gradient">Cards</span>
          </span>
        </Link>
      </header>

      {/* Card centrada */}
      <div className="flex-1 flex items-center justify-center px-4 pb-16">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="w-full max-w-sm"
        >
          <div className="rounded-2xl glass-strong p-7">
            <h1 className="font-display text-2xl font-bold">Iniciar sesión</h1>
            <p className="text-sm text-white/50 mt-1 mb-6">
              ¿No tenés cuenta?{' '}
              <Link to="/register" className="text-elite-blue hover:text-white">Registrate</Link>
            </p>

            <form onSubmit={onSubmit} className="space-y-4">
              <div>
                <label className="block text-xs text-white/60 mb-1.5">Email</label>
                <div className="relative">
                  <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type="email" required autoComplete="email" autoFocus
                    value={email} onChange={(e) => setEmail(e.target.value)}
                    placeholder="tu@email.cl"
                    className="w-full pl-9 pr-3 py-2.5 rounded-lg bg-bg-surface border border-bg-border focus:border-elite-violet/60 outline-none text-sm transition"
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between items-center mb-1.5">
                  <label className="text-xs text-white/60">Contraseña</label>
                  <Link to="/forgot-password" className="text-xs text-white/40 hover:text-elite-blue">
                    ¿La olvidaste?
                  </Link>
                </div>
                <div className="relative">
                  <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type={showPwd ? 'text' : 'password'} required autoComplete="current-password"
                    value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-10 py-2.5 rounded-lg bg-bg-surface border border-bg-border focus:border-elite-violet/60 outline-none text-sm transition"
                  />
                  <button
                    type="button" onClick={() => setShowPwd(s => !s)} tabIndex={-1}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/30 hover:text-white/70"
                  >
                    {showPwd ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
              </div>

              {error && (
                <p className="text-sm text-rose-300 bg-rose-500/10 border border-rose-500/30 rounded-lg px-3 py-2">
                  {error}
                </p>
              )}

              <button
                type="submit" disabled={loading}
                className="w-full py-2.5 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white font-semibold text-sm flex items-center justify-center gap-2 hover:opacity-90 transition disabled:opacity-50"
              >
                {loading ? <Loader2 size={16} className="animate-spin" /> : (
                  <>Iniciar sesión <ArrowRight size={15} /></>
                )}
              </button>
            </form>
          </div>

          {/* Acceso rápido dev — discreto */}
          <div className="mt-4 flex items-center justify-center gap-2">
            <span className="text-[10px] text-white/25">acceso rápido:</span>
            {DEMO_USERS.map(d => (
              <button
                key={d.label}
                onClick={() => { setEmail(d.email); setPassword(d.pass); }}
                className="text-[10px] px-2 py-1 rounded-md bg-white/5 text-white/40 hover:text-white/70 hover:bg-white/10 transition"
              >
                {d.label}
              </button>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
