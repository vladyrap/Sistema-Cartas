import { useEffect, useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import {
  Gift, Sparkles, Trophy, Zap, Clock, RotateCw, LogIn, Star, X,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import EmptyState from '../components/EmptyState';
import { api } from '../lib/api';
import { auth } from '../lib/auth';

const RARITY = {
  common:    { ring: 'ring-slate-500/40',   bg: 'from-slate-700 to-slate-900',     text: 'text-slate-300',  glow: 'shadow-slate-500/30' },
  uncommon:  { ring: 'ring-emerald-500/50', bg: 'from-emerald-700 to-emerald-900', text: 'text-emerald-200', glow: 'shadow-emerald-500/40' },
  rare:      { ring: 'ring-cyan-500/50',    bg: 'from-cyan-700 to-blue-900',       text: 'text-cyan-200',   glow: 'shadow-cyan-500/50' },
  epic:      { ring: 'ring-violet-500/60',  bg: 'from-violet-700 to-fuchsia-900',  text: 'text-violet-100', glow: 'shadow-violet-500/60' },
  legendary: { ring: 'ring-amber-400/80',   bg: 'from-amber-500 to-orange-700',    text: 'text-amber-100',  glow: 'shadow-amber-500/70' },
};

// ──────── Audio + haptic helpers (sin assets externos) ────────

function playVictoryChime(rarity = 'common') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    const now = ctx.currentTime;
    // Notas según rarity (mayor rarity = arpegio más alto)
    const notes = rarity === 'legendary' ? [523.25, 659.25, 783.99, 1046.5]   // C5 E5 G5 C6
      : rarity === 'epic' ? [493.88, 622.25, 783.99]                          // B4 D#5 G5
      : rarity === 'rare' ? [440, 554.37, 659.25]                             // A4 C#5 E5
      : rarity === 'uncommon' ? [392, 493.88, 587.33]                         // G4 B4 D5
      : [349.23, 440, 523.25];                                                // F4 A4 C5
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;
      const start = now + i * 0.08;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.18, start + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 0.9);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(start);
      osc.stop(start + 1);
    });
    // Cerrar contexto después de que termine la última nota
    setTimeout(() => ctx.close().catch(() => {}), 1500);
  } catch {
    // Audio no disponible — silent fail
  }
}

function hapticVictory() {
  try {
    if (navigator.vibrate) navigator.vibrate([80, 40, 120, 40, 200]);
  } catch {
    // no haptic
  }
}

// ──────── Component ────────

