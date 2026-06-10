import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Camera, ScanLine, Search, X, ExternalLink, Loader2, AlertCircle,
  ShoppingCart, Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import { api } from '../lib/api';

const GAMES = {
  magic: {
    label: 'Magic',
    color: 'cyan',
    suggest: '/scanner/suggest',
    lookup: '/scanner/lookup',
    placeholder: 'Lightning Bolt, Black Lotus…',
    kind: 'magic',
  },
  pokemon: {
    label: 'Pokémon',
    color: 'amber',
    suggest: '/scanner/pokemon/suggest',
    lookup: '/scanner/pokemon/lookup',
    placeholder: 'Charizard, Pikachu…',
    kind: 'pokemon',
  },
  yugioh: {
    label: 'Yu-Gi-Oh!',
    color: 'violet',
    suggest: '/scanner/yugioh/suggest',
    lookup: '/scanner/yugioh/lookup',
    placeholder: 'Dark Magician, Blue-Eyes…',
    kind: 'yugioh',
  },
  onepiece: {
    label: 'One Piece',
    color: 'rose',
    suggest: null,
    lookup: '/scanner/onepiece/lookup',
    placeholder: 'Luffy, Zoro…',
    kind: 'generic',
  },
  union: {
    label: 'Union Arena',
    color: 'emerald',
    suggest: null,
    lookup: '/scanner/union/lookup',
    placeholder: 'Buscar por nombre…',
    kind: 'generic',
  },
  digimon: {
    label: 'Digimon',
    color: 'fuchsia',
    suggest: null,
    lookup: '/scanner/digimon/lookup',
    placeholder: 'Agumon, Greymon…',
    kind: 'generic',
  },
};

const COLOR_CLS = {
  cyan:    { accent: 'text-cyan-300',    ring: 'ring-cyan-500/30',    bg: 'from-cyan-900/30',    btn: 'from-cyan-500 to-blue-500',     focus: 'focus:ring-cyan-500/50' },
  amber:   { accent: 'text-amber-300',   ring: 'ring-amber-500/30',   bg: 'from-amber-900/30',   btn: 'from-amber-500 to-orange-500',  focus: 'focus:ring-amber-500/50' },
  violet:  { accent: 'text-violet-300',  ring: 'ring-violet-500/30',  bg: 'from-violet-900/30',  btn: 'from-violet-500 to-fuchsia-500', focus: 'focus:ring-violet-500/50' },
  rose:    { accent: 'text-rose-300',    ring: 'ring-rose-500/30',    bg: 'from-rose-900/30',    btn: 'from-rose-500 to-fuchsia-500',  focus: 'focus:ring-rose-500/50' },
  emerald: { accent: 'text-emerald-300', ring: 'ring-emerald-500/30', bg: 'from-emerald-900/30', btn: 'from-emerald-500 to-cyan-500',  focus: 'focus:ring-emerald-500/50' },
  fuchsia: { accent: 'text-fuchsia-300', ring: 'ring-fuchsia-500/30', bg: 'from-fuchsia-900/30', btn: 'from-fuchsia-500 to-violet-500', focus: 'focus:ring-fuchsia-500/50' },
};

