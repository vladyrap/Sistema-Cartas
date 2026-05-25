import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Sparkles } from 'lucide-react';
import Layout from '../components/Layout';
import { auth } from '../lib/auth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await auth.login(email, password);
      toast.success('¡Bienvenido!');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Credenciales inválidas');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 mb-4">
              <Sparkles size={12} className="text-elite-gold" />
              <span className="text-[10px] tracking-widest uppercase text-white/60">Entrar a EliteCards</span>
            </div>
            <h1 className="font-display text-3xl font-bold">Continúa tu Ruta del Campeón</h1>
          </div>

          <form onSubmit={onSubmit} className="p-6 rounded-2xl bg-bg-surface border border-bg-border space-y-4">
            <div>
              <label className="block text-xs text-white/60 mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="admin@elitecards.cl"
                className="w-full px-3 py-2.5 rounded-lg bg-bg-elevated border border-bg-border text-white placeholder:text-white/30 focus:outline-none focus:border-elite-violet/60"
              />
            </div>
            <div>
              <div className="flex items-baseline justify-between mb-1.5">
                <label className="block text-xs text-white/60">Contraseña</label>
                <Link to="/forgot-password" className="text-[11px] text-elite-blue hover:text-white">
                  ¿La olvidaste?
                </Link>
              </div>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full px-3 py-2.5 rounded-lg bg-bg-elevated border border-bg-border text-white placeholder:text-white/30 focus:outline-none focus:border-elite-violet/60"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white font-semibold hover:shadow-glow-violet transition disabled:opacity-50"
            >
              {loading ? 'Entrando…' : 'Iniciar sesión'}
            </button>
            <p className="text-center text-xs text-white/40 pt-2">
              ¿Aún no tienes Elite ID? <Link to="/register" className="text-elite-blue hover:underline">Créala aquí</Link>
            </p>
            <p className="text-center text-[10px] font-mono text-white/30 pt-2 border-t border-white/5">
              Demo seed: admin@elitecards.cl / admin123 — shadowkaiser@elitecards.cl / player123
            </p>
          </form>
        </div>
      </div>
    </Layout>
  );
}