export default function Spinner() {
  const [status, setStatus] = useState(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winning, setWinning] = useState(null);
  const [showVictory, setShowVictory] = useState(false);
  const isAuthed = auth.isAuthed();

  useEffect(() => {
    if (!isAuthed) {
      setNeedsAuth(true);
      return;
    }
    api.get('/spinner/status')
      .then((r) => setStatus(r.data))
      .catch((err) => {
        if (err?.response?.status === 401) setNeedsAuth(true);
        else toast.error('No pudimos cargar el spinner');
      });
  }, [isAuthed]);

  if (needsAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-amber-950/30 text-white">
        <Navbar />
        <EmptyState
          icon={LogIn}
          title="Iniciá sesión para girar"
          description="El Lucky Spinner requiere cuenta — el premio se acredita en tu temporada activa."
          action={{ label: 'Iniciar sesión', to: '/login?returnUrl=/spinner' }}
          accent="amber"
        />
      </div>
    );
  }

  const handleSpin = async () => {
    if (!status?.can_spin || spinning) return;
    setSpinning(true);
    setWinning(null);
    setShowVictory(false);
    try {
      const { data: prize } = await api.post('/spinner/spin');
      const slots = status.prizes.length;
      const slotDeg = 360 / slots;
      const target = 360 - (prize.index * slotDeg + slotDeg / 2);
      // Overshoot + rebote: pasa 6 vueltas + target + 8°, después vuelve a target
      const overshoot = 360 * 6 + target + 8;
      const finalRotation = 360 * 6 + target;

      setRotation(overshoot);

      // Tras la desaceleración + overshoot (~3.6s), aplicar rebote
      setTimeout(() => setRotation(finalRotation), 3600);

      // Llegada final (~4.0s): trigger victory experience
      setTimeout(() => {
        setWinning(prize);
        setStatus((s) => ({ ...s, can_spin: false, last_prize: prize }));
        setSpinning(false);
        setShowVictory(true);
        playVictoryChime(prize.rarity);
        hapticVictory();
      }, 4000);
    } catch (err) {
      setSpinning(false);
      const msg = err?.response?.data?.detail || 'Error al girar';
      toast.error(msg);
    }
  };

  if (!status) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="max-w-4xl mx-auto px-6 py-20 text-center text-slate-400">Cargando…</div>
      </div>
    );
  }

  const prizes = status.prizes;
  const slotDeg = 360 / prizes.length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-violet-950/40 text-white">
      <Navbar />

      <div className="max-w-4xl mx-auto px-6 py-10 sm:py-16">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-amber-400" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-amber-300 font-bold">
              Lucky Spinner · Daily
            </span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tighter bg-gradient-to-r from-white via-amber-100 to-amber-300 bg-clip-text text-transparent">
            Una vez al día.
          </h1>
          <p className="text-slate-400 mt-3 max-w-md mx-auto">
            Girá la ruleta y llevate EXP para escalar más rápido. Mínimo garantizado: 10 EXP.
          </p>
        </div>

        {/* WHEEL */}
        <div className="relative mx-auto" style={{ width: 'min(90vw, 480px)', aspectRatio: '1/1' }}>
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500/20 via-fuchsia-500/10 to-amber-500/20 blur-3xl pointer-events-none" />

          <div className="absolute left-1/2 -top-2 -translate-x-1/2 z-20 drop-shadow-[0_0_8px_rgba(245,193,108,0.7)]">
            <svg width="36" height="40" viewBox="0 0 36 40">
              <path d="M18 40 L0 0 L36 0 Z" fill="rgb(245,193,108)" />
            </svg>
          </div>

          <motion.div
            className="absolute inset-0 rounded-full"
            animate={{ rotate: rotation }}
            transition={{
              duration: 4,
              ease: spinning ? [0.17, 0.84, 0.31, 0.99] : 'easeOut',
            }}
            style={{ transformOrigin: '50% 50%' }}
          >
            <svg viewBox="0 0 100 100" className="w-full h-full drop-shadow-2xl">
              <defs>
                <radialGradient id="rim" cx="50%" cy="50%" r="50%">
                  <stop offset="92%" stopColor="rgba(245,193,108,0)" />
                  <stop offset="100%" stopColor="rgba(245,193,108,0.8)" />
                </radialGradient>
              </defs>
              {prizes.map((p, i) => {
                const a0 = (i * slotDeg - 90) * Math.PI / 180;
                const a1 = ((i + 1) * slotDeg - 90) * Math.PI / 180;
                const x0 = 50 + 50 * Math.cos(a0);
                const y0 = 50 + 50 * Math.sin(a0);
                const x1 = 50 + 50 * Math.cos(a1);
                const y1 = 50 + 50 * Math.sin(a1);
                const fillColor =
                  p.rarity === 'legendary' ? 'rgba(245,193,108,0.85)'
                  : p.rarity === 'epic' ? 'rgba(168,85,247,0.65)'
                  : p.rarity === 'rare' ? 'rgba(34,211,238,0.55)'
                  : p.rarity === 'uncommon' ? 'rgba(52,211,153,0.45)'
                  : (i % 2 ? 'rgba(124,58,237,0.55)' : 'rgba(232,81,154,0.45)');
                return (
                  <g key={i}>
                    <path
                      d={`M50 50 L${x0} ${y0} A50 50 0 0 1 ${x1} ${y1} Z`}
                      fill={fillColor}
                      stroke="rgba(255,255,255,0.15)"
                      strokeWidth="0.4"
                    />
                    <text
                      x="50"
                      y="50"
                      textAnchor="middle"
                      fontSize="3.8"
                      fontWeight="900"
                      fill="white"
                      transform={`rotate(${i * slotDeg + slotDeg / 2} 50 50) translate(0 -32)`}
                      style={{ paintOrder: 'stroke', stroke: 'rgba(0,0,0,0.4)', strokeWidth: 0.6 }}
                    >
                      {p.label}
                    </text>
                  </g>
                );
              })}
              <circle cx="50" cy="50" r="50" fill="url(#rim)" />
              <circle cx="50" cy="50" r="6" fill="rgba(0,0,0,0.6)" stroke="rgba(245,193,108,0.8)" strokeWidth="0.5" />
            </svg>
          </motion.div>
        </div>

        {/* Botón */}
        <div className="text-center mt-10">
          {status.can_spin ? (
            <button
              onClick={handleSpin}
              disabled={spinning}
              className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white text-lg font-black uppercase tracking-widest hover:shadow-2xl hover:shadow-amber-500/40 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {spinning ? <RotateCw className="animate-spin" size={20} /> : <Gift size={20} />}
              {spinning ? 'Girando…' : 'Girar ahora'}
            </button>
          ) : (
            <div className="inline-flex items-center gap-3 px-5 py-3 rounded-xl bg-white/[0.04] border border-white/10">
              <Clock size={16} className="text-slate-400" />
              <span className="text-sm text-slate-300">Ya giraste hoy. Volvé mañana.</span>
            </div>
          )}
        </div>

        {/* Mini card del último premio (sin overlay activo) */}
        {(status.last_prize && !showVictory) && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="mt-8 max-w-md mx-auto"
          >
            <PrizeCard prize={status.last_prize} fresh={false} />
          </motion.div>
        )}
      </div>

      <AnimatePresence>
        {showVictory && winning && (
          <VictoryOverlay prize={winning} onClose={() => setShowVictory(false)} />
        )}
      </AnimatePresence>
    </div>
  );
}

