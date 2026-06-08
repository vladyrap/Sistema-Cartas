/** Card Hologram Lab — examiná una carta como holograma volumétrico.
 * Stats flotando alrededor, voiceover narra atributos al hover.
 */
import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Volume2, VolumeX, Sparkles, Cpu, Layers, Coins, Tag } from 'lucide-react';

import { api } from '../lib/api';
import HologramShader from '../components/HologramShader';
import { useNarrator } from '../lib/useNarrator';

export default function CardHologramLab() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const cardIndex = Number(params.get('idx') ?? 0);

  const [deck, setDeck] = useState(null);
  const [enriched, setEnriched] = useState(null);
  const [activeIdx, setActiveIdx] = useState(cardIndex);
  const narrator = useNarrator();

  useEffect(() => {
    api.get(`/decks/me/${id}`).then(r => setDeck(r.data)).catch(() => {});
    api.get(`/tcg/decks/${id}/enrich`).then(r => setEnriched(r.data)).catch(() => {});
  }, [id]);

  const cards = useMemo(() => {
    const m = enriched?.main || [];
    return m.filter(c => c.meta?.image_url);
  }, [enriched]);
  const current = cards[activeIdx];

  // Narrator habla al cambiar carta
  useEffect(() => {
    if (!current || !narrator.enabled) return;
    const parts = [current.name];
    if (current.meta?.type_line) parts.push(current.meta.type_line);
    if (current.meta?.mana_cost) parts.push(`coste ${current.meta.mana_cost}`);
    if (current.meta?.set_name) parts.push(`del set ${current.meta.set_name}`);
    narrator.speak(parts.join(', '));
  }, [activeIdx]); // eslint-disable-line

  function move(d) {
    if (!cards.length) return;
    setActiveIdx(i => (i + d + cards.length) % cards.length);
  }

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'ArrowLeft') move(-1);
      else if (e.key === 'ArrowRight') move(1);
      else if (e.key === 'v' || e.key === 'V') narrator.setEnabled(v => !v);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [cards.length, narrator]); // eslint-disable-line

  if (!cards.length) {
    return (
      <div className="fixed inset-0 bg-black text-cyan-300 font-mono flex items-center justify-center">
        <div className="text-center">
          <Cpu size={32} className="mx-auto mb-4 animate-pulse" />
          <p className="text-xs uppercase tracking-[0.4em]">Cargando holograma…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden font-mono">
      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 p-6 pointer-events-none z-20 flex items-start justify-between">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Link to={`/decks/${id}/builder`} className="inline-flex items-center gap-1.5 text-xs text-cyan-400/60 hover:text-cyan-200 pointer-events-auto">
            <ArrowLeft size={12} /> Volver al builder
          </Link>
          <div className="flex items-center gap-2 mt-2">
            <Sparkles size={12} className="text-cyan-300" />
            <span className="text-[10px] uppercase tracking-[0.4em] text-cyan-300 font-bold">
              HOLO_LAB · {deck?.name}
            </span>
          </div>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="pointer-events-auto">
          <button
            onClick={() => narrator.setEnabled(v => !v)}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg backdrop-blur border text-xs transition ${
              narrator.enabled
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                : 'bg-black/40 border-white/10 text-slate-400'
            }`}
          >
            {narrator.enabled ? <Volume2 size={12} /> : <VolumeX size={12} />}
            Voiceover
          </button>
        </motion.div>
      </div>

      {/* HOLOGRAMA central */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="w-full max-w-2xl h-[80vh]">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeIdx}
              initial={{ opacity: 0, scale: 0.9, filter: 'blur(10px)' }}
              animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
              exit={{ opacity: 0, scale: 1.1, filter: 'blur(10px)' }}
              transition={{ duration: 0.6 }}
              className="w-full h-full"
            >
              <HologramShader imageUrl={current?.meta?.image_url} />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      {/* Stats flotando — col izquierda */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`stats-${activeIdx}`}
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.6 }}
          className="absolute top-1/2 -translate-y-1/2 left-8 z-10 max-w-[240px] space-y-3"
        >
          <StatBlock icon={Tag} label="DESIGNATION" value={current?.name} accent="cyan" />
          {current?.meta?.type_line && (
            <StatBlock icon={Layers} label="CLASSIFICATION" value={current.meta.type_line} accent="cyan" />
          )}
          {current?.meta?.mana_cost && (
            <StatBlock icon={Cpu} label="ENERGY COST" value={current.meta.mana_cost} accent="violet" />
          )}
          {current?.meta?.power != null && (
            <StatBlock icon={Sparkles} label="POWER / TOUGH" value={`${current.meta.power} / ${current.meta.toughness ?? '?'}`} accent="rose" />
          )}
        </motion.div>
      </AnimatePresence>

      {/* Stats — col derecha */}
      <AnimatePresence mode="wait">
        <motion.div
          key={`right-${activeIdx}`}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 30 }}
          transition={{ duration: 0.6 }}
          className="absolute top-1/2 -translate-y-1/2 right-8 z-10 max-w-[240px] space-y-3"
        >
          {current?.meta?.rarity && (
            <StatBlock label="RARITY GRADE" value={current.meta.rarity?.toUpperCase()} accent="amber" />
          )}
          {current?.meta?.set_name && (
            <StatBlock label="ORIGIN SET" value={current.meta.set_name} accent="cyan" />
          )}
          {current?.meta?.collector_number && (
            <StatBlock label="SERIAL" value={`#${current.meta.collector_number}`} accent="cyan" mono />
          )}
          {current?.meta?.prices_usd != null && (
            <StatBlock icon={Coins} label="MARKET VALUE" value={`$${current.meta.prices_usd} USD`} accent="amber" mono />
          )}
          <StatBlock label="COPIES IN DECK" value={`×${current.qty}`} accent="violet" mono />
        </motion.div>
      </AnimatePresence>

      {/* Carousel bottom */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 max-w-2xl w-full px-4 pointer-events-auto">
        <div className="flex items-center justify-center gap-2 mb-3">
          <button onClick={() => move(-1)} className="px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur border border-cyan-500/30 hover:border-cyan-500/60 text-cyan-300 text-xs">
            ← PREV
          </button>
          <div className="px-4 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-xs tabular-nums">
            <span className="text-cyan-200 font-bold">{activeIdx + 1}</span>
            <span className="text-cyan-500/50 mx-1">/</span>
            <span className="text-cyan-400/60">{cards.length}</span>
          </div>
          <button onClick={() => move(1)} className="px-3 py-1.5 rounded-lg bg-black/60 backdrop-blur border border-cyan-500/30 hover:border-cyan-500/60 text-cyan-300 text-xs">
            NEXT →
          </button>
        </div>
        <div className="text-center text-[10px] text-cyan-500/40 uppercase tracking-[0.3em]">
          ← → para navegar · V para voiceover · click+drag en holograma
        </div>
      </div>
    </div>
  );
}

function StatBlock({ icon: Icon, label, value, accent, mono }) {
  const colors = {
    cyan:   { border: 'border-cyan-500/30', label: 'text-cyan-300', text: 'text-cyan-100' },
    violet: { border: 'border-violet-500/30', label: 'text-violet-300', text: 'text-violet-100' },
    rose:   { border: 'border-rose-500/30', label: 'text-rose-300', text: 'text-rose-100' },
    amber:  { border: 'border-amber-500/30', label: 'text-amber-300', text: 'text-amber-100' },
  }[accent] || { border: 'border-white/10', label: 'text-white', text: 'text-white' };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      className={`relative p-3 rounded-lg bg-black/50 backdrop-blur border ${colors.border}`}
    >
      <div className={`flex items-center gap-1.5 text-[9px] uppercase tracking-[0.3em] font-bold mb-1 ${colors.label}`}>
        {Icon && <Icon size={9} />}
        {label}
      </div>
      <div className={`text-sm font-bold ${colors.text} ${mono ? 'font-mono tabular-nums' : ''}`}>
        {value}
      </div>
    </motion.div>
  );
}
