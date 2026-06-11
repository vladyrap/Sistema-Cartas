import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Atom, Sparkles, Plus, Zap, Trash2, RotateCw, Hash, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import EmptyState from '../components/EmptyState';
import AuthGuard from '../components/AuthGuard';
import { api } from '../lib/api';

export default function QuantumDeck() {
  return (
    <AuthGuard feature="Quantum Deck" returnUrl="/quantum" accent="cyan">
      <QuantumDeckContent />
    </AuthGuard>
  );
}

function QuantumDeckContent() {
  const [decks, setDecks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [collapsing, setCollapsing] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/quantum/me').then((r) => r.data);
      setDecks(data);
    } catch {
      toast.error('No se pudo cargar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const del = async (id) => {
    if (!confirm('¿Borrar este Quantum Deck?')) return;
    await api.delete(`/quantum/${id}`).catch(() => {});
    load();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-cyan-950/20 to-slate-950 text-white">
      <Navbar />

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <Atom size={14} className="text-cyan-300" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-cyan-300 font-bold">
              Quantum Deck · Schrödinger Cards
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter bg-gradient-to-r from-cyan-200 via-violet-200 to-fuchsia-200 bg-clip-text text-transparent">
            60 cartas potenciales. 40 reales al colapso.
          </h1>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto">
            Definí un <span className="text-cyan-300 font-bold">pool cuántico</span>. Al iniciar el match,
            ambos jugadores comparten un <span className="text-violet-300 font-bold">seed</span> que colapsa
            tu pool a un deck final determinístico. Nadie sabe qué cartas tendrás hasta ese instante.
          </p>
        </div>

        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-500 text-white text-sm font-bold transition"
          >
            <Plus size={14} /> Nuevo Quantum Deck
          </button>
        </div>

        {loading ? (
          <p className="text-center text-slate-400">Cargando…</p>
        ) : decks.length === 0 ? (
          <EmptyState
            icon={Atom}
            title="Sin quantum decks"
            description="Crea uno con tu pool de 60+ cartas. Lo colapsás cada match."
            accent="cyan"
          />
        ) : (
          <ul className="space-y-3">
            {decks.map((d) => (
              <QuantumRow key={d.id} d={d} onCollapse={() => setCollapsing(d)} onDelete={() => del(d.id)} />
            ))}
          </ul>
        )}
      </div>

      <AnimatePresence>
        {showCreate && <CreateModal onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); load(); }} />}
        {collapsing && <CollapseModal d={collapsing} onClose={() => setCollapsing(null)} onDone={load} />}
      </AnimatePresence>
    </div>
  );
}

function QuantumRow({ d, onCollapse, onDelete }) {
  return (
    <li className="rounded-2xl bg-gradient-to-br from-cyan-900/20 via-slate-900 to-violet-900/20 ring-1 ring-cyan-500/30 p-5">
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-cyan-500/20 text-cyan-300 flex items-center justify-center shrink-0">
          <Atom size={22} />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-lg font-black truncate">{d.name}</h3>
          <div className="text-xs text-slate-400 mt-0.5">
            Pool: <span className="text-cyan-300 font-mono">{d.pool_unique_cards}</span> cartas únicas
            ({<span className="text-cyan-300 font-mono">{d.pool_total_cards}</span>} total) · Target:{' '}
            <span className="text-violet-300 font-mono">{d.target_size}</span>
          </div>
          {d.seed_used && (
            <div className="text-[10px] text-slate-500 mt-1 font-mono inline-flex items-center gap-1">
              <Hash size={9} /> Último seed: {d.seed_used.slice(0, 40)}
            </div>
          )}
          {d.last_collapse_result && (
            <details className="mt-2">
              <summary className="text-xs text-cyan-300 cursor-pointer hover:text-cyan-200">
                Ver último colapso ({d.last_collapse_result.length} cartas)
              </summary>
              <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-3 text-xs">
                {d.last_collapse_result.map((c, i) => (
                  <div key={i} className="flex justify-between py-0.5 border-b border-white/5">
                    <span className="truncate">{c.name}</span>
                    <span className="text-cyan-300 font-mono">×{c.qty}</span>
                  </div>
                ))}
              </div>
            </details>
          )}
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <button
            onClick={onCollapse}
            className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-xs font-bold inline-flex items-center gap-1.5 transition"
          >
            <Zap size={12} /> Colapsar
          </button>
          <button
            onClick={onDelete}
            className="text-xs text-slate-500 hover:text-rose-300 inline-flex items-center justify-center gap-1 py-1"
          >
            <Trash2 size={11} /> Borrar
          </button>
        </div>
      </div>
    </li>
  );
}

