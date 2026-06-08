/** Vitrina 3D rotable de cartas del jugador. Usa Card3DFoil. */
import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Sparkles } from 'lucide-react';

import { api } from '../lib/api';
import Card3DFoil from '../components/Card3DFoil';

export default function Card3DShowcase() {
  const { id: deckId } = useParams();
  const [enriched, setEnriched] = useState(null);
  const [idx, setIdx] = useState(0);
  const [foil, setFoil] = useState(true);

  useEffect(() => {
    api.get(`/tcg/decks/${deckId}/enrich`).then(r => setEnriched(r.data)).catch(() => {});
  }, [deckId]);

  const cards = (enriched?.main || []).filter(c => c.meta?.image_url);
  const current = cards[idx];

  function move(d) {
    setIdx(i => (i + d + cards.length) % cards.length);
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowRight') move(1);
      else if (e.key === 'f' || e.key === 'F') setFoil(v => !v);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cards.length]); // eslint-disable-line

  if (!cards.length) {
    return (
      <div className="min-h-screen flex items-center justify-center text-slate-400 bg-slate-950">
        Sin cartas con imagen para mostrar
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-violet-950/20 to-slate-950 text-white">
      <div className="max-w-5xl mx-auto px-4 py-8">
        <div className="text-center mb-6">
          <div className="flex items-center justify-center gap-2 mb-2">
            <Sparkles size={14} className="text-violet-400" />
            <span className="text-[10px] uppercase tracking-widest text-violet-300 font-bold">
              Card Showcase 3D
            </span>
          </div>
          <h1 className="text-3xl font-black bg-gradient-to-r from-white via-violet-100 to-fuchsia-200 bg-clip-text text-transparent">
            {current?.name}
          </h1>
          {current?.meta?.set_name && (
            <p className="text-slate-400 text-sm mt-1">{current.meta.set_name} · {current.meta.rarity}</p>
          )}
        </div>

        <motion.div
          key={idx}
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.4 }}
        >
          <Card3DFoil imageUrl={current?.meta?.image_url} foil={foil} height={520} />
        </motion.div>

        <div className="flex items-center justify-center gap-4 mt-6">
          <button onClick={() => move(-1)} className="p-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10">
            <ChevronLeft size={18} />
          </button>
          <div className="text-sm text-slate-400 tabular-nums">
            {idx + 1} / {cards.length}
          </div>
          <button onClick={() => move(1)} className="p-3 rounded-full bg-white/5 border border-white/10 hover:bg-white/10">
            <ChevronRight size={18} />
          </button>
          <div className="w-px h-8 bg-white/10 mx-2" />
          <button
            onClick={() => setFoil(v => !v)}
            className={`px-4 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition ${
              foil
                ? 'bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400 text-white shadow-lg shadow-violet-500/30'
                : 'bg-white/5 border border-white/10 text-slate-400'
            }`}
          >
            {foil ? 'Foil ON' : 'Foil OFF'}
          </button>
        </div>

        <div className="text-center text-[10px] text-slate-600 mt-4 uppercase tracking-widest">
          ← → para navegar · F para foil · click para girar
        </div>
      </div>
    </div>
  );
}
