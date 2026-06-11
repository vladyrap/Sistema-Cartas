import { useEffect, useState, useRef } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Gift, Sparkles, Trophy, Zap, Clock, RotateCw, LogIn } from 'lucide-react';
import Navbar from '../components/Navbar';
import EmptyState from '../components/EmptyState';
import { api } from '../lib/api';
import { auth } from '../lib/auth';

const RARITY = {
  common:    { ring: 'ring-slate-500/40',   bg: 'from-slate-700 to-slate-900',     text: 'text-slate-300' },
  uncommon:  { ring: 'ring-emerald-500/50', bg: 'from-emerald-700 to-emerald-900', text: 'text-emerald-200' },
  rare:      { ring: 'ring-cyan-500/50',    bg: 'from-cyan-700 to-blue-900',       text: 'text-cyan-200' },
  epic:      { ring: 'ring-violet-500/60',  bg: 'from-violet-700 to-fuchsia-900',  text: 'text-violet-100' },
  legendary: { ring: 'ring-amber-400/80',   bg: 'from-amber-500 to-orange-700',    text: 'text-amber-100' },
};

export default function Spinner() {
  const [status, setStatus] = useState(null);
  const [needsAuth, setNeedsAuth] = useState(false);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [winning, setWinning] = useState(null);
  const wheelRef = useRef(null);
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
    try {
      const { data: prize } = await api.post('/spinner/spin');
      const slots = status.prizes.length;
      const slotDeg = 360 / slots;
      // Queremos que la flecha (top) caiga en el centro del slot `prize.index`.
      const target = 360 - (prize.index * slotDeg + slotDeg / 2);
      // 6 vueltas extra para sensación de spin.
      const finalRotation = 360 * 6 + target;
      setRotation(finalRotation);

      // Esperar a que la animación termine antes de mostrar el premio
      setTimeout(() => {
        setWinning(prize);
        setStatus((s) => ({ ...s, can_spin: false, last_prize: prize }));
        setSpinning(false);
      }, 4200);
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
            Girá la ruleta y llevate EXP para escalar más rápido. Sin trampas: 1 spin / día.
          </p>
        </div>

        {/* WHEEL */}
        <div className="relative mx-auto" style={{ width: 'min(90vw, 480px)', aspectRatio: '1/1' }}>
          {/* Aurora glow detrás */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-violet-500/20 via-fuchsia-500/10 to-amber-500/20 blur-3xl pointer-events-none" />

          {/* Indicador (triángulo arriba) */}
          <div className="absolute left-1/2 -top-2 -translate-x-1/2 z-20 drop-shadow-[0_0_8px_rgba(245,193,108,0.7)]">
            <svg width="36" height="40" viewBox="0 0 36 40">
              <path d="M18 40 L0 0 L36 0 Z" fill="rgb(245,193,108)" />
            </svg>
          </div>

          {/* Ruleta SVG rotativa */}
          <motion.div
            ref={wheelRef}
            className="absolute inset-0 rounded-full"
            animate={{ rotate: rotation }}
            transition={{ duration: 4, ease: [0.17, 0.84, 0.31, 0.99] }}
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
                const r = RARITY[p.rarity] || RARITY.common;
                const baseColor = i % 2 ? 'rgba(124,58,237,0.55)' : 'rgba(232,81,154,0.45)';
                const fillColor =
                  p.rarity === 'legendary' ? 'rgba(245,193,108,0.85)' :
                  p.rarity === 'epic' ? 'rgba(168,85,247,0.65)' :
                  p.rarity === 'rare' ? 'rgba(34,211,238,0.55)' :
                  p.rarity === 'uncommon' ? 'rgba(52,211,153,0.45)' :
                  baseColor;
                return (
                  <g key={i}>
                    <path
                      d={`M50 50 L${x0} ${y0} A50 50 0 0 1 ${x1} ${y1} Z`}
                      fill={fillColor}
                      stroke="rgba(255,255,255,0.15)"
                      strokeWidth="0.4"
                    />
                    {/* Label */}
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
              {/* Centro */}
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
              <span className="text-sm text-slate-300">
                Ya giraste hoy. Volvé mañana.
              </span>
            </div>
          )}
        </div>

        {/* Resultado */}
        <AnimatePresence>
          {(winning || status.last_prize) && !spinning && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0 }}
              transition={{ delay: winning ? 0.2 : 0 }}
              className="mt-8 max-w-md mx-auto"
            >
              <PrizeCard prize={winning || status.last_prize} fresh={!!winning} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function PrizeCard({ prize, fresh }) {
  const r = RARITY[prize.rarity] || RARITY.common;
  return (
    <div className={`relative p-6 rounded-2xl bg-gradient-to-br ${r.bg} ring-2 ${r.ring} overflow-hidden`}>
      {fresh && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0] }}
          transition={{ duration: 1.5, repeat: 2 }}
          className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent pointer-events-none"
          style={{ backgroundSize: '200% 100%' }}
        />
      )}
      <div className="flex items-center gap-3 mb-2">
        <div className="w-10 h-10 rounded-xl bg-black/30 flex items-center justify-center">
          {prize.kind === 'exp' ? <Zap size={20} className={r.text} /> : <Trophy size={20} className={r.text} />}
        </div>
        <div className="text-xs uppercase tracking-widest font-bold opacity-70">
          {prize.rarity} · {prize.kind === 'nothing' ? 'sin premio' : 'premio'}
        </div>
      </div>
      <div className="text-4xl font-black tracking-tight">{prize.label}</div>
      {fresh && prize.amount > 0 && (
        <div className="text-sm mt-2 opacity-80">Acreditado a tu cuenta.</div>
      )}
    </div>
  );
}