// ──────── Victory Overlay ────────

function VictoryOverlay({ prize, onClose }) {
  const r = RARITY[prize.rarity] || RARITY.common;
  const isHighTier = prize.rarity === 'epic' || prize.rarity === 'legendary';

  // Auto-close en 6s
  useEffect(() => {
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-hidden"
      onClick={onClose}
    >
      {/* Backdrop blur */}
      <div className="absolute inset-0 bg-black/85 backdrop-blur-md" />

      {/* Golden flash radial — pulsa al inicio */}
      <motion.div
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: [0, 1, 0.6, 0.8], scale: [0.2, 1.4, 1.0, 1.1] }}
        transition={{ duration: 1.2, times: [0, 0.3, 0.6, 1] }}
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'radial-gradient(circle at center, rgba(245,193,108,0.4) 0%, rgba(245,193,108,0.15) 25%, transparent 55%)',
        }}
      />

      <Confetti />
      <Serpentinas />
      <SparkleField />

      {/* Card central */}
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.5, opacity: 0, y: 30 }}
        animate={{
          scale: [0.5, 1.15, 0.97, 1.03, 1],
          opacity: 1,
          y: 0,
        }}
        transition={{
          duration: 0.9,
          times: [0, 0.4, 0.6, 0.8, 1],
          ease: 'easeOut',
        }}
        className="relative w-full max-w-md text-center"
      >
        {/* "¡Felicidades!" */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="mb-2"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/20 ring-1 ring-amber-400/40 mb-3">
            <Star size={11} className="text-amber-300" fill="currentColor" />
            <span className="text-[10px] uppercase tracking-[0.4em] text-amber-200 font-bold">
              {prize.rarity}
            </span>
          </div>
          <h2 className="text-5xl sm:text-7xl font-black tracking-tighter bg-gradient-to-r from-amber-200 via-yellow-100 to-amber-300 bg-clip-text text-transparent drop-shadow-[0_0_30px_rgba(245,193,108,0.6)]">
            ¡Felicidades!
          </h2>
        </motion.div>

        {/* Prize card central */}
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ delay: 0.5, type: 'spring', stiffness: 220, damping: 22 }}
          className={`relative mt-6 p-8 rounded-3xl bg-gradient-to-br ${r.bg} ring-4 ${r.ring} overflow-hidden shadow-2xl ${r.glow}`}
        >
          {/* Shimmer */}
          <motion.div
            animate={{ x: ['-100%', '200%'] }}
            transition={{ duration: 1.8, repeat: Infinity, ease: 'linear', delay: 0.7 }}
            className="absolute inset-y-0 w-1/3 bg-gradient-to-r from-transparent via-white/40 to-transparent pointer-events-none"
            style={{ filter: 'blur(8px)' }}
          />

          {/* Orbit de estrellas para epic/legendary */}
          {isHighTier && <OrbitStars />}

          <div className="relative">
            <div className="text-[10px] uppercase tracking-[0.5em] font-bold opacity-70 mb-2">
              Ganaste
            </div>
            <div className="text-6xl sm:text-7xl font-black tabular-nums drop-shadow-2xl">
              {prize.label}
            </div>
            {prize.amount > 0 && (
              <div className="mt-3 inline-flex items-center gap-1.5 text-sm opacity-80">
                <Zap size={14} /> Acreditado a tu temporada
              </div>
            )}
          </div>
        </motion.div>

        {/* Coins for legendary */}
        {prize.rarity === 'legendary' && <CoinRain />}

        <motion.button
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.6 }}
          className="mt-8 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.08] hover:bg-white/15 backdrop-blur ring-1 ring-white/20 text-white text-sm font-bold transition"
        >
          <X size={14} /> Cerrar
        </motion.button>
      </motion.div>
    </motion.div>
  );
}

