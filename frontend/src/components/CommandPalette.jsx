/** Command Palette estilo Linear/Raycast. Cmd+K abre. Búsqueda FTS instantánea
 * cross-recursos + acciones globales (navegación, settings, logout).
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, ArrowRight, Loader2, User, Package, Layers, Gamepad2,
  Home, Calendar, ShoppingBag, Trophy, Compass, LogOut, Sparkles, Settings,
} from 'lucide-react';
import { api } from '../lib/api';

const STATIC_ACTIONS = [
  { id: 'goto-dashboard', kind: 'action', icon: Home,        title: 'Ir al Dashboard',         path: '/dashboard' },
  { id: 'goto-events',    kind: 'action', icon: Calendar,    title: 'Ver eventos',             path: '/events' },
  { id: 'goto-catalog',   kind: 'action', icon: ShoppingBag, title: 'Abrir catálogo',          path: '/catalog' },
  { id: 'goto-decks',     kind: 'action', icon: Layers,      title: 'Mis decks',               path: '/decks' },
  { id: 'goto-ruta',      kind: 'action', icon: Compass,     title: 'Ruta del Campeón',        path: '/ruta' },
  { id: 'goto-profile',   kind: 'action', icon: Sparkles,    title: 'Perfil Premium',          path: '/profile/premium' },
  { id: 'goto-ranking',   kind: 'action', icon: Trophy,      title: 'Ranking',                 path: '/ranking' },
  { id: 'goto-leaderboard', kind: 'action', icon: Trophy,    title: 'Leaderboard Glicko',      path: '/leaderboard' },
  { id: 'goto-store',     kind: 'action', icon: ShoppingBag, title: 'Tienda 3D',               path: '/catalog/premium' },
  { id: 'goto-settings',  kind: 'action', icon: Settings,    title: 'Configuración (Profile)', path: '/profile' },
  { id: 'logout',         kind: 'action', icon: LogOut,      title: 'Cerrar sesión',           danger: true },
];

const KIND_META = {
  player:  { icon: User,      label: 'Jugador',  path: (id) => `/players/${id}` },
  deck:    { icon: Layers,    label: 'Deck',     path: (id) => `/decks/${id}/builder` },
  product: { icon: Package,   label: 'Producto', path: () => `/catalog` },
  game:    { icon: Gamepad2,  label: 'Juego',    path: () => `/games` },
};

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hits, setHits] = useState([]);
  const [loading, setLoading] = useState(false);
  const [hoverIdx, setHoverIdx] = useState(0);
  const inputRef = useRef(null);
  const debounceRef = useRef(null);
  const navigate = useNavigate();

  // Cmd+K / Ctrl+K
  useEffect(() => {
    function onKey(e) {
      const isToggle = (e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey);
      if (isToggle) {
        e.preventDefault();
        setOpen(o => !o);
      } else if (e.key === 'Escape') {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Foco al abrir
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQ('');
      setHits([]);
      setHoverIdx(0);
    }
  }, [open]);

  // Búsqueda FTS5 con debounce.
  useEffect(() => {
    if (!open) return;
    clearTimeout(debounceRef.current);
    if (q.length < 2) { setHits([]); return; }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const r = await api.get('/search', { params: { q, limit: 12 } });
        setHits(r.data || []);
        setHoverIdx(0);
      } catch { setHits([]); }
      finally { setLoading(false); }
    }, 200);
    return () => clearTimeout(debounceRef.current);
  }, [q, open]);

  // Lista combinada: acciones filtradas por q + hits FTS
  const actionsFiltered = q.length < 2
    ? STATIC_ACTIONS
    : STATIC_ACTIONS.filter(a => a.title.toLowerCase().includes(q.toLowerCase()));
  const items = [
    ...actionsFiltered.map(a => ({ ...a, _key: a.id })),
    ...hits.map(h => ({ ...h, kind: h.kind, _key: `${h.kind}-${h.ref_id}` })),
  ];

  function execute(item) {
    if (item.id === 'logout') {
      localStorage.removeItem('ec_access_token');
      navigate('/login');
    } else if (item.kind === 'action') {
      navigate(item.path);
    } else {
      const meta = KIND_META[item.kind];
      if (meta) navigate(meta.path(item.ref_id));
    }
    setOpen(false);
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHoverIdx(i => Math.min(i + 1, items.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHoverIdx(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && items[hoverIdx]) { e.preventDefault(); execute(items[hoverIdx]); }
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center pt-[18vh] px-4"
          onClick={() => setOpen(false)}
        >
          <motion.div
            initial={{ scale: 0.95, y: -10 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.95, y: -10 }}
            transition={{ type: 'spring', damping: 22, stiffness: 350 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-xl rounded-2xl bg-slate-900/95 border border-violet-500/20 shadow-2xl overflow-hidden"
          >
            {/* Header con input */}
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
              <Search size={16} className="text-slate-500 shrink-0" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Buscar jugadores, decks, productos o navegar…"
                className="flex-1 bg-transparent outline-none text-sm placeholder:text-slate-500"
              />
              {loading ? (
                <Loader2 size={14} className="text-violet-400 animate-spin" />
              ) : (
                <kbd className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-slate-400 font-mono">
                  ESC
                </kbd>
              )}
            </div>

            {/* Resultados */}
            <div className="max-h-[60vh] overflow-auto py-1">
              {items.length === 0 ? (
                <div className="px-4 py-12 text-center text-sm text-slate-500">
                  {q.length < 2 ? 'Empezá a tipear para buscar…' : 'Sin resultados'}
                </div>
              ) : (
                <>
                  {/* Group: acciones */}
                  {actionsFiltered.length > 0 && (
                    <Group label="Navegar">
                      {actionsFiltered.map((a, i) => (
                        <Row
                          key={a._key}
                          item={a}
                          active={hoverIdx === i}
                          onClick={() => execute(a)}
                          onHover={() => setHoverIdx(i)}
                        />
                      ))}
                    </Group>
                  )}
                  {/* Group: FTS */}
                  {hits.length > 0 && (
                    <Group label="Resultados">
                      {hits.map((h, i) => {
                        const idx = actionsFiltered.length + i;
                        return (
                          <Row
                            key={`${h.kind}-${h.ref_id}`}
                            item={h}
                            active={hoverIdx === idx}
                            onClick={() => execute(h)}
                            onHover={() => setHoverIdx(idx)}
                          />
                        );
                      })}
                    </Group>
                  )}
                </>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 border-t border-white/5 flex items-center justify-between text-[10px] text-slate-500">
              <div className="flex items-center gap-3">
                <span><kbd className="bg-white/5 px-1 rounded">↑↓</kbd> navegar</span>
                <span><kbd className="bg-white/5 px-1 rounded">↵</kbd> abrir</span>
              </div>
              <span>
                <kbd className="bg-white/5 px-1 rounded">{navigator.platform.includes('Mac') ? '⌘' : 'Ctrl'}K</kbd> alternar
              </span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function Group({ label, children }) {
  return (
    <div className="py-1">
      <div className="px-4 py-1 text-[9px] uppercase tracking-widest font-bold text-slate-600">
        {label}
      </div>
      {children}
    </div>
  );
}

function Row({ item, active, onClick, onHover }) {
  const isAction = item.kind === 'action';
  const Icon = isAction ? item.icon : KIND_META[item.kind]?.icon || Search;
  const label = isAction ? item.title : item.title;
  const sub = isAction ? null : KIND_META[item.kind]?.label;

  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={onHover}
      className={`w-full flex items-center gap-3 px-4 py-2 text-sm text-left transition ${
        active ? 'bg-violet-500/15 text-white' : 'text-slate-300 hover:bg-white/5'
      } ${item.danger ? 'text-rose-300' : ''}`}
    >
      <Icon size={14} className={item.danger ? 'text-rose-400' : 'text-violet-400'} />
      <div className="flex-1 min-w-0">
        <div className="truncate font-medium" dangerouslySetInnerHTML={item.snippet
          ? { __html: item.snippet }
          : undefined}>
          {item.snippet ? null : label}
        </div>
        {sub && <div className="text-[10px] text-slate-500">{sub}</div>}
      </div>
      {active && <ArrowRight size={12} className="text-violet-400" />}
    </button>
  );
}
