import { useState } from 'react';
import { motion } from 'framer-motion';
import { Package, Sparkles, RotateCw, Wand2, Trophy } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import EmptyState from '../components/EmptyState';
import { api } from '../lib/api';

const RARITY = {
  common:   'ring-slate-500/40 text-slate-300',
  uncommon: 'ring-emerald-500/50 text-emerald-200',
  rare:     'ring-amber-500/60 text-amber-200',
  mythic:   'ring-rose-500/70 text-rose-200',
};

export default function Sealed() {
  const [setCode, setSetCode] = useState('');
  const [packs, setPacks] = useState(6);
  const [pool, setPool] = useState(null);
  const [suggestion, setSuggestion] = useState(null);
  const [opening, setOpening] = useState(false);
  const [suggesting, setSuggesting] = useState(false);

  const open = async () => {
    setOpening(true);
    setPool(null);
    setSuggestion(null);
    try {
      const { data } = await api.get('/sealed/open', {
        params: { packs, ...(setCode ? { set_code: setCode } : {}) },
      });
      setPool(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Scryfall no respondió');
    } finally {
      setOpening(false);
    }
  };

  const suggest = async () => {
    if (!pool) return;
    setSuggesting(true);
    try {
      const { data } = await api.post('/sealed/suggest', { pool: pool.cards });
      setSuggestion(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'IA no pudo construir');
    } finally {
      setSuggesting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-emerald-950/20 to-slate-950 text-white">
      <Navbar />

      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <Package size={14} className="text-emerald-300" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-emerald-300 font-bold">
              Sealed Generator
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter">
            Abre 6 sobres. IA arma tu deck.
          </h1>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto">
            Pool sealed real de Scryfall. Claude analiza tu pool y te sugiere un deck 40-card óptimo.
          </p>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap gap-3 items-end justify-center mb-8">
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">
              Set (opcional, ej: dmu)
            </label>
            <input
              value={setCode}
              onChange={(e) => setSetCode(e.target.value.toLowerCase())}
              placeholder="random"
              className="px-3 py-2 rounded-lg bg-white/[0.05] border border-white/10 text-sm w-32 uppercase font-mono"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">
              Sobres
            </label>
            <input
              type="number" min={1} max={12} value={packs}
              onChange={(e) => setPacks(e.target.value)}
              className="px-3 py-2 rounded-lg bg-white/[0.05] border border-white/10 text-sm w-20 tabular-nums"
            />
          </div>
          <button
            onClick={open}
            disabled={opening}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-bold text-sm hover:shadow-lg transition disabled:opacity-50 inline-flex items-center gap-2"
          >
            {opening ? <><RotateCw size={14} className="animate-spin" /> Abriendo…</> : <><Package size={14} /> Abrir sobres</>}
          </button>
        </div>

        {!pool && !opening && (
          <EmptyState
            icon={Package}
            title="Sin pool aún"
            description="Configurá set (opcional) y cantidad de sobres, luego hacé click en 'Abrir sobres'. Scryfall te dará un pool real."
            accent="emerald"
          />
        )}

        {pool && (
          <>
            {/* Suggest button */}
            {!suggestion && (
              <div className="text-center mb-6">
                <button
                  onClick={suggest}
                  disabled={suggesting}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-bold text-sm hover:shadow-lg transition disabled:opacity-50 inline-flex items-center gap-2"
                >
                  {suggesting ? <><RotateCw size={14} className="animate-spin" /> Pensando…</> : <><Wand2 size={14} /> IA sugiere mi deck</>}
                </button>
              </div>
            )}

            {suggestion && <Suggestion s={suggestion} />}

            <h2 className="text-2xl font-black mb-4 mt-8 flex items-center gap-2">
              <Package size={20} className="text-emerald-300" />
              Pool · {pool.pool_size} cartas
              <span className="text-xs text-slate-500 font-mono">{pool.set_code?.toUpperCase()}</span>
            </h2>
            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
              {pool.cards.map((c, i) => <CardThumb key={i} card={c} />)}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function CardThumb({ card }) {
  const r = RARITY[card.rarity] || RARITY.common;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`relative rounded-lg ring-1 ${r.split(' ')[0]} overflow-hidden bg-slate-800`}
      style={{ aspectRatio: '63/88' }}
      title={card.name}
    >
      {card.image_url ? (
        <img src={card.image_url} alt={card.name} className="w-full h-full object-cover" loading="lazy" />
      ) : (
        <div className="w-full h-full flex items-center justify-center p-2 text-center text-[9px] font-bold text-slate-400">
          {card.name}
        </div>
      )}
    </motion.div>
  );
}

function Suggestion({ s }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-gradient-to-br from-violet-700/30 via-slate-900 to-fuchsia-700/30 ring-1 ring-violet-500/30 p-6 mb-6"
    >
      <div className="flex items-center gap-2 mb-3">
        <Trophy size={18} className="text-amber-300" />
        <span className="text-[10px] uppercase tracking-widest text-violet-300 font-bold">Sugerencia IA</span>
      </div>

      <h3 className="text-2xl font-black mb-1">{s.expected_archetype || 'Deck'}</h3>
      <div className="flex flex-wrap gap-2 mt-2">
        {s.main_colors.map((c) => (
          <span key={c} className="px-2 py-0.5 rounded bg-violet-500/30 text-violet-100 text-xs font-bold uppercase">{c}</span>
        ))}
        {s.splash_colors?.map((c) => (
          <span key={c} className="px-2 py-0.5 rounded bg-fuchsia-500/20 text-fuchsia-200 text-xs font-bold uppercase">+{c}</span>
        ))}
      </div>

      {s.core_strategy && <p className="text-slate-200 mt-3 italic">"{s.core_strategy}"</p>}

      {s.recommended_cards && s.recommended_cards.length > 0 && (
        <div className="mt-4">
          <div className="text-[10px] uppercase tracking-widest text-violet-300 font-bold mb-2">
            Cartas recomendadas
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1">
            {s.recommended_cards.map((rc, i) => (
              <div key={i} className="flex items-baseline gap-2 text-sm">
                <span className="font-mono text-violet-300 tabular-nums w-6">×{rc.qty}</span>
                <span className="font-bold flex-1 truncate">{rc.name}</span>
                {rc.reason && <span className="text-[10px] text-slate-500 italic">{rc.reason}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {s.tip && (
        <p className="mt-4 text-xs text-amber-200 bg-amber-500/10 ring-1 ring-amber-500/30 rounded p-2">
          💡 {s.tip}
        </p>
      )}

      {s.is_mock && (
        <p className="mt-3 text-[10px] uppercase tracking-widest text-amber-300/70 font-bold text-center">
          ⚠ Modo mock — configurá ANTHROPIC_API_KEY para sugerencia real
        </p>
      )}
    </motion.div>
  );
}
