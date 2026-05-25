import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Mail, ArrowLeft, Send } from 'lucide-react';
import Layout from '../components/Layout';
import { api } from '../lib/api';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!email) return;
    setSubmitting(true);
    try {
      // El backend responde 204 SIEMPRE (no filtra si el email existe).
      await api.post('/auth/password/forgot', { email: email.trim().toLowerCase() });
      setSent(true);
    } catch (err) {
      // 429 = rate limit. El resto es genérico.
      if (err.response?.status === 429) {
        toast.error('Demasiados intentos. Esperá un rato.');
      } else {
        toast.error('Error al procesar la solicitud');
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
            <Mail size={20} className="text-elite-violet" />
          </div>
          <h1 className="font-display text-2xl font-bold">¿Olvidaste tu contraseña?</h1>

          {sent ? (
            <div className="mt-6">
              <p className="text-sm text-white/70 leading-relaxed">
                Si <span className="text-white">{email}</span> tiene una cuenta, te llegó un email con
                un link para crear una nueva contraseña.
              </p>
              <p className="text-xs text-white/40 mt-3 leading-relaxed">
                Revisá tu inbox y carpeta de spam. El link vence en 1 hora. Si no llega en unos minutos,
                podés intentarlo de nuevo.
              </p>
              <div className="mt-6 flex gap-2">
                <Link
                  to="/login"
                  className="flex-grow text-center px-4 py-2.5 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white text-sm font-medium"
                >
                  Volver al login
                </Link>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm text-white/60 mt-2 leading-relaxed">
                Pon tu email registrado. Te mandamos un link para que crees una contraseña nueva.
              </p>
              <form onSubmit={submit} className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs uppercase tracking-widest text-white/40 mb-1.5">Email</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    placeholder="tu@email.cl"
                    className="w-full px-3 py-2.5 rounded-lg bg-bg-elevated border border-bg-border text-sm focus:outline-none focus:border-elite-violet/60"
                  />
                </div>
                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white font-medium hover:shadow-glow-violet transition disabled:opacity-50"
                >
                  <Send size={14} /> {submitting ? 'Enviando…' : 'Enviar link'}
                </button>
              </form>
            </>
          )}
        </div>
      </div>
    </Layout>
  );
}
