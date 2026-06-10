import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Sparkles, Calendar, Palette, ExternalLink, Copy } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import { api } from '../lib/api';

const COLOR_THEME = {
  red:       { bg: 'from-red-700 via-rose-800 to-red-950',         text: 'text-red-100',     ring: 'ring-red-500/40',     glow: 'shadow-red-500/40' },
  blue:      { bg: 'from-blue-700 via-cyan-800 to-blue-950',       text: 'text-cyan-100',    ring: 'ring-cyan-500/40',    glow: 'shadow-cyan-500/40' },
  green:     { bg: 'from-emerald-700 via-green-800 to-emerald-950',text: 'text-emerald-100', ring: 'ring-emerald-500/40', glow: 'shadow-emerald-500/40' },
  white:     { bg: 'from-amber-200 via-yellow-100 to-amber-50',    text: 'text-amber-900',   ring: 'ring-amber-300',      glow: 'shadow-amber-200/40' },
  black:     { bg: 'from-slate-800 via-zinc-900 to-black',         text: 'text-slate-100',   ring: 'ring-slate-500/40',   glow: 'shadow-slate-700/40' },
  gold:      { bg: 'from-amber-500 via-orange-600 to-amber-800',   text: 'text-amber-100',   ring: 'ring-amber-400/60',   glow: 'shadow-amber-500/50' },
  violet:    { bg: 'from-violet-700 via-fuchsia-800 to-violet-950',text: 'text-violet-100',  ring: 'ring-violet-500/40',  glow: 'shadow-violet-500/40' },
  colorless: { bg: 'from-slate-500 via-slate-600 to-slate-800',    text: 'text-slate-100',   ring: 'ring-slate-400/40',   glow: 'shadow-slate-400/30' },
};

const RARITY_BADGE = {
  common:   'bg-slate-500/30 text-slate-200 ring-slate-400/40',
  uncommon: 'bg-emerald-500/20 text-emerald-200 ring-emerald-400/40',
  rare:     'bg-amber-500/20 text-amber-200 ring-amber-400/40',
  mythic:   'bg-rose-500/20 text-rose-200 ring-rose-400/50',
};

