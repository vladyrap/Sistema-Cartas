import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Sparkles, Star, Gem, Clock } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import { api } from '../lib/api';

const RARITY = {
  common:   { ring: 'ring-slate-400/30', text: 'text-slate-300', bg: 'from-slate-700 to-slate-900',     label: 'Común' },
  uncommon: { ring: 'ring-emerald-400/40', text: 'text-emerald-300', bg: 'from-emerald-700 to-emerald-900', label: 'No común' },
  rare:     { ring: 'ring-amber-400/60', text: 'text-amber-300', bg: 'from-amber-600 to-orange-800', label: 'Rara' },
  mythic:   { ring: 'ring-rose-400/80', text: 'text-rose-200', bg: 'from-rose-600 to-fuchsia-800', label: 'Mythic' },
};

export default function PackOpening() {
  const [status, setStatus] = useState(null);
  const [opening, setOpening] = useState(false);
  const [phase, setPhase] = useState('intro'); // 'intro' | 'pack' | 'reveal' | 'done'
  const [revealed, setRevealed] = useState(0);

  useEffect(() => {
    api.get('/pack/status').then((r) => {
      setStatus(r.data);
      if (r.data.last) setPhase('done');
    });
  }, []);

  const startOpen = async () => {
    setOpening(true);
    setPhase('pack');
    try {
      const { data } = await api.post('/pack/open');
      // 1.6s "rasgando el pack", luego reveal
      setTimeout(() => {
        setStatus({ can_open: false, last: data });
        setPhase('reveal');
        setRevealed(0);
      }, 1600);
    } catch (err) {
      setOpening(false);
      setPhase('intro');
      const msg = err?.response?.data?.detail || 'No se pudo abrir el pack';
      toast.error(msg);
    }
  };

  const revealNext = () => {
    if (!status?.last) return;
    if (revealed >= status.last.cards.length - 1) {
      setPhase('done');
      setOpening(false);
    } else {
      setRevealed((n) => n + 1);
    }
  };

  if (!status) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="max-w-md mx-auto px-6 py-20 text-center text-slate-400">Cargando…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-black via-violet-950/30 to-slate-950 text-white overflow-hidden">
      <Navbar />

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <Package size={14} className="text-amber-400" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-amber-300 font-bold">
              Pack Opening · Daily
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter">
            Tu pack del día.
          </h1>
        </div>

        <AnimatePresence mode="wait">
          {phase === 'intro' && status.can_open && (
            <IntroPhase key="intro" onOpen={startOpen} disabled={opening} />
          )}

          {phase === 'pack' && (
            <RippingPhase key="ripping" />
          )}

          {phase === 'reveal' && status.last && (
            <RevealPhase
              key="reveal"
              cards={status.last.cards}
              revealed={revealed}
              onNext={revealNext}
              rarePull={status.last.rare_pull}
            />
          )}

          {phase === 'done' && status.last && (
            <DonePhase key="done" pack={status.last} canOpen={status.can_open} />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function IntroPhase({ onOpen, disabled }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="text-center"
    >
      <motion.div
        animate={{ y: [0, -12, 0], rotate: [-2, 2, -2] }}
        transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
        className="mx-auto mb-8 w-48 h-64 rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-amber-500 ring-2 ring-white/30 shadow-2xl shadow-violet-500/40 flex items-center justify-center relative overflow-hidden cursor-pointer"
        onClick={onOpen}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.4),transparent_60%)]" />
        <div className="absolute top-0 left-0 right-0 h-2 bg-amber-300 opacity-80" />
        <div className="text-center relative">
          <Sparkles size={48} className="mx-auto mb-2 text-white drop-shadow-lg" />
          <div className="text-white font-black text-xl tracking-widest">PACK</div>
          <div className="text-white/80 text-xs uppercase tracking-widest">5 cartas</div>
        </div>
      </motion.div>

      <button
        onClick={onOpen}
        disabled={disabled}
        className="inline-flex items-center justify-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-rose-500 text-white text-lg font-black uppercase tracking-widest hover:shadow-2xl hover:shadow-amber-500/40 transition disabled:opacity-50"
      >
        <Sparkles size={18} /> Abrir pack
      </button>
    </motion.div>
  );
}