// ──────── Confeti — 60 partículas que caen desde top ────────

function Confetti() {
  const colors = ['#f59e0b', '#fbbf24', '#fb7185', '#a78bfa', '#22d3ee', '#34d399', '#f0abfc', '#fff'];
  const pieces = Array.from({ length: 60 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: Math.random() * 0.8,
    duration: 2.5 + Math.random() * 2,
    rotate: Math.random() * 720 - 360,
    color: colors[Math.floor(Math.random() * colors.length)],
    size: 6 + Math.random() * 8,
    shape: Math.random() > 0.5 ? 'rect' : 'circle',
  }));

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          initial={{ y: -40, x: 0, opacity: 1, rotate: 0 }}
          animate={{ y: '110vh', x: (Math.random() - 0.5) * 80, opacity: [1, 1, 0], rotate: p.rotate }}
          transition={{ duration: p.duration, delay: p.delay, ease: 'linear' }}
          className="absolute"
          style={{
            left: `${p.left}%`,
            width: p.size,
            height: p.shape === 'rect' ? p.size * 0.4 : p.size,
            background: p.color,
            borderRadius: p.shape === 'circle' ? '50%' : '2px',
          }}
        />
      ))}
    </div>
  );
}

// ──────── Serpentinas — cintas desde costados ────────

function Serpentinas() {
  const pieces = Array.from({ length: 16 }, (_, i) => ({
    id: i,
    side: i % 2 === 0 ? 'left' : 'right',
    top: 15 + Math.random() * 50,
    delay: Math.random() * 0.5,
    color: ['#fbbf24', '#a78bfa', '#22d3ee', '#fb7185'][i % 4],
  }));

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      {pieces.map((p) => (
        <motion.div
          key={p.id}
          initial={{ x: p.side === 'left' ? -50 : '105vw', opacity: 1, rotate: 0 }}
          animate={{
            x: p.side === 'left' ? '105vw' : -50,
            opacity: [1, 1, 0],
            rotate: p.side === 'left' ? 720 : -720,
          }}
          transition={{ duration: 2 + Math.random(), delay: p.delay, ease: 'easeOut' }}
          className="absolute h-1 rounded-full"
          style={{
            top: `${p.top}%`,
            width: 60 + Math.random() * 80,
            background: `linear-gradient(90deg, transparent, ${p.color}, transparent)`,
          }}
        />
      ))}
    </div>
  );
}