export default function CardOfDay() {
  const [card, setCard] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get('/card-of-day/today')
      .then((r) => setCard(r.data))
      .catch((e) => setError(e?.response?.data?.detail || 'No pudimos generar la carta del día'));
  }, []);

  const copyPrompt = () => {
    if (!card?.art_prompt) return;
    navigator.clipboard?.writeText(card.art_prompt);
    toast.success('Prompt copiado. Pegalo en Midjourney / DALL-E.');
  };

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="max-w-2xl mx-auto px-6 py-20 text-center">
          <p className="text-rose-400">{error}</p>
        </div>
      </div>
    );
  }

  if (!card) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="max-w-2xl mx-auto px-6 py-20 text-center text-slate-400">
          Invocando la carta del día…
        </div>
      </div>
    );
  }

  const t = COLOR_THEME[card.color] || COLOR_THEME.violet;
  const isCreature = !!(card.power || card.toughness);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-black text-white">
      <Navbar />

      <div className="max-w-5xl mx-auto px-6 py-10 sm:py-14">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-violet-400" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-violet-300 font-bold">
              Card of the Day
            </span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-black tracking-tighter">
            La carta de hoy.
          </h1>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto flex items-center justify-center gap-2">
            <Calendar size={14} />
            {new Date(card.date).toLocaleDateString('es-CL', {
              weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
            })}
            {card.is_fresh && (
              <span className="ml-2 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] uppercase tracking-widest font-bold">
                Fresh
              </span>
            )}
          </p>
        </div>

        {/* Card showcase */}
        <div className="grid md:grid-cols-[auto_1fr] gap-8 sm:gap-12 items-start">
          {/* Card render */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, rotateY: -15 }}
            animate={{ opacity: 1, scale: 1, rotateY: 0 }}
            transition={{ duration: 0.7, ease: 'easeOut' }}
            className="mx-auto"
          >
            <div
              className={`relative w-72 sm:w-80 rounded-2xl bg-gradient-to-br ${t.bg} ring-2 ${t.ring} p-4 shadow-2xl ${t.glow} overflow-hidden`}
              style={{ aspectRatio: '63 / 88' }}
            >
              {/* Header */}
              <div className="flex justify-between items-start mb-2">
                <div className={`font-black text-xl ${t.text} drop-shadow-md leading-tight`}>
                  {card.name}
                </div>
                <div className={`text-sm font-bold ${t.text} font-mono whitespace-nowrap`}>
                  {card.mana_cost || ''}
                </div>
              </div>

              {/* Art placeholder */}
              <div className="relative rounded-lg bg-black/30 ring-1 ring-white/10 aspect-[4/3] mb-2 flex items-center justify-center overflow-hidden">
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(255,255,255,0.15),transparent_60%)]" />
                <div className="absolute inset-0 bg-gradient-to-br from-white/5 via-transparent to-black/40" />
                <Palette size={48} className={`${t.text} opacity-30`} />
                <div className={`absolute bottom-2 left-2 right-2 text-[9px] ${t.text} opacity-60 font-mono leading-tight line-clamp-2`}>
                  {card.art_prompt}
                </div>
              </div>

              {/* Type */}
              <div className={`text-xs font-bold ${t.text} mb-2 uppercase tracking-wider`}>
                {card.card_type}
              </div>

              {/* Rules text */}
              <div className={`text-xs ${t.text} bg-black/20 rounded-md p-2 mb-2 leading-snug min-h-[60px]`}>
                {card.text}
              </div>

              {/* Flavor */}
              {card.flavor && (
                <div className={`text-[10px] italic ${t.text} opacity-70 mb-2 leading-tight`}>
                  "{card.flavor}"
                </div>
              )}

              {/* Footer: rarity + p/t */}
              <div className="flex items-end justify-between mt-auto">
                <span className={`text-[9px] uppercase tracking-widest font-bold px-2 py-0.5 rounded-full ring-1 ${RARITY_BADGE[card.rarity] || RARITY_BADGE.common}`}>
                  {card.rarity}
                </span>
                {isCreature && (
                  <div className={`text-lg font-black ${t.text} bg-black/40 rounded-md px-2.5 py-0.5`}>
                    {card.power}/{card.toughness}
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* Meta */}
          <div className="space-y-5">
            <InfoBlock label="Tipo" value={card.card_type || '—'} />
            <InfoBlock label="Coste" value={card.mana_cost || '—'} mono />
            {isCreature && <InfoBlock label="Power / Toughness" value={`${card.power || '—'} / ${card.toughness || '—'}`} mono />}
            <InfoBlock label="Color" value={card.color || '—'} />
            <InfoBlock label="Rareza" value={card.rarity || '—'} />

            <div className="pt-4 border-t border-white/10">
              <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-2 flex items-center gap-2">
                <Palette size={11} /> Art Prompt
              </div>
              <p className="text-sm text-slate-300 leading-relaxed bg-white/[0.03] rounded-lg p-3 border border-white/10">
                {card.art_prompt}
              </p>
              <div className="flex gap-2 mt-3">
                <button
                  onClick={copyPrompt}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/[0.06] hover:bg-white/10 text-white/80 hover:text-white text-xs font-bold uppercase tracking-widest transition"
                >
                  <Copy size={12} /> Copiar prompt
                </button>
                <a
                  href="https://www.midjourney.com/explore"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-violet-500/20 hover:bg-violet-500/30 text-violet-100 text-xs font-bold uppercase tracking-widest transition"
                >
                  <ExternalLink size={12} /> Generar art
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoBlock({ label, value, mono = false }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-widest text-slate-500 font-bold mb-1">{label}</div>
      <div className={`text-base text-white font-bold ${mono ? 'font-mono' : ''}`}>{value}</div>
    </div>
  );
}
