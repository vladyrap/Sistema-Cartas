import { useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { Sparkles, UserPlus } from 'lucide-react';
import Layout from '../components/Layout';
import { auth } from '../lib/auth';
import { api } from '../lib/api';

const CLASSES = [
  { code: 'DUELISTA', label: 'Duelista', desc: 'Competitivo, vive de torneos.' },
  { code: 'COLECCIONISTA', label: 'Coleccionista', desc: 'Cartas, álbumes, sellados.' },
  { code: 'ESTRATEGA', label: 'Estratega', desc: 'Deckbuilding, análisis, contenido.' },
  { code: 'MENTOR', label: 'Mentor', desc: 'Enseña a nuevos jugadores.' },
  { code: 'TRADER', label: 'Trader', desc: 'Intercambio de cartas.' },
  { code: 'EXPLORADOR', label: 'Explorador', desc: 'Prueba todos los juegos nuevos.' },
];

export default function Register() {
  const [params] = useSearchParams();
  const initialRef = params.get('ref') || '';
  const [form, setForm] = useState({
    email: '', password: '', alias: '', full_name: '',
    player_class: 'DUELISTA', favorite_game_id: null,
    referral_code: initialRef,
  });
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    api.get('/games').then((r) => setGames(r.data)).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  async function onSubmit(e) {
    e.preventDefault();
    setLoading(true);
    try {
      await auth.register({
        ...form,
        favorite_game_id: form.favorite_game_id ? Number(form.favorite_game_id) : null,
        referral_code: form.referral_code?.trim() || null,
      });
      toast.success('¡Elite ID activada! Bienvenido.');
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo registrar');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Layout>
      <div className="min-h-[calc(100vh-3.5rem)] flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-2xl">
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/10 mb-4">
              <Sparkles size={12} className="text-elite-gold" />
              <span className="text-[10px] tracking-widest uppercase text-white/60">Crear Elite ID</span>
            </div>
            <h1 className="font-display text-3xl font-bold">Comienza tu Ruta del Campeón</h1>
            <p className="text-white/50 mt-2 text-sm">Empezarás en Iniciado N1. Lo que ganes de aquí en adelante es tuyo.</p>
          </div>

          <form onSubmit={onSubmit} className="p-6 rounded-2xl bg-bg-surface border border-bg-border space-y-5">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-white/60 mb-1.5">Email</label>
                <input type="email" required value={form.email} onChange={set('email')}
                  className="w-full px-3 py-2.5 rounded-lg bg-bg-elevated border border-bg-border focus:border-elite-violet/60 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1.5">Contraseña</label>
                <input type="password" required minLength={6} value={form.password} onChange={set('password')}
                  className="w-full px-3 py-2.5 rounded-lg bg-bg-elevated border border-bg-border focus:border-elite-violet/60 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1.5">Alias (visible públicamente)</label>
                <input type="text" required minLength={3} value={form.alias} onChange={set('alias')}
                  className="w-full px-3 py-2.5 rounded-lg bg-bg-elevated border border-bg-border focus:border-elite-violet/60 outline-none" />
              </div>
              <div>
                <label className="block text-xs text-white/60 mb-1.5">Nombre completo (opcional)</label>
                <input type="text" value={form.full_name} onChange={set('full_name')}
                  className="w-full px-3 py-2.5 rounded-lg bg-bg-elevated border border-bg-border focus:border-elite-violet/60 outline-none" />
              </div>
            </div>

            <div>
              <label className="block text-xs text-white/60 mb-2">Elige tu clase</label>
              <div className="grid sm:grid-cols-3 gap-2">
                {CLASSES.map((c) => (
                  <button type="button" key={c.code} onClick={() => setForm({ ...form, player_class: c.code })}
                    className={`text-left p-3 rounded-lg border transition ${
                      form.player_class === c.code
                        ? 'border-elite-violet bg-elite-violet/10'
                        : 'border-bg-border bg-bg-elevated/50 hover:border-white/20'
                    }`}>
                    <p className="font-semibold text-sm">{c.label}</p>
                    <p className="text-[11px] text-white/50 mt-0.5">{c.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {games.length > 0 && (
              <div>
                <label className="block text-xs text-white/60 mb-1.5">Juego favorito (opcional)</label>
                <select value={form.favorite_game_id || ''} onChange={set('favorite_game_id')}
                  className="w-full px-3 py-2.5 rounded-lg bg-bg-elevated border border-bg-border focus:border-elite-violet/60 outline-none">
                  <option value="">— Ninguno por ahora —</option>
                  {games.map((g) => (<option key={g.id} value={g.id}>{g.name}</option>))}
                </select>
              </div>
            )}

            <div>
              <label className="block text-xs text-white/60 mb-1.5 flex items-center gap-1">
                <UserPlus size={11} /> Código de invitación (opcional)
              </label>
              <input
                type="text" value={form.referral_code}
                onChange={(e) => setForm({ ...form, referral_code: e.target.value.toUpperCase() })}
                placeholder="EC-2026-000005"
                className="w-full px-3 py-2.5 rounded-lg bg-bg-elevated border border-bg-border font-mono text-sm placeholder:text-white/30 focus:outline-none focus:border-elite-violet/60"
              />
              <p className="text-[10px] text-white/40 mt-1">
                Si un amigo te invitó, pega su Elite ID acá. Ambos reciben EXP bonus al jugar tu primer evento.
              </p>
            </div>

            <button type="submit" disabled={loading}
              className="w-full py-3 rounded-lg bg-gradient-to-r from-elite-violet to-elite-blue text-white font-semibold hover:shadow-glow-violet transition disabled:opacity-50">
              {loading ? 'Creando Elite ID…' : 'Activar mi Elite ID'}
            </button>
            <p className="text-center text-xs text-white/40">
              ¿Ya tienes cuenta? <Link to="/login" className="text-elite-blue hover:underline">Inicia sesión</Link>
            </p>
          </form>
        </div>
      </div>
    </Layout>
  );
}
