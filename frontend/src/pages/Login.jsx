/** Login fullscreen "best ever" — aurora shader BG + glassmorphism + parallax
 * mouse-tracked + Elite ID card 3D + magnetic button + glitch on error +
 * portal transition on success + rotating tagline + quick-fill demo creds.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Mail, Lock, Eye, EyeOff, ArrowRight, AlertCircle,
  Loader2, Zap, Star, Compass,
} from 'lucide-react';
import toast from 'react-hot-toast';

import { auth } from '../lib/auth';
import AuroraShader from '../components/AuroraShader';
import EliteIdCard3D from '../components/EliteIdCard3D';

const TAGLINES = [
  "Cada partida cuenta.",
  "Tu rating te define.",
  "El meta evoluciona — vos también.",
  "30 niveles separan al Iniciado del Campeón.",
  "El bracket no perdona.",
  "Forja tu leyenda en el Cosmos.",
];

const DEMO_USERS = [
  { label: "Admin",  email: "admin@elitecards.cl",        pass: "admin123",  hue: 280 },
  { label: "Player", email: "shadowkaiser@elitecards.cl", pass: "player123", hue: 0   },
];

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [focused, setFocused] = useState(null);
  const [taglineIdx, setTaglineIdx] = useState(0);
  const [mouse, setMouse] = useState({ x: 0, y: 0 });
  const containerRef = useRef(null);
  const btnRef = useRef(null);
  const navigate = useNavigate();

  // Tagline rotativa
  useEffect(() => {
    const id = setInterval(() => setTaglineIdx(i => (i + 1) % TAGLINES.length), 4200);
    return () => clearInterval(id);
  }, []);

  // Mouse parallax
  useEffect(() => {
    function onMove(e) {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
      const y = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
      setMouse({ x: Math.max(-1, Math.min(1, x)), y: Math.max(-1, Math.min(1, y)) });
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Magnetic button (sigue el cursor cerca)
  useEffect(() => {
    function onMove(e) {
      const btn = btnRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = e.clientX - cx, dy = e.clientY - cy;
      const dist = Math.hypot(dx, dy);
      const radius = 140;
      if (dist < radius) {
        const f = (1 - dist / radius) * 0.35;
        btn.style.transform = `translate(${dx * f}px, ${dy * f}px)`;
      } else {
        btn.style.transform = 'translate(0,0)';
      }
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  async function onSubmit(e) {
    e.preventDefault();
    if (loading || success) return;
    setLoading(true);
    setError(null);
    try {
      await auth.login(email, password);
      setSuccess(true);
      // Pequeño delay para que el botón muestre el estado "✓ Listo"
      setTimeout(() => navigate('/dashboard'), 350);
    } catch (err) {
      const msg = err.response?.data?.detail || 'Credenciales inválidas';
      setError(msg);
      // shake + glitch flash
      setTimeout(() => setError(null), 3500);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }

  function quickFill(d) {
    setEmail(d.email);
    setPassword(d.pass);
    setTimeout(() => document.querySelector('button[type="submit"]')?.focus(), 50);
  }

  // Derivar grado de "fuerza" simple (visual)
  const pwdStrength = useMemo(() => {
    let s = 0;
    if (password.length >= 6) s++;
    if (password.length >= 10) s++;
    if (/[A-Z]/.test(password)) s++;
    if (/\d/.test(password)) s++;
    if (/[^A-Za-z0-9]/.test(password)) s++;
    return Math.min(s, 4);
  }, [password]);

  return (
    <div ref={containerRef} className="fixed inset-0 bg-black text-white overflow-hidden font-sans">
      {/* BG: Aurora shader */}
      <div className="absolute inset-0" style={{ opacity: 0.65 }}>
        <AuroraShader seed={42} colorA="#7c3aed" colorB="#06061a" colorC="#22d3ee" />
      </div>
      {/* Vignette + grain */}
      <div className="absolute inset-0 bg-gradient-to-br from-black/40 via-transparent to-black/60 pointer-events-none" />
      <div
        className="absolute inset-0 opacity-[0.04] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='4' height='4'><rect width='4' height='4' fill='white'/></svg>\")",
        }}
      />
      {/* Parallax stars */}
      <div className="absolute inset-0 pointer-events-none">
        {Array.from({ length: 50 }).map((_, i) => (
          <div
            key={i}
            className="absolute w-0.5 h-0.5 bg-white rounded-full"
            style={{
              left: `${(i * 173) % 100}%`,
              top: `${(i * 211) % 100}%`,
              opacity: Math.random() * 0.7 + 0.2,
              boxShadow: '0 0 4px rgba(255,255,255,0.7)',
              transform: `translate(${mouse.x * (i % 5) * 4}px, ${mouse.y * (i % 5) * 4}px)`,
              transition: 'transform 0.25s ease-out',
            }}
          />
        ))}
      </div>

      {/* SPLIT: 60/40 — desktop */}
      <div className="relative h-full grid lg:grid-cols-[1.2fr_1fr] gap-0">
        {/* LEFT PANEL */}
        <div className="relative hidden lg:flex flex-col justify-between p-12 xl:p-16">
          {/* Top */}
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="flex items-center gap-3"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center shadow-2xl shadow-violet-500/40">
              <Sparkles size={18} className="text-white" />
            </div>
            <span className="text-lg font-black tracking-tight">EliteCards</span>
            <span className="text-[10px] text-violet-300/60 font-mono uppercase tracking-widest mt-1">
              v0.2 · DUEL_LOG.SYS
            </span>
          </motion.div>

          {/* Mid */}
          <div className="space-y-8">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4, duration: 0.8 }}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/10 border border-violet-400/30 mb-5">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] tracking-[0.3em] uppercase text-violet-200 font-bold">
                  Servidores ONLINE · Temporada III
                </span>
              </div>
              <h1 className="font-black tracking-tighter leading-[0.95] text-5xl xl:text-7xl bg-gradient-to-br from-white via-violet-100 to-violet-300 bg-clip-text text-transparent drop-shadow-2xl">
                Continúa tu<br/>
                <span className="bg-gradient-to-r from-amber-300 via-fuchsia-400 to-violet-400 bg-clip-text text-transparent">
                  Ruta del Campeón
                </span>
              </h1>
            </motion.div>

            {/* Tagline rotativa */}
            <div className="h-14 flex items-center">
              <AnimatePresence mode="wait">
                <motion.p
                  key={taglineIdx}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  transition={{ duration: 0.5 }}
                  className="text-2xl font-medium text-slate-300 italic"
                >
                  <span className="text-violet-400">›</span> {TAGLINES[taglineIdx]}
                </motion.p>
              </AnimatePresence>
            </div>

            {/* Mini stats live */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
              className="grid grid-cols-3 gap-4 max-w-md"
            >
              <MiniStat icon={Zap} label="Activos" value="1.2k" hue={45} />
              <MiniStat icon={Star} label="Torneos" value="84" hue={280} />
              <MiniStat icon={Compass} label="Decks" value="3.5k" hue={180} />
            </motion.div>
          </div>

          {/* Bottom: floating Elite ID card 3D */}
          <motion.div
            initial={{ opacity: 0, scale: 0.85 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.8, duration: 1 }}
            className="absolute right-0 top-1/2 -translate-y-1/2 w-[480px] h-[340px] pointer-events-none"
            style={{
              transform: `translateY(-50%) translate(${mouse.x * 12}px, ${mouse.y * 8}px)`,
              transition: 'transform 0.18s ease-out',
            }}
          >
            <EliteIdCard3D email={email} mousePos={mouse} />
          </motion.div>
        </div>

        {/* RIGHT PANEL: form */}
        <div className="relative flex flex-col justify-center items-center px-6 py-12">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 text-center">
            <div className="inline-flex items-center gap-2">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-fuchsia-500 flex items-center justify-center">
                <Sparkles size={18} className="text-white" />
              </div>
              <span className="text-xl font-black">EliteCards</span>
            </div>
          </div>

          {/* Form card */}
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={{ delay: 0.2, type: 'spring', damping: 18, stiffness: 110 }}
            className="w-full max-w-md"
          >
            <motion.div
              animate={error ? {
                x: [0, -10, 10, -8, 8, -5, 5, 0],
              } : {}}
              transition={error ? { duration: 0.5 } : {}}
              className={`relative rounded-3xl overflow-hidden ${
                success ? 'ring-2 ring-emerald-400/50' : ''
              }`}
            >
              {/* Glass body */}
              <div className="relative backdrop-blur-2xl bg-white/[0.04] border border-white/10 p-7 sm:p-9">
                {/* Top neon line */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-px bg-gradient-to-r from-transparent via-violet-400 to-transparent" />

                <div className="mb-6">
                  <p className="text-[10px] tracking-[0.4em] uppercase text-violet-300/80 font-bold mb-1">
                    INVOCAR_SESIÓN
                  </p>
                  <h2 className="text-3xl font-black bg-gradient-to-r from-white to-violet-200 bg-clip-text text-transparent">
                    Bienvenido de vuelta
                  </h2>
                  <p className="text-xs text-slate-400 mt-1.5">
                    Identificate para entrar al gremio.
                  </p>
                </div>

                <form onSubmit={onSubmit} className="space-y-5">
                  {/* Email */}
                  <FloatingField
                    label="Email"
                    icon={Mail}
                    type="email"
                    value={email}
                    onChange={setEmail}
                    placeholder="tu@elitecards.cl"
                    focused={focused === 'email'}
                    onFocus={() => setFocused('email')}
                    onBlur={() => setFocused(null)}
                    autoFocus
                  />

                  {/* Password */}
                  <div>
                    <FloatingField
                      label="Contraseña"
                      icon={Lock}
                      type={showPwd ? 'text' : 'password'}
                      value={password}
                      onChange={setPassword}
                      placeholder="••••••••"
                      focused={focused === 'pwd'}
                      onFocus={() => setFocused('pwd')}
                      onBlur={() => setFocused(null)}
                      suffix={
                        <button
                          type="button"
                          onClick={() => setShowPwd(s => !s)}
                          className="p-1 text-slate-500 hover:text-white transition"
                          tabIndex={-1}
                        >
                          {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                      }
                    />
                    {/* Pwd strength */}
                    {password.length > 0 && (
                      <div className="flex gap-1 mt-2">
                        {[0, 1, 2, 3].map(i => (
                          <motion.div
                            key={i}
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: pwdStrength > i ? 1 : 0.15 }}
                            className={`h-0.5 flex-1 origin-left rounded-full ${
                              pwdStrength === 1 ? 'bg-rose-500' :
                              pwdStrength === 2 ? 'bg-amber-500' :
                              pwdStrength === 3 ? 'bg-emerald-500' :
                              pwdStrength === 4 ? 'bg-violet-400' : 'bg-white/10'
                            }`}
                          />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Forgot */}
                  <div className="flex items-center justify-between">
                    <label className="flex items-center gap-2 text-xs text-slate-400 cursor-pointer select-none">
                      <input type="checkbox" className="accent-violet-500" defaultChecked />
                      Mantener sesión
                    </label>
                    <Link to="/forgot-password" className="text-xs text-violet-300 hover:text-white transition">
                      ¿Olvidaste tu contraseña?
                    </Link>
                  </div>

                  {/* Error message */}
                  <AnimatePresence>
                    {error && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
                          <AlertCircle size={13} className="shrink-0" />
                          <span>{error}</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  {/* Submit button — magnetic */}
                  <button
                    ref={btnRef}
                    type="submit"
                    disabled={loading || success}
                    style={{ transition: 'transform 0.15s ease-out' }}
                    className="group relative w-full py-3.5 rounded-xl overflow-hidden font-bold uppercase tracking-widest text-sm disabled:opacity-100"
                  >
                    {/* Bg gradient */}
                    <div className="absolute inset-0 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-500 transition-all group-hover:from-violet-400 group-hover:via-fuchsia-400 group-hover:to-amber-400" />
                    {/* Shimmer */}
                    <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-1000 bg-gradient-to-r from-transparent via-white/30 to-transparent" />
                    {/* Loading bar overlay */}
                    {loading && (
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: '100%' }}
                        transition={{ duration: 1.2 }}
                        className="absolute inset-y-0 left-0 bg-white/40"
                      />
                    )}
                    {/* Glow */}
                    <div className="absolute -inset-1 -z-10 rounded-xl bg-gradient-to-r from-violet-600 via-fuchsia-600 to-amber-600 blur-lg opacity-50 group-hover:opacity-80 transition" />
                    {/* Content */}
                    <span className="relative flex items-center justify-center gap-2 text-white drop-shadow">
                      {success ? (
                        <>
                          <Sparkles size={16} className="animate-spin" />
                          ENLACE ESTABLECIDO
                        </>
                      ) : loading ? (
                        <>
                          <Loader2 size={16} className="animate-spin" />
                          CONECTANDO…
                        </>
                      ) : (
                        <>
                          INICIAR SESIÓN
                          <ArrowRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                        </>
                      )}
                    </span>
                  </button>

                  {/* Divider */}
                  <div className="flex items-center gap-3 py-2">
                    <div className="flex-1 h-px bg-white/5" />
                    <span className="text-[10px] uppercase tracking-widest text-slate-600 font-bold">
                      Demo Seed
                    </span>
                    <div className="flex-1 h-px bg-white/5" />
                  </div>

                  {/* Quick-fill demo */}
                  <div className="grid grid-cols-2 gap-2">
                    {DEMO_USERS.map(d => (
                      <button
                        key={d.email}
                        type="button"
                        onClick={() => quickFill(d)}
                        className="group relative px-3 py-2 rounded-lg bg-white/[0.03] border border-white/10 hover:bg-white/[0.06] hover:border-white/20 transition text-left overflow-hidden"
                      >
                        <div
                          className="absolute -left-2 top-1/2 -translate-y-1/2 w-1 h-8 rounded-full"
                          style={{ background: `hsl(${d.hue}, 80%, 60%)`, boxShadow: `0 0 10px hsl(${d.hue}, 80%, 60%)` }}
                        />
                        <div className="text-[10px] uppercase tracking-widest font-bold pl-2"
                             style={{ color: `hsl(${d.hue}, 80%, 75%)` }}>
                          {d.label}
                        </div>
                        <div className="text-[10px] text-slate-500 font-mono pl-2 truncate">
                          {d.email.split('@')[0]}
                        </div>
                      </button>
                    ))}
                  </div>
                </form>

                <div className="mt-6 pt-5 border-t border-white/5 text-center">
                  <span className="text-xs text-slate-400">¿Aún no tienes Elite ID? </span>
                  <Link to="/register" className="text-xs font-bold text-violet-300 hover:text-white transition">
                    Créala aquí →
                  </Link>
                </div>
              </div>

              {/* Bottom neon line */}
              <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1/2 h-px bg-gradient-to-r from-transparent via-fuchsia-400 to-transparent" />
            </motion.div>

            {/* Bottom links */}
            <div className="mt-6 flex items-center justify-center gap-3 text-[10px] text-slate-600 uppercase tracking-widest font-bold">
              <Link to="/cosmos" className="hover:text-violet-300 transition">Cosmos</Link>
              <span>·</span>
              <Link to="/events" className="hover:text-violet-300 transition">Eventos públicos</Link>
              <span>·</span>
              <Link to="/" className="hover:text-violet-300 transition">Home</Link>
            </div>
          </motion.div>
        </div>
      </div>

      {/* Glitch on error */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 0.7, 0, 0.5, 0] }}
            transition={{ duration: 0.45 }}
            className="fixed inset-0 z-40 pointer-events-none mix-blend-screen"
            style={{
              backgroundImage:
                'repeating-linear-gradient(0deg, rgba(255,0,80,0.04) 0px, rgba(255,0,80,0.04) 2px, transparent 2px, transparent 4px)',
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ============================== Subcomponents ============================== */

function MiniStat({ icon: Icon, label, value, hue }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 backdrop-blur">
      <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-widest font-bold mb-1"
           style={{ color: `hsl(${hue}, 80%, 70%)` }}>
        <Icon size={10} /> {label}
      </div>
      <div className="text-xl font-black tabular-nums">{value}</div>
    </div>
  );
}

function FloatingField({
  label, icon: Icon, type, value, onChange, placeholder, focused, onFocus, onBlur, suffix, autoFocus,
}) {
  const filled = value && value.length > 0;
  const active = focused || filled;
  return (
    <div className="relative">
      <div
        className={`relative flex items-center gap-2 rounded-xl border bg-white/[0.02] transition-all ${
          focused ? 'border-violet-400/60 bg-white/[0.04] shadow-[0_0_30px_-12px_rgba(139,92,246,0.5)]'
                  : 'border-white/10'
        }`}
      >
        <Icon size={14} className={`ml-3.5 transition-colors ${focused ? 'text-violet-300' : 'text-slate-500'}`} />
        <div className="flex-1 relative">
          <motion.label
            initial={false}
            animate={{
              y: active ? -7 : 9,
              fontSize: active ? '10px' : '13px',
              color: focused ? '#c4b5fd' : active ? '#94a3b8' : '#64748b',
            }}
            transition={{ duration: 0.18 }}
            className="absolute left-0 pointer-events-none uppercase tracking-widest font-bold origin-left"
          >
            {label}
          </motion.label>
          <input
            type={type}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onFocus={onFocus}
            onBlur={onBlur}
            placeholder={focused ? placeholder : ''}
            autoFocus={autoFocus}
            required
            className="w-full bg-transparent text-sm py-3.5 pt-5 pr-3 outline-none text-white placeholder:text-slate-600"
          />
        </div>
        {suffix && <div className="mr-3">{suffix}</div>}
      </div>
      {/* Bottom neon underline animation */}
      <motion.div
        className="absolute bottom-0 left-3 right-3 h-px bg-gradient-to-r from-violet-400 via-fuchsia-400 to-amber-400 origin-left"
        initial={false}
        animate={{ scaleX: focused ? 1 : 0 }}
        transition={{ duration: 0.3 }}
      />
    </div>
  );
}
