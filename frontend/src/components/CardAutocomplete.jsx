/** Autocomplete contra /api/tcg/cards/search con debounce + preview de card art. */
import { useEffect, useRef, useState } from 'react';
import { Search, Plus, Loader2 } from 'lucide-react';
import { api } from '../lib/api';

export default function CardAutocomplete({ gameId, onAdd, placeholder = 'Buscar carta…' }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(0);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (q.length < 2) { setResults([]); return; }
    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.get('/tcg/cards/search', { params: { q, game_id: gameId, limit: 12 } });
        setResults(r.data || []);
        setHoverIdx(0);
      } catch { setResults([]); }
      finally { setLoading(false); }
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [q, gameId]);

  function handleKey(e) {
    if (!results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setHoverIdx(i => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHoverIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(results[hoverIdx]); }
  }

  function pick(card) {
    onAdd?.(card);
    setQ('');
    setResults([]);
  }

  const preview = results[hoverIdx];

  return (
    <div className="relative">
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          onKeyDown={handleKey}
          placeholder={placeholder}
          className="w-full pl-9 pr-9 py-2.5 rounded-lg bg-slate-900/60 border border-white/10 focus:border-violet-500 outline-none text-sm placeholder:text-slate-500"
        />
        {loading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-violet-400 animate-spin" />}
      </div>

      {results.length > 0 && (
        <div className="absolute z-30 mt-1 left-0 right-0 grid grid-cols-[1fr_180px] gap-2 bg-slate-900/95 backdrop-blur-md border border-white/10 rounded-xl shadow-2xl overflow-hidden">
          {/* Resultados */}
          <ul className="max-h-80 overflow-auto py-1">
            {results.map((c, i) => (
              <li
                key={`${c.source}-${c.name}-${i}`}
                onMouseEnter={() => setHoverIdx(i)}
                onClick={() => pick(c)}
                className={`flex items-center gap-2 px-3 py-2 text-sm cursor-pointer ${
                  i === hoverIdx ? 'bg-violet-500/15 text-white' : 'text-slate-300 hover:bg-white/5'
                }`}
              >
                <Plus size={12} className="text-violet-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="truncate font-medium">{c.name}</div>
                  <div className="text-[10px] text-slate-500 truncate">
                    {c.set_code?.toUpperCase()} · {c.type_line || c.rarity || ''}
                    {c.prices_usd != null && <span className="text-emerald-400 ml-1">${c.prices_usd}</span>}
                  </div>
                </div>
                {c.mana_cost && (
                  <span className="text-[10px] text-amber-300 font-mono">{c.mana_cost}</span>
                )}
              </li>
            ))}
          </ul>
          {/* Preview de card art */}
          <div className="p-2 border-l border-white/10 bg-black/40 flex items-center justify-center">
            {preview?.image_url ? (
              <img
                src={preview.image_url}
                alt={preview.name}
                className="max-h-64 w-auto rounded shadow-2xl object-contain"
                loading="lazy"
              />
            ) : (
              <div className="text-[10px] text-slate-600 text-center px-2">
                Sin preview disponible
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