// ──────── Sparkle field — destellos brillantes ────────

function SparkleField() {
  const stars = Array.from({ length: 25 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    top: Math.random() * 100,
    delay: Math.random() * 2,
    size: 4 + Math.random() * 10,
  }));
  return (
    <div className="absolute inset-0 pointer-events-none">
      {stars.map((s) => (
        <motion.svg
          key={s.id}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: [0, 1, 0], scale: [0, 1, 0] }}
          transition={{ duration: 1.4, delay: s.delay, repeat: 2, repeatDelay: 0.8 }}
          width={s.size}
          height={s.size}
          viewBox="0 0 24 24"
          className="absolute"
          style={{ left: `${s.left}%`, top: `${s.top}%` }}
        >
          <path
            d="M12 2 L13.5 10.5 L22 12 L13.5 13.5 L12 22 L10.5 13.5 L2 12 L10.5 10.5 Z"
            fill="#fcd34d"
            opacity="0.9"
          />
        </motion.svg>
      ))}
    </div>
  );
}

// ──────── Orbit stars — alrededor de la card ────────

function OrbitStars() {
  return (
    <div className="absolute inset-0 pointer-events-none">
      {[0, 60, 120, 180, 240, 300].map((deg, i) => (
        <motion.div
          key={deg}
          animate={{ rotate: [deg, deg + 360] }}
          transition={{ duration: 6 + i * 0.4, repeat: Infinity, ease: 'linear' }}
          className="absolute inset-0"
        >
          <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-3">
            <Star size={14} fill="#fcd34d" className="text-amber-300 drop-shadow-[0_0_4px_rgba(245,193,108,0.8)]" />
          </div>
        </motion.div>
      ))}
    </div>
  );
}

// ──────── Coin rain — solo para legendary ────────

function CoinRain() {
  const coins = Array.from({ length: 14 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    delay: 0.6 + Math.random() * 0.8,
    duration: 1.6 + Math.random(),
  }));
  return (
    <div className="absolute inset-x-0 -bottom-32 h-64 pointer-events-none overflow-visible">
      {coins.map((c) => (
        <motion.div
          key={c.id}
          initial={{ y: -200, opacity: 0, rotate: 0 }}
          animate={{ y: 200, opacity: [0, 1, 0], rotate: 720 }}
          transition={{ duration: c.duration, delay: c.delay, ease: 'easeIn' }}
          className="absolute w-8 h-8 rounded-full bg-gradient-to-br from-amber-200 via-yellow-400 to-amber-600 ring-2 ring-amber-300 shadow-lg shadow-amber-500/50 flex items-center justify-center text-amber-900 font-black text-sm"
          style={{ left: `${c.left}%` }}
        >
          $
        </motion.div>
      ))}
    </div>
  );
}

// ──────── Mini card del último spin (no overlay) ────────

function PrizeCard({ prize }) {
  const r = RARITY[prize.rarity] || RARITY.common;
  return (
    <div className={`relative p-6 rounded-2xl bg-gradient-to-br ${r.bg} ring-2 ${r.ring} overflow-hidden`}>
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-black/30 flex items-center justify-center">
          {prize.kind === 'exp' ? <Zap size={20} className={r.text} /> : <Trophy size={20} className={r.text} />}
        </div>
        <div className="text-xs uppercase tracking-widest font-bold opacity-70">
          {prize.rarity} · último giro
        </div>
      </div>
      <div className="text-4xl font-black tracking-tight">{prize.label}</div>
    </div>
  );
}
