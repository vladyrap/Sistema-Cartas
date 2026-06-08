/** Catálogo Premium: cards con tilt 3D mouse-track + comparador de variantes
 * side-by-side + filtros instant.
 */
import { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Filter, X, Plus, ShoppingBag, Lock } from 'lucide-react';
import clsx from 'clsx';

import { api } from '../lib/api';
import TiltCard from '../components/TiltCard';

const ACCESS_LABELS = { NORMAL: 'Normal', ELITE_ACCESS: 'Elite Access', ELITE_PRO: 'Elite Pro' };
const ACCESS_COLORS = {
  NORMAL: 'from-slate-700/30 to-slate-800/20 border-slate-600/30',
  ELITE_ACCESS: 'from-violet-700/30 to-indigo-800/20 border-violet-500/40',
  ELITE_PRO: 'from-amber-500/20 to-orange-700/20 border-amber-500/40',
};

export default function CatalogPremium() {
  const [products, setProducts] = useState([]);
  const [filter, setFilter] = useState({ access: null, gameId: null, preorder: null });
  const [games, setGames] = useState([]);
  const [compareIds, setCompareIds] = useState([]);
  const [variantsMap, setVariantsMap] = useState({});

  useEffect(() => {
    api.get('/catalog').then(r => setProducts(r.data || []));
    api.get('/games').then(r => setGames(r.data || []));
  }, []);

  const filtered = useMemo(() => products.filter(p => {
    if (filter.access && p.access !== filter.access) return false;
    if (filter.gameId && p.game_id !== filter.gameId) return false;
    if (filter.preorder !== null && p.is_preorder !== filter.preorder) return false;
    return true;
  }), [products, filter]);

  async function loadVariants(productId) {
    if (variantsMap[productId]) return variantsMap[productId];
    try {
      const r = await api.get(`/catalog/${productId}/variants`);
      const list = r.data || [];
      setVariantsMap(prev => ({ ...prev, [productId]: list }));
      return list;
    } catch { return []; }
  }

  function toggleCompare(productId) {
    setCompareIds(prev => {
      if (prev.includes(productId)) return prev.filter(i => i !== productId);
      if (prev.length >= 3) {
        return [...prev.slice(1), productId];
      }
      return [...prev, productId];
    });
    loadVariants(productId);
  }

  const comparing = compareIds.map(id => products.find(p => p.id === id)).filter(Boolean);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950/20 text-white">
      {/* Header */}
      <div className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(124,58,237,0.18),transparent_55%)] pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles size={14} className="text-violet-400" />
            <span className="text-[10px] uppercase tracking-widest text-violet-300 font-bold">
              Catálogo Premium
            </span>
          </div>
          <h1 className="text-4xl font-black bg-gradient-to-r from-white via-violet-100 to-fuchsia-200 bg-clip-text text-transparent">
            Tienda
          </h1>
          <p className="text-slate-400 mt-2 text-sm">
            {filtered.length} productos · {compareIds.length > 0 && <span className="text-violet-300">comparando {compareIds.length}</span>}
          </p>

          {/* Filtros */}
          <div className="flex flex-wrap gap-2 mt-5">
            <FilterChip active={!filter.access} label="Todos" onClick={() => setFilter(f => ({ ...f, access: null }))} />
            {Object.entries(ACCESS_LABELS).map(([key, label]) => (
              <FilterChip key={key} active={filter.access === key} label={label}
                onClick={() => setFilter(f => ({ ...f, access: f.access === key ? null : key }))} />
            ))}
            <div className="w-px h-6 bg-white/10 mx-1 self-center" />
            {games.map(g => (
              <FilterChip key={g.id} active={filter.gameId === g.id} label={g.short_name || g.name}
                onClick={() => setFilter(f => ({ ...f, gameId: f.gameId === g.id ? null : g.id }))} />
            ))}
            <div className="w-px h-6 bg-white/10 mx-1 self-center" />
            <FilterChip active={filter.preorder === true} label="Preventa"
              onClick={() => setFilter(f => ({ ...f, preorder: f.preorder === true ? null : true }))} />
          </div>
        </div>
      </div>

      {/* Grid de productos con tilt */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {filtered.map((p, i) => (
            <motion.div
              key={p.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: Math.min(i * 0.03, 0.5) }}
            >
              <TiltCard intensity={10} className="rounded-2xl">
                <div className={clsx(
                  'rounded-2xl overflow-hidden border bg-gradient-to-br backdrop-blur-sm',
                  ACCESS_COLORS[p.access] || ACCESS_COLORS.NORMAL,
                )}>
                  {/* Image area */}
                  <div className="relative aspect-[4/3] bg-black/30 overflow-hidden">
                    {p.image_url ? (
                      <img src={p.image_url} alt={p.name}
                           className="w-full h-full object-cover"
                           style={{ transform: 'translateZ(20px)' }} />
                    ) : (
                      <div className="absolute inset-0 flex items-center justify-center">
                        <ShoppingBag size={40} className="text-slate-700" />
                      </div>
                    )}
                    {/* Access badge */}
                    {p.access !== 'NORMAL' && (
                      <div className="absolute top-2 right-2 flex items-center gap-1 px-2 py-1 rounded-md bg-black/70 backdrop-blur text-[10px] font-bold uppercase tracking-wider">
                        <Lock size={9} className={p.access === 'ELITE_PRO' ? 'text-amber-400' : 'text-violet-400'} />
                        <span className={p.access === 'ELITE_PRO' ? 'text-amber-300' : 'text-violet-300'}>
                          Lv {p.required_level}+
                        </span>
                      </div>
                    )}
                    {p.is_preorder && (
                      <div className="absolute top-2 left-2 px-2 py-1 rounded-md bg-fuchsia-500/30 backdrop-blur text-[10px] font-bold uppercase tracking-wider text-fuchsia-200">
                        Preventa
                      </div>
                    )}
                    {/* Compare toggle */}
                    <button
                      onClick={() => toggleCompare(p.id)}
                      className={clsx(
                        'absolute bottom-2 right-2 p-1.5 rounded-md backdrop-blur transition',
                        compareIds.includes(p.id)
                          ? 'bg-violet-500/80 text-white'
                          : 'bg-black/60 text-slate-300 hover:bg-violet-500/40'
                      )}
                      title="Agregar al comparador"
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                  {/* Body */}
                  <div className="p-4" style={{ transform: 'translateZ(10px)' }}>
                    <div className="text-[10px] uppercase tracking-widest text-slate-500 mb-1 font-semibold">
                      {p.category}
                    </div>
                    <h3 className="font-bold leading-tight mb-2 line-clamp-2">{p.name}</h3>
                    <div className="flex items-end justify-between">
                      <div>
                        <div className="text-[10px] text-slate-500">Precio</div>
                        <div className="text-xl font-black tabular-nums text-white">
                          ${p.price_clp.toLocaleString('es-CL')}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-[10px] text-slate-500">Stock</div>
                        <div className={clsx(
                          'text-sm font-bold tabular-nums',
                          p.stock === 0 ? 'text-rose-400' : p.stock < 5 ? 'text-amber-400' : 'text-emerald-400'
                        )}>
                          {p.stock}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </TiltCard>
            </motion.div>
          ))}
        </div>
        {filtered.length === 0 && (
          <div className="text-center text-slate-500 py-20 text-sm">
            Sin productos que coincidan con los filtros
          </div>
        )}
      </div>

      {/* Comparador flotante */}
      <AnimatePresence>
        {comparing.length > 0 && (
          <motion.div
            initial={{ y: 100, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 100, opacity: 0 }}
            className="fixed bottom-4 left-1/2 -translate-x-1/2 z-50 w-full max-w-5xl px-4"
          >
            <div className="rounded-2xl bg-slate-900/95 backdrop-blur-xl border border-violet-500/30 shadow-2xl shadow-violet-500/20 p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-violet-300 font-bold">
                  <Filter size={11} /> Comparando ({comparing.length})
                </div>
                <button onClick={() => setCompareIds([])} className="text-slate-500 hover:text-white">
                  <X size={14} />
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {comparing.map(p => (
                  <CompareCard
                    key={p.id}
                    product={p}
                    variants={variantsMap[p.id] || []}
                    onRemove={() => toggleCompare(p.id)}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function FilterChip({ active, label, onClick }) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        'px-3 py-1.5 rounded-full text-xs font-semibold uppercase tracking-wider transition',
        active
          ? 'bg-violet-500/30 border border-violet-400/50 text-violet-100 shadow-lg shadow-violet-500/20'
          : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
      )}
    >
      {label}
    </button>
  );
}

function CompareCard({ product, variants, onRemove }) {
  return (
    <div className="rounded-xl bg-black/40 border border-white/5 p-3 relative">
      <button onClick={onRemove} className="absolute top-1 right-1 p-1 text-slate-500 hover:text-rose-400">
        <X size={11} />
      </button>
      <div className="flex items-start gap-2 mb-2">
        {product.image_url ? (
          <img src={product.image_url} className="w-12 h-12 rounded object-cover" alt="" />
        ) : (
          <div className="w-12 h-12 rounded bg-slate-800 flex items-center justify-center">
            <ShoppingBag size={16} className="text-slate-600" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-bold truncate">{product.name}</h4>
          <div className="text-[10px] text-slate-500">{product.category}</div>
        </div>
      </div>
      <Row label="Precio" value={`$${product.price_clp.toLocaleString('es-CL')}`} accent="emerald" />
      <Row label="Stock" value={product.stock} accent={product.stock === 0 ? 'rose' : 'slate'} />
      <Row label="Nivel req." value={product.required_level} />
      <Row label="Acceso" value={ACCESS_LABELS[product.access]} />
      {variants.length > 0 && (
        <div className="mt-2 pt-2 border-t border-white/5">
          <div className="text-[9px] uppercase tracking-wider text-slate-500 mb-1 font-bold">
            {variants.length} variante(s)
          </div>
          <div className="space-y-1">
            {variants.slice(0, 3).map(v => (
              <div key={v.id} className="flex justify-between text-[10px]">
                <span className="text-slate-400">
                  {v.condition} {v.is_foil && '✨'} · {v.language}
                </span>
                <span className="font-mono text-violet-300">
                  ${(v.price_clp ?? product.price_clp).toLocaleString('es-CL')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function Row({ label, value, accent }) {
  const accentClass = {
    emerald: 'text-emerald-400',
    rose: 'text-rose-400',
    slate: 'text-slate-300',
  }[accent] || 'text-white';
  return (
    <div className="flex justify-between text-xs py-0.5">
      <span className="text-slate-500">{label}</span>
      <span className={clsx('font-semibold', accentClass)}>{value}</span>
    </div>
  );
}
