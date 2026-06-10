import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform } from 'framer-motion';
import { Heart, X, Flame, RotateCw, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import { api } from '../lib/api';

export default function Tinder() {
  const [card, setCard] = useState(null);
  const [next, setNext] = useState(null);
  const [stats, setStats] = useState({ total: 0, right: 0, left: 0 });
  const [loading, setLoading] = useState(true);

  const x = useMotionValue(0);
  const rotate = useTransform(x, [-300, 300], [-30, 30]);
  const likeOpacity = useTransform(x, [0, 150], [0, 1]);
  const passOpacity = useTransform(x, [-150, 0], [1, 0]);

  const fetchOne = async () => {
    try {
      const { data } = await api.get('/tinder/next');
      return data;
    } catch {
      toast.error('Scryfall no responde');
      return null;
    }
  };

  // Preload del siguiente para que la transición sea instant
  const loadInitial = async () => {
    setLoading(true);
    const [a, b, s] = await Promise.all([
      fetchOne(),
      fetchOne(),
      api.get('/tinder/me/stats').then((r) => r.data).catch(() => ({ total: 0, right: 0, left: 0 })),
    ]);
    setCard(a);
    setNext(b);
    setStats(s);
    setLoading(false);
  };

  useEffect(() => { loadInitial(); }, []);

  const swipe = async (direction) => {
    if (!card) return;
    // POST sin esperar (fire-and-forget) para que se sienta instantáneo
    api.post('/tinder/swipe', {
      card_name: card.name,
      direction,
      set_code: card.set_code,
      image_url: card.image_normal,
      price_usd: card.price_usd,
    }).catch(() => { /* silent */ });

    setStats((s) => ({
      total: s.total + 1,
      right: s.right + (direction === 'right' ? 1 : 0),
      left: s.left + (direction === 'left' ? 1 : 0),
    }));

    // Avanzar al siguiente + precargar
    setCard(next);
    x.set(0);
    const newNext = await fetchOne();
    setNext(newNext);
  };

  const handleDragEnd = (_, info) => {
    if (info.offset.x > 100) swipe('right');
    else if (info.offset.x < -100) swipe('left');
    else x.set(0);
  };

  if (loading || !card) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="max-w-md mx-auto px-6 py-20 text-center text-slate-400">
          Buscando cartas…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-rose-950/20 to-violet-950/20 text-white">
      <Navbar />

      <div className="max-w-md mx-auto px-6 py-8">
        {/* Header */}
        <div className="text-center mb-4">
          <div className="inline-flex items-center gap-2 mb-1">
            <Flame size={14} className="text-rose-400" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-rose-300 font-bold">
              Cards Tinder
            </span>
          </div>
          <p className="text-slate-400 text-sm">
            Swipe izq = pass · Swipe der = me gusta
          </p>
        </div>

        {/* Stats */}
        <div className="flex justify-between gap-2 mb-5 text-xs">
          <span className="text-rose-300">❤ {stats.right}</span>
          <span className="text-slate-400">Total: {stats.total}</span>
          <span className="text-slate-500">✕ {stats.left}</span>
        </div>

        {/* Card stack */}
        <div className="relative" style={{ aspectRatio: '63/88' }}>
          {/* Next card (behind) */}
          {next?.image_normal && (
            <div className="absolute inset-0 rounded-2xl overflow-hidden ring-1 ring-white/10 scale-[0.94] opacity-60">
              <img src={next.image_normal} alt="" className="w-full h-full object-cover" />
            </div>
          )}

          {/* Current card */}
          <AnimatePresence mode="popLayout">
            <motion.div
              key={card.name}
              style={{ x, rotate }}
              drag="x"
              dragConstraints={{ left: 0, right: 0 }}
              onDragEnd={handleDragEnd}
              initial={{ scale: 0.94, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ x: x.get() > 0 ? 400 : -400, opacity: 0, transition: { duration: 0.25 } }}
              transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              className="absolute inset-0 rounded-2xl overflow-hidden ring-2 ring-white/15 shadow-2xl cursor-grab active:cursor-grabbing bg-slate-900"
            >
              {card.image_normal ? (
                <img
                  src={card.image_normal}
                  alt={card.name}
                  className="w-full h-full object-cover pointer-events-none select-none"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  Sin imagen
                </div>
              )}

              {/* LIKE / PASS overlays */}
              <motion.div
                style={{ opacity: likeOpacity }}
                className="absolute top-6 left-6 rotate-[-15deg] px-4 py-2 rounded-lg border-4 border-rose-400 text-rose-300 font-black text-2xl tracking-widest bg-rose-500/10 backdrop-blur pointer-events-none"
              >
                LIKE
              </motion.div>
              <motion.div
                style={{ opacity: passOpacity }}
                className="absolute top-6 right-6 rotate-[15deg] px-4 py-2 rounded-lg border-4 border-slate-300 text-slate-200 font-black text-2xl tracking-widest bg-slate-500/10 backdrop-blur pointer-events-none"
              >
                PASS
              </motion.div>

              {/* Footer info */}
              <div className="absolute bottom-0 left-0 right-0 p-4 bg-gradient-to-t from-black/95 via-black/70 to-transparent pointer-events-none">
                <h3 className="text-xl font-black leading-tight">{card.name}</h3>
                <div className="flex flex-wrap gap-2 mt-2 text-xs">
                  {card.type_line && (
                    <span className="text-cyan-300">{card.type_line}</span>
                  )}
                  {card.rarity && (
                    <span className="px-2 py-0.5 rounded bg-amber-500/30 text-amber-200 uppercase font-bold">
                      {card.rarity}
                    </span>
                  )}
                  {card.price_usd && (
                    <span className="px-2 py-0.5 rounded bg-emerald-500/30 text-emerald-200 font-bold">
                      US${card.price_usd}
                    </span>
                  )}
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Buttons */}
        <div className="flex justify-center gap-6 mt-8">
          <button
            onClick={() => swipe('left')}
            className="w-16 h-16 rounded-full bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center shadow-2xl hover:scale-110 active:scale-95 transition"
            aria-label="Pass"
          >
            <X size={28} />
          </button>
          <button
            onClick={loadInitial}
            className="w-12 h-12 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center self-center transition"
            aria-label="Reload"
          >
            <RotateCw size={16} />
          </button>
          <button
            onClick={() => swipe('right')}
            className="w-16 h-16 rounded-full bg-gradient-to-br from-rose-500 to-fuchsia-600 hover:from-rose-400 hover:to-fuchsia-500 text-white flex items-center justify-center shadow-2xl shadow-rose-500/30 hover:scale-110 active:scale-95 transition"
            aria-label="Like"
          >
            <Heart size={28} fill="currentColor" />
          </button>
        </div>

        <p className="text-center mt-6 text-xs text-slate-500">
          {card.scryfall_uri && (
            <a href={card.scryfall_uri} target="_blank" rel="noopener noreferrer" className="hover:text-cyan-300 inline-flex items-center gap-1">
              Ver en Scryfall <ExternalLink size={10} />
            </a>
          )}
        </p>
      </div>
    </div>
  );
}