function RippingPhase() {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="text-center"
    >
      <motion.div
        animate={{ rotate: [0, -8, 8, -8, 8, 0], scale: [1, 1.05, 1, 1.05, 1] }}
        transition={{ duration: 1.4 }}
        className="mx-auto mb-6 w-48 h-64 rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-600 to-amber-500 ring-2 ring-white/30 shadow-2xl shadow-violet-500/40 relative overflow-hidden"
      >
        <motion.div
          animate={{ y: [0, -100] }}
          transition={{ duration: 1.4, ease: 'easeIn' }}
          className="absolute top-0 left-0 right-0 h-2 bg-amber-300"
        />
        <div className="absolute inset-0 flex items-center justify-center text-white font-black">
          <Sparkles size={64} className="animate-spin" style={{ animationDuration: '2s' }} />
        </div>
      </motion.div>
      <p className="text-amber-300 font-bold uppercase tracking-widest animate-pulse">
        Abriendo…
      </p>
    </motion.div>
  );
}

function RevealPhase({ cards, revealed, onNext, rarePull }) {
  const current = cards[revealed];
  const r = RARITY[current.rarity] || RARITY.common;
  const isLast = revealed === cards.length - 1;
  const isRare = current.rarity === 'rare' || current.rarity === 'mythic';

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="text-center"
    >
      <div className="text-xs uppercase tracking-widest text-slate-400 font-bold mb-3">
        Carta {revealed + 1} / {cards.length}
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={revealed}
          initial={{ rotateY: 180, scale: 0.8, opacity: 0 }}
          animate={{ rotateY: 0, scale: 1, opacity: 1 }}
          exit={{ scale: 0.8, opacity: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className={`mx-auto rounded-2xl bg-gradient-to-br ${r.bg} ring-4 ${r.ring} shadow-2xl overflow-hidden relative`}
          style={{ width: 'min(90vw, 320px)', aspectRatio: '63/88' }}
        >
          {isRare && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: [0, 1, 0.5, 1, 0.7] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute inset-0 bg-gradient-to-tr from-transparent via-white/30 to-transparent pointer-events-none"
              style={{ backgroundSize: '200% 200%' }}
            />
          )}
          {current.image_url ? (
            <img src={current.image_url} alt={current.name} className="w-full h-full object-cover" />
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <Gem size={72} className={r.text} />
            </div>
          )}

          <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/90 to-transparent">
            <div className={`text-[10px] uppercase tracking-widest font-bold ${r.text} mb-1 flex items-center gap-1`}>
              {current.rarity === 'mythic' && <Star size={11} fill="currentColor" />}
              {r.label}
            </div>
            <h3 className="text-lg font-black text-white leading-tight">{current.name}</h3>
            {current.price_clp != null && (
              <p className="text-sm text-amber-300 font-mono">${current.price_clp.toLocaleString('es-CL')}</p>
            )}
          </div>
        </motion.div>
      </AnimatePresence>

      <button
        onClick={onNext}
        className="mt-8 inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/10 hover:bg-white/20 text-white font-bold text-sm uppercase tracking-widest transition"
      >
        {isLast ? '¡Listo!' : 'Siguiente →'}
      </button>
    </motion.div>
  );
}

function DonePhase({ pack, canOpen }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
      className="text-center"
    >
      <p className="text-emerald-300 mb-6">
        Pack abierto. {pack.rare_pull === 2 ? '🌟 Mythic pull!' : pack.rare_pull === 1 ? 'Buena rare.' : 'Suerte mañana.'}
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-8">
        {pack.cards.map((c, i) => {
          const r = RARITY[c.rarity] || RARITY.common;
          return (
            <div key={i} className={`rounded-xl bg-gradient-to-br ${r.bg} ring-2 ${r.ring} overflow-hidden`} style={{ aspectRatio: '63/88' }}>
              {c.image_url ? (
                <img src={c.image_url} alt={c.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-300">
                  <Gem size={28} />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {!canOpen && (
        <div className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.04] border border-white/10 text-slate-300 text-sm">
          <Clock size={14} /> Volvé mañana para tu próximo pack.
        </div>
      )}
    </motion.div>
  );
}