function CreateModal({ onClose, onDone }) {
  const [name, setName] = useState('');
  const [pool, setPool] = useState('');
  const [target, setTarget] = useState(40);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    if (!name.trim() || pool.trim().length < 10) {
      return toast.error('Faltan datos');
    }
    setSubmitting(true);
    try {
      await api.post('/quantum/', { name, pool_text: pool, target_size: Number(target) });
      toast.success('Quantum Deck creado');
      onDone();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Falló');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalBg onClose={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-gradient-to-br from-cyan-900/40 via-slate-900 to-violet-900/40 ring-2 ring-cyan-500/40 p-6">
        <h2 className="text-xl font-black mb-4 flex items-center gap-2">
          <Atom size={18} className="text-cyan-300" /> Nuevo Quantum Deck
        </h2>
        <input
          placeholder="Nombre del deck"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full mb-3 px-3 py-2 rounded-lg bg-white/[0.05] border border-white/10"
        />
        <textarea
          placeholder={'Pool (1 carta por línea):\n4 Lightning Bolt\n4 Counterspell\n…'}
          value={pool}
          onChange={(e) => setPool(e.target.value)}
          rows={8}
          className="w-full mb-3 px-3 py-2 rounded-lg bg-white/[0.05] border border-white/10 font-mono text-xs resize-none"
        />
        <div className="flex items-center gap-2 mb-4">
          <label className="text-[10px] uppercase tracking-widest text-slate-400 font-bold">Target</label>
          <input
            type="number" min={20} max={80} value={target}
            onChange={(e) => setTarget(e.target.value)}
            className="px-3 py-2 rounded-lg bg-white/[0.05] border border-white/10 w-20 tabular-nums"
          />
        </div>
        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 py-2 rounded-lg bg-white/[0.05] hover:bg-white/10 text-sm">Cancelar</button>
          <button
            onClick={submit}
            disabled={submitting}
            className="flex-1 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-violet-500 text-white font-bold text-sm disabled:opacity-50"
          >
            {submitting ? 'Creando…' : 'Crear'}
          </button>
        </div>
      </div>
    </ModalBg>
  );
}

function CollapseModal({ d, onClose, onDone }) {
  const [seed, setSeed] = useState('');
  const [result, setResult] = useState(null);
  const [collapsing, setCollapsing] = useState(false);

  const collapse = async () => {
    if (!seed.trim()) return toast.error('Necesitás un seed');
    setCollapsing(true);
    setResult(null);
    try {
      // Animación de "colapso cuántico" 1.5s
      const promise = api.post(`/quantum/${d.id}/collapse`, { seed }).then((r) => r.data);
      await new Promise((r) => setTimeout(r, 1200));
      const data = await promise;
      setResult(data);
      onDone();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Falló');
    } finally {
      setCollapsing(false);
    }
  };

  const suggestSeed = () => {
    setSeed(`${new Date().toISOString().slice(0, 10)}-match-${Math.floor(Math.random() * 9999)}`);
  };

  return (
    <ModalBg onClose={onClose}>
      <div className="w-full max-w-lg rounded-2xl bg-gradient-to-br from-violet-900/40 via-slate-900 to-cyan-900/40 ring-2 ring-violet-500/40 p-6">
        <h2 className="text-xl font-black mb-1 flex items-center gap-2">
          <Zap size={18} className="text-violet-300" /> Colapsar {d.name}
        </h2>
        <p className="text-xs text-slate-400 mb-4">
          Ambos jugadores deben usar el mismo seed para reproducibilidad. Sugerencia: fecha + match_id.
        </p>

        {!result ? (
          <>
            <input
              placeholder="seed (ej: 2026-06-10-match-42)"
              value={seed}
              onChange={(e) => setSeed(e.target.value)}
              className="w-full mb-2 px-3 py-2 rounded-lg bg-white/[0.05] border border-white/10 font-mono text-sm"
            />
            <button
              onClick={suggestSeed}
              className="text-[10px] text-violet-300 hover:text-white mb-4 inline-flex items-center gap-1"
            >
              <RotateCw size={9} /> sugerir seed
            </button>
            <button
              onClick={collapse}
              disabled={collapsing}
              className="w-full py-3 rounded-xl bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-500 text-white font-black uppercase tracking-widest disabled:opacity-50 inline-flex items-center justify-center gap-2"
            >
              {collapsing ? <><motion.div animate={{ rotate: 360 }} transition={{ duration: 0.6, repeat: Infinity, ease: 'linear' }}><Atom size={16} /></motion.div> Colapsando…</> : <><Zap size={16} /> Ejecutar colapso</>}
            </button>
          </>
        ) : (
          <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
            <div className="mb-3 text-center">
              <Sparkles size={32} className="mx-auto text-cyan-300 mb-2" />
              <div className="text-cyan-300 font-bold">¡Colapso ejecutado!</div>
              <div className="text-xs text-slate-400 mt-1 font-mono">seed: {result.seed}</div>
              <div className="text-xs text-slate-400">{result.actual_size} cartas finales</div>
            </div>
            <div className="bg-black/30 rounded-lg p-3 max-h-72 overflow-y-auto">
              {result.cards.map((c, i) => (
                <div key={i} className="flex justify-between text-sm py-1 border-b border-white/5 last:border-b-0">
                  <span>{c.name}</span>
                  <span className="text-cyan-300 font-mono tabular-nums">×{c.qty}</span>
                </div>
              ))}
            </div>
            <button
              onClick={() => { navigator.clipboard?.writeText(result.cards.map((c) => `${c.qty} ${c.name}`).join('\n')); toast.success('Lista copiada'); }}
              className="w-full mt-3 py-2 rounded-lg bg-white/[0.05] hover:bg-white/10 text-sm"
            >
              Copiar decklist
            </button>
          </motion.div>
        )}
      </div>
    </ModalBg>
  );
}

function ModalBg({ children, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div onClick={(e) => e.stopPropagation()} initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}>
        {children}
      </motion.div>
    </motion.div>
  );
}
