import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { KeyRound, ArrowLeft, Check } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../lib/api';

export default function ResetPassword() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const token = params.get('token') || '';
  const [pwd, setPwd] = useState('');
  const [pwd2, setPwd2] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!token) {
      toast.error('Link inválido: falta el token');
    }
  }, [token]);

  async function submit(e) {
    e.preventDefault();
    if (pwd.length < 8) { toast.error('Mínimo 8 caracteres'); return; }
    if (pwd !== pwd2) { toast.error('Las contraseñas no coinciden'); return; }
    setSubmitting(true);
    try {
      await api.post('/auth/password/reset', { token, new_password: pwd });
      setDone(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      if (err.response?.status === 400) {
        toast.error('El link es inválido o ya venció. Pedí uno nuevo.');
      } else if (err.response?.status === 429) {
        toast.error('Demasiados intentos. Esperá un rato.');
      } else {
        toast.error('Error al restablecer la contraseña');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Layout>
      <div className="max-w-md mx-auto px-6 py-16">
        <button
          onClick={() => navigate('/login')}
          className="inline-flex items-center gap-1.5 text-sm text-white/50 hover:text-white mb-6"
        >
          <ArrowLeft size={14} /> Volver al login
        </button>

        <div className="p-6 sm:p-8 rounded-2xl bg-bg-surface border border-bg-border">
          <div className="w-12 h-12 rounded-xl bg-elite-violet/15 border border-elite-violet/30 flex items-center justify-center mb-4">
            <KeyRound size={20} className="text-elite-violet" />
          </div>
          <h1 className="font-display text-2xl font-bold">Crear nueva contraseña</h1>

          {!token ? (
            <p className="mt-4 text-sm text-rose-300 leading-relaxed">
              Link inválido. Si llegaste acá desde un email, asegurate de pegar el URL completo.{' '}
              <Link to="/forgot-password" className="underline">Pedir uno nuevo</Link>.
            </p>
          ) : done ? (
            <div className="mt-6 text-center">
              <div className="w-14 h-14 rounded-full bg-emerald-500/15 border border-emerald-500/40 flex items-center justify-center mx-auto mb-3">
                <Check size={24} className="text-emerald-300" />
              </div>
              <p className="text-sm text-white">Contraseña actualizada.</p>
              <p className="text-xs text-white/50 mt-1">Te llevamos al login…</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-white/60 mt-2 leading-relaxed">
                Crea una contraseña nueva. Mínimo 8 caracteres.
              </p>
              <form onSubmit={submit} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-widest text-white/40 mb-1.5">Nueva contraseña</label>
                  <input
                    type="password"
                    value={pwd}
                    onChange={(e) => setPwd(e.target.value)}
                    required minLength={8} maxLength={128}
                    autoFocus
                    placeholder="••••••••"
                    className="w-full px-3 py-2.5 rounded-lg bg-bg-elevated border border-bg-border text-sm focus:outline-none focus:border-elite-violet/60"
                  />
                </div>
                <div>
                  <label className="block text-xs uppercase tracking-widest text-white/40 mb-1.5">Confirmar</label>
                  <input
                    type="password"
                    value={pwd2}
                    onChange={(e) => setPwd2(e.target.value)}
                    required minLength={8} maxLength={128}
                    placeholder="••••••••"
                    className="w-full px-3 py-2.5 rounded-lg bg-bg-elevated border border-bg-border text-sm focus:outline-none focus:border-elite-violet/60"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full px-4 py-2.5 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white font-medium hover:shadow-glow-violet transition disabled:opacity-50"
                >
                  {submitting ? 'Guardando…' : 'Guardar contraseña'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