export default function Scanner() {
  const videoRef = useRef(null);
  const [game, setGame] = useState('magic');
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraError, setCameraError] = useState(null);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [result, setResult] = useState(null); // CardLookupOut (magic) o list (pokemon)
  const [loading, setLoading] = useState(false);
  const debounceRef = useRef(null);

  const gameCfg = GAMES[game];
  const cls = COLOR_CLS[gameCfg.color];

  // Reset cuando cambia de juego
  useEffect(() => {
    setQuery('');
    setSuggestions([]);
    setResult(null);
  }, [game]);

  // Cámara
  useEffect(() => {
    if (!cameraOn) return;
    let stream;
    const start = async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (videoRef.current) videoRef.current.srcObject = stream;
      } catch (e) {
        setCameraError(e?.message || 'No se pudo abrir la cámara');
        setCameraOn(false);
      }
    };
    start();
    return () => { if (stream) stream.getTracks().forEach((t) => t.stop()); };
  }, [cameraOn]);

  // Autocomplete debounced — solo si el juego soporta
  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (!gameCfg.suggest || query.trim().length < 2) { setSuggestions([]); return; }
    debounceRef.current = setTimeout(() => {
      api.get(gameCfg.suggest, { params: { q: query } })
        .then((r) => setSuggestions(r.data.suggestions || []))
        .catch(() => setSuggestions([]));
    }, 220);
    return () => clearTimeout(debounceRef.current);
  }, [query, game]);

  const handleLookup = async (name) => {
    setLoading(true);
    setResult(null);
    try {
      const { data } = await api.get(gameCfg.lookup, { params: { name } });
      setResult(data);
      setSuggestions([]);
      const resolvedName = Array.isArray(data) ? (data[0]?.name || name) : data.name;
      setQuery(resolvedName);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se encontró la carta');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-white">
      <Navbar />

      <div className="max-w-5xl mx-auto px-6 py-10 sm:py-14">
        <div className="text-center mb-6">
          <div className="inline-flex items-center gap-2 mb-3">
            <ScanLine size={14} className={cls.accent} />
            <span className={`text-[10px] uppercase tracking-[0.5em] font-bold ${cls.accent}`}>
              AR Card Scanner · TCGPlayer
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter">
            Apuntá. Tipea. Comprá.
          </h1>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto">
            Buscá cualquier carta, mirá su precio actualizado de TCGPlayer y comprala con un click.
          </p>
        </div>

        {/* Game tabs — scrolleable horizontal en mobile */}
        <div className="flex justify-center mb-6">
          <div className="inline-flex rounded-xl bg-white/[0.05] border border-white/10 p-1 overflow-x-auto no-scrollbar max-w-full">
            {Object.entries(GAMES).map(([k, g]) => (
              <button
                key={k}
                onClick={() => setGame(k)}
                className={`px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-bold transition whitespace-nowrap ${
                  game === k
                    ? `bg-gradient-to-r ${COLOR_CLS[g.color].btn} text-white shadow-lg`
                    : 'text-white/60 hover:text-white'
                }`}
              >
                {g.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          {/* Camera */}
          <div className="rounded-2xl bg-black ring-1 ring-white/10 overflow-hidden aspect-[3/4] sm:aspect-square relative">
            {cameraOn ? (
              <>
                <video ref={videoRef} autoPlay playsInline muted className="absolute inset-0 w-full h-full object-cover" />
                <div className="absolute inset-0 pointer-events-none">
                  <div className={`absolute inset-8 ring-2 ${cls.ring} rounded-2xl`} />
                  <div className={`absolute left-8 right-8 top-1/2 -translate-y-1/2 h-px ${cls.ring} opacity-40`}>
                    <motion.div
                      animate={{ scaleX: [0, 1, 0] }}
                      transition={{ duration: 2, repeat: Infinity, ease: 'linear' }}
                      className={`h-full origin-left ${cls.accent === 'text-cyan-300' ? 'bg-cyan-300' : 'bg-amber-300'}`}
                    />
                  </div>
                </div>
                <button
                  onClick={() => setCameraOn(false)}
                  className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/60 backdrop-blur text-white hover:bg-black/80 flex items-center justify-center"
                  aria-label="Cerrar cámara"
                >
                  <X size={14} />
                </button>
              </>
            ) : (
              <div className={`absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br ${cls.bg} to-slate-900 text-center px-6`}>
                <Camera size={48} className={`${cls.accent} mb-4`} />
                <p className="text-slate-400 mb-5 max-w-xs">
                  Activá la cámara para usar la carta como referencia visual mientras escribís.
                </p>
                <button
                  onClick={() => { setCameraError(null); setCameraOn(true); }}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r ${cls.btn} text-white font-bold text-sm hover:shadow-lg transition`}
                >
                  <Camera size={14} /> Activar cámara
                </button>
                {cameraError && (
                  <p className="mt-4 text-xs text-rose-400 flex items-center gap-1.5">
                    <AlertCircle size={12} /> {cameraError}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Search */}
          <div className="space-y-4">
            <div className="relative">
              <Search size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder={gameCfg.placeholder}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && query.trim()) handleLookup(query.trim()); }}
                className={`w-full pl-11 pr-4 py-3 rounded-xl bg-white/[0.05] border border-white/10 text-white placeholder:text-slate-500 focus:outline-none focus:ring-2 ${cls.focus}`}
              />
              {loading && (
                <Loader2 size={16} className={`absolute right-4 top-1/2 -translate-y-1/2 ${cls.accent} animate-spin`} />
              )}
              {suggestions.length > 0 && (
                <ul className="absolute z-10 left-0 right-0 mt-1 rounded-xl bg-bg-surface/95 backdrop-blur-xl border border-bg-border shadow-2xl overflow-hidden max-h-64 overflow-y-auto">
                  {suggestions.slice(0, 10).map((s) => (
                    <li key={s}>
                      <button
                        onClick={() => handleLookup(s)}
                        className="w-full text-left px-4 py-2 text-sm text-white/80 hover:bg-white/10 hover:text-white transition"
                      >
                        {s}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <p className="text-xs text-slate-500">
              Precios via TCGPlayer Market Price · Yu-Gi-Oh! y One Piece próximamente.
            </p>

            <AnimatePresence>
              {result && gameCfg.kind === 'magic' && <MagicResult card={result} cls={cls} />}
              {result && gameCfg.kind === 'pokemon' && <PokemonResults cards={result} />}
              {result && gameCfg.kind === 'yugioh' && <YugiohResults cards={result} cls={cls} />}
              {result && gameCfg.kind === 'generic' && <GenericResults cards={result} cls={cls} />}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}

function MagicResult({ card, cls }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className={`rounded-2xl bg-gradient-to-br ${cls.bg} to-slate-900 ring-1 ${cls.ring} p-4`}
    >
      <div className="flex gap-4">
        {card.image_normal && (
          <img src={card.image_normal} alt={card.name} className="w-28 sm:w-32 rounded-xl ring-1 ring-white/10" />
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-black leading-tight">{card.name}</h3>
          <p className="text-xs text-slate-400 mt-0.5">{card.set_name} · {card.set_code?.toUpperCase()}</p>
          <p className={`text-xs mt-1 ${cls.accent}`}>{card.type_line}</p>
          <div className="flex gap-2 mt-3 flex-wrap">
            {card.rarity && (
              <span className="px-2 py-1 rounded-md bg-amber-500/20 text-amber-200 text-xs font-bold uppercase">
                {card.rarity}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Prices grid */}
      <div className="mt-4 grid grid-cols-2 gap-2">
        <PriceCell
          label="Normal"
          usd={card.price_usd}
          clp={card.price_clp}
          highlight
        />
        <PriceCell
          label="Foil"
          usd={card.price_usd_foil}
          clp={card.price_clp_foil}
        />
      </div>
      {card.price_eur != null && (
        <div className="mt-2 text-[11px] text-slate-500 text-right">
          Cardmarket EU: €{card.price_eur}
        </div>
      )}

      {card.oracle_text && (
        <div className="mt-3 text-xs text-slate-300 bg-black/30 rounded-lg p-3 leading-relaxed whitespace-pre-line max-h-32 overflow-y-auto">
          {card.oracle_text}
        </div>
      )}

      {/* Action buttons */}
      <div className="mt-4 flex flex-wrap gap-2">
        {card.tcgplayer_url ? (
          <a
            href={card.tcgplayer_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-bold uppercase tracking-widest hover:shadow-lg hover:shadow-orange-500/30 transition flex-1 justify-center"
          >
            <ShoppingCart size={14} /> Comprar TCGPlayer <ExternalLink size={11} />
          </a>
        ) : card.tcgplayer_search_url ? (
          <a
            href={card.tcgplayer_search_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-500/20 text-orange-200 ring-1 ring-orange-500/40 text-sm font-bold uppercase tracking-widest hover:bg-orange-500/30 transition flex-1 justify-center"
          >
            <ShoppingCart size={14} /> Buscar TCGPlayer <ExternalLink size={11} />
          </a>
        ) : null}

        {card.cardmarket_url && (
          <a
            href={card.cardmarket_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-blue-500/15 text-blue-200 ring-1 ring-blue-500/30 text-xs font-bold uppercase tracking-widest hover:bg-blue-500/25 transition"
          >
            Cardmarket <ExternalLink size={10} />
          </a>
        )}
        {card.scryfall_uri && (
          <a
            href={card.scryfall_uri}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-white/[0.05] text-white/70 hover:text-white hover:bg-white/10 text-xs font-bold uppercase tracking-widest transition"
          >
            Scryfall <ExternalLink size={10} />
          </a>
        )}
      </div>
    </motion.div>
  );
}

function PokemonResults({ cards }) {
  if (!cards || cards.length === 0) {
    return (
      <div className="rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-5 text-center text-slate-400">
        Sin resultados.
      </div>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="space-y-3 max-h-[70vh] overflow-y-auto pr-1"
    >
      <p className="text-[10px] uppercase tracking-widest text-amber-300 font-bold">
        {cards.length} impresion{cards.length === 1 ? '' : 'es'} encontrada{cards.length === 1 ? '' : 's'}
      </p>
      {cards.map((c) => (
        <div key={c.id} className="rounded-2xl bg-gradient-to-br from-amber-900/20 to-slate-900 ring-1 ring-amber-500/20 p-3">
          <div className="flex gap-3">
            {c.image_small && (
              <img src={c.image_small} alt={c.name} className="w-20 sm:w-24 rounded-lg ring-1 ring-white/10" />
            )}
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-black leading-tight">{c.name}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{c.set_name} #{c.number}</p>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {c.rarity && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 text-[10px] font-bold uppercase">
                    {c.rarity}
                  </span>
                )}
                {c.hp && (
                  <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-200 text-[10px] font-bold">
                    HP {c.hp}
                  </span>
                )}
                {(c.types || []).map((t) => (
                  <span key={t} className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-200 text-[10px] font-bold uppercase">
                    {t}
                  </span>
                ))}
              </div>
              {c.price_usd != null && (
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-lg font-black text-emerald-300 tabular-nums">
                    ${c.price_clp?.toLocaleString('es-CL')}
                  </span>
                  <span className="text-xs text-slate-400 font-mono">US${c.price_usd.toFixed(2)}</span>
                </div>
              )}
              <div className="mt-2 flex gap-2 flex-wrap">
                {c.tcgplayer_url && (
                  <a
                    href={c.tcgplayer_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[10px] font-bold uppercase tracking-widest hover:shadow-lg transition"
                  >
                    Buy <ExternalLink size={10} />
                  </a>
                )}
                {c.cardmarket_url && (
                  <a
                    href={c.cardmarket_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-500/15 text-blue-200 ring-1 ring-blue-500/30 text-[10px] font-bold uppercase tracking-widest hover:bg-blue-500/25 transition"
                  >
                    EU <ExternalLink size={9} />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </motion.div>
  );
}

function YugiohResults({ cards, cls }) {
  if (!cards || cards.length === 0) {
    return <div className="rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-5 text-center text-slate-400">Sin resultados.</div>;
  }
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
      <p className={`text-[10px] uppercase tracking-widest font-bold ${cls.accent}`}>
        {cards.length} carta{cards.length === 1 ? '' : 's'} encontrada{cards.length === 1 ? '' : 's'}
      </p>
      {cards.map((c) => (
        <div key={c.id} className={`rounded-2xl bg-gradient-to-br ${cls.bg} to-slate-900 ring-1 ${cls.ring} p-3`}>
          <div className="flex gap-3">
            {c.image_small && <img src={c.image_small} alt={c.name} className="w-20 sm:w-24 rounded-lg ring-1 ring-white/10" />}
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-black leading-tight">{c.name}</h3>
              <p className="text-[11px] text-slate-400 mt-0.5">{c.type}{c.archetype ? ` · ${c.archetype}` : ''}</p>
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {c.attribute && <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-200 text-[10px] font-bold">{c.attribute}</span>}
                {c.level != null && <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 text-[10px] font-bold">LV {c.level}</span>}
                {c.atk != null && <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-200 text-[10px] font-bold">ATK {c.atk}</span>}
                {c.def_ != null && <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-200 text-[10px] font-bold">DEF {c.def_}</span>}
              </div>
              {c.price_usd != null && (
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-lg font-black text-emerald-300 tabular-nums">${c.price_clp?.toLocaleString('es-CL')}</span>
                  <span className="text-xs text-slate-400 font-mono">US${c.price_usd.toFixed(2)}</span>
                </div>
              )}
              <div className="mt-2 flex gap-2 flex-wrap">
                {c.tcgplayer_search_url && (
                  <a href={c.tcgplayer_search_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[10px] font-bold uppercase tracking-widest hover:shadow-lg transition">
                    Buy <ExternalLink size={10} />
                  </a>
                )}
                {c.ygoprodeck_url && (
                  <a href={c.ygoprodeck_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-violet-500/15 text-violet-200 ring-1 ring-violet-500/30 text-[10px] font-bold uppercase tracking-widest hover:bg-violet-500/25 transition">
                    YGOPro <ExternalLink size={9} />
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      ))}
    </motion.div>
  );
}

function GenericResults({ cards, cls }) {
  if (!cards || cards.length === 0) {
    return <div className="rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-5 text-center text-slate-400">Sin resultados.</div>;
  }
  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
      <p className={`text-[10px] uppercase tracking-widest font-bold ${cls.accent}`}>
        {cards.length} resultado{cards.length === 1 ? '' : 's'}
      </p>
      {cards.map((c) => (
        <div key={c.id} className={`rounded-2xl bg-gradient-to-br ${cls.bg} to-slate-900 ring-1 ${cls.ring} p-3`}>
          <div className="flex gap-3">
            {c.image_url && <img src={c.image_url} alt={c.name} className="w-20 sm:w-24 rounded-lg ring-1 ring-white/10" />}
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-black leading-tight">{c.name}</h3>
              {c.set_name && <p className="text-[11px] text-slate-400 mt-0.5">{c.set_name}</p>}
              <div className="flex gap-1.5 mt-2 flex-wrap">
                {c.rarity && <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-200 text-[10px] font-bold uppercase">{c.rarity}</span>}
                {c.type && <span className={`px-1.5 py-0.5 rounded ring-1 ${cls.ring} ${cls.accent} text-[10px] font-bold`}>{c.type}</span>}
                {c.cost && <span className="px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-200 text-[10px] font-bold">Cost {c.cost}</span>}
                {c.power && <span className="px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-200 text-[10px] font-bold">{c.power}</span>}
                {c.color && <span className="px-1.5 py-0.5 rounded bg-cyan-500/20 text-cyan-200 text-[10px] font-bold">{c.color}</span>}
              </div>
              {c.card_text && (
                <p className="text-[11px] text-slate-300 mt-2 bg-black/30 rounded p-2 leading-snug line-clamp-3">{c.card_text}</p>
              )}
              {c.tcgplayer_search_url && (
                <a href={c.tcgplayer_search_url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-gradient-to-r from-orange-500 to-amber-500 text-white text-[10px] font-bold uppercase tracking-widest hover:shadow-lg transition">
                  Buy TCGPlayer <ExternalLink size={10} />
                </a>
              )}
            </div>
          </div>
        </div>
      ))}
    </motion.div>
  );
}

function PriceCell({ label, usd, clp, highlight }) {
  const hasPrice = usd != null && usd > 0;
  return (
    <div className={`rounded-lg p-3 ring-1 ${highlight ? 'bg-emerald-500/10 ring-emerald-500/30' : 'bg-white/[0.04] ring-white/10'}`}>
      <div className={`text-[10px] uppercase tracking-widest font-bold mb-1 ${highlight ? 'text-emerald-300' : 'text-slate-400'}`}>
        {label}
      </div>
      {hasPrice ? (
        <>
          <div className={`text-xl font-black tabular-nums ${highlight ? 'text-emerald-200' : 'text-white'}`}>
            ${clp?.toLocaleString('es-CL') || '—'}
          </div>
          <div className="text-[11px] text-slate-400 font-mono mt-0.5">US${usd.toFixed(2)}</div>
        </>
      ) : (
        <div className="text-xs text-slate-500 italic">No disponible</div>
      )}
    </div>
  );
}
