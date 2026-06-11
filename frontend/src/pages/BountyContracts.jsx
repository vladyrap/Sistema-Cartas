import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Skull, Coins, Crown, Plus, X, Search, AlertCircle, Sparkles,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import EmptyState from '../components/EmptyState';
import { api } from '../lib/api';

export default function BountyContracts() {
  const [tab, setTab] = useState('open');
  const [open, setOpen] = useState([]);
  const [mine, setMine] = useState([]);
  const [stats, setStats] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [o, s] = await Promise.all([
        api.get('/bounty-contracts', { params: { status_filter: 'OPEN' } }).then((r) => r.data),
        api.get('/bounty-contracts/me/stats').then((r) => r.data).catch(() => null),
      ]);
      setOpen(o);
      setStats(s);
      try {
        const me = await api.get('/auth/me').then((r) => r.data);
        if (me?.profile?.id) {
          const my = await api.get('/bounty-contracts', { params: { sponsor_player_id: me.profile.id } }).then((r) => r.data);
          setMine(my);
        }
      } catch { /* sin auth, ok */ }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const cancel = async (id) => {
    try {
      await api.post(`/bounty-contracts/${id}/cancel`);
      toast.success('Contrato cancelado — EXP devuelta');
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se pudo cancelar');
    }
  };

  const list = tab === 'open' ? open : mine;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-rose-950/10 to-slate-950 text-white">
      <Navbar />

      <div className="max-w-5xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <Coins size={14} className="text-amber-300" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-amber-300 font-bold">
              Bounty Contracts · P2P
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter">
            Cabezas con precio.
          </h1>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto">
            Pon EXP de tu bolsillo como recompensa por vencer a un rival.
            Cualquiera puede cobrarla.
          </p>
        </div>

        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-6">
            <Stat label="Patrocinaste" value={stats.contracts_sponsored} accent="amber" />
            <Stat label="Vencido (vs ti)" value={stats.contracts_claimed_against_me} accent="rose" />
            <Stat label="En escrow" value={stats.exp_in_escrow.toLocaleString('es-CL')} accent="violet" small />
            <Stat label="Sobre ti" value={stats.open_contracts_on_me} accent="cyan" />
          </div>
        )}

        <div className="flex items-center justify-between mb-4">
          <div className="inline-flex rounded-xl bg-white/[0.04] border border-white/10 p-1">
            <button
              onClick={() => setTab('open')}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${
                tab === 'open' ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white' : 'text-white/60'
              }`}
            >
              Todos los abiertos ({open.length})
            </button>
            <button
              onClick={() => setTab('mine')}
              className={`px-4 py-1.5 rounded-lg text-sm font-bold transition ${
                tab === 'mine' ? 'bg-gradient-to-r from-amber-500 to-orange-500 text-white' : 'text-white/60'
              }`}
            >
              Mis contratos ({mine.length})
            </button>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-fuchsia-500 text-white text-sm font-bold hover:shadow-lg transition"
          >
            <Plus size={14} /> Nuevo bounty
          </button>
        </div>

        {loading ? (
          <p className="text-center text-slate-400 py-10">Cargando…</p>
        ) : list.length === 0 ? (
          <EmptyState
            icon={Skull}
            title={tab === 'open' ? 'No hay bounties abiertos' : 'No tenés bounties activos'}
            description={tab === 'open' ? 'Sé el primero en poner un precio.' : 'Cuando crees uno, va a aparecer acá.'}
            accent="amber"
          />
        ) : (
          <ul className="space-y-3">
            {list.map((c) => (
              <ContractRow key={c.id} c={c} isMine={tab === 'mine'} onCancel={() => cancel(c.id)} />
            ))}
          </ul>
        )}
      </div>

      <AnimatePresence>
        {showCreate && (
          <CreateModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); load(); }} />
        )}
      </AnimatePresence>
    </div>
  );
}

function Stat({ label, value, accent, small }) {
  const c = { amber: 'text-amber-300', rose: 'text-rose-300', violet: 'text-violet-300', cyan: 'text-cyan-300' }[accent];
  return (
    <div className="rounded-xl bg-white/[0.04] ring-1 ring-white/10 p-3">
      <div className={`text-[9px] uppercase tracking-widest font-bold mb-1 ${c}`}>{label}</div>
      <div className={`font-black tabular-nums ${small ? 'text-lg' : 'text-2xl'}`}>{value}</div>
    </div>
  );
}

function ContractRow({ c, isMine, onCancel }) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl bg-gradient-to-br from-amber-900/15 via-slate-900 to-rose-900/15 ring-1 ring-amber-500/20 p-4"
    >
      <div className="flex items-start gap-3">
        <div className="w-12 h-12 rounded-xl bg-rose-500/20 text-rose-300 flex items-center justify-center shrink-0">
          <Skull size={20} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-baseline gap-2">
            <Link to={`/players/${c.sponsor_player_id}`} className="font-bold text-amber-300 hover:underline">
              {c.sponsor_alias}
            </Link>
            <span className="text-slate-400 text-sm">ofrece</span>
            <span className="text-2xl font-black text-amber-200 tabular-nums">+{c.exp_offered}</span>
            <span className="text-xs uppercase tracking-widest text-amber-400 font-bold">EXP</span>
          </div>
          <div className="text-sm text-slate-300 mt-0.5">
            por vencer a{' '}
            <Link to={`/players/${c.target_player_id}`} className="font-bold text-white hover:text-rose-300 underline decoration-rose-500/40 underline-offset-2">
              {c.target_alias}
            </Link>
          </div>
          {c.message && (
            <p className="text-xs text-slate-400 italic mt-2 pl-3 border-l-2 border-rose-500/30">
              "{c.message}"
            </p>
          )}
          <div className="text-[10px] text-slate-500 font-mono mt-2">
            Status: <span className="text-amber-300">{c.status}</span>
            {c.expires_at && <> · Expira: {new Date(c.expires_at).toLocaleDateString('es-CL')}</>}
          </div>
        </div>
        {isMine && c.status === 'OPEN' && (
          <button
            onClick={onCancel}
            className="text-xs px-2 py-1 rounded bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 transition"
          >
            Cancelar
          </button>
        )}
      </div>
    </motion.li>
  );
}

function CreateModal({ onClose, onCreated }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState([]);
  const [target, setTarget] = useState(null);
  const [exp, setExp] = useState(200);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (target || search.trim().length < 2) { setResults([]); return; }
    const t = setTimeout(() => {
      api.get('/players', { params: { search, limit: 8 } })
        .then((r) => setResults(r.data?.items || r.data || []))
        .catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [search, target]);

  const submit = async () => {
    if (!target) return toast.error('Elegí un rival');
    setSubmitting(true);
    try {
      await api.post('/bounty-contracts', {
        target_player_id: target.id,
        exp_offered: Number(exp),
        message: message || null,
        expires_in_days: 7,
      });
      toast.success('Bounty creado');
      onCreated();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Falló');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
    >
      <motion.div
        onClick={(e) => e.stopPropagation()}
        initial={{ scale: 0.9, y: 30 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9 }}
        className="w-full max-w-md rounded-2xl bg-gradient-to-br from-slate-900 to-amber-950/30 ring-1 ring-amber-500/30 p-6"
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black flex items-center gap-2">
            <Coins size={18} className="text-amber-300" /> Nuevo bounty
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        {!target ? (
          <>
            <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Rival</label>
            <div className="relative mb-3">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por alias…"
                className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/[0.05] border border-white/10 text-sm"
              />
            </div>
            {results.length > 0 && (
              <ul className="mb-3 space-y-1 max-h-48 overflow-y-auto">
                {results.map((p) => (
                  <li key={p.id}>
                    <button
                      onClick={() => setTarget(p)}
                      className="w-full text-left px-3 py-2 rounded hover:bg-white/[0.05] transition"
                    >
                      <span className="text-sm font-bold">{p.alias}</span>
                      <span className="text-xs text-slate-500 ml-2">{p.elite_id_code}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        ) : (
          <div className="mb-4 p-3 rounded-xl bg-rose-500/10 ring-1 ring-rose-500/30 flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-widest text-rose-300 font-bold">Target</div>
              <div className="font-bold">{target.alias}</div>
            </div>
            <button onClick={() => setTarget(null)} className="text-xs text-slate-400 hover:text-white">
              Cambiar
            </button>
          </div>
        )}

        <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">EXP a ofrecer</label>
        <div className="mb-3 flex items-center gap-2">
          <input
            type="number" min={50} max={5000} step={50}
            value={exp}
            onChange={(e) => setExp(e.target.value)}
            className="flex-1 px-3 py-2 rounded-lg bg-white/[0.05] border border-white/10 text-sm tabular-nums"
          />
          <div className="text-[10px] text-slate-400">50–5000</div>
        </div>

        <label className="block text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">Mensaje (opcional)</label>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Por qué le pones precio…"
          maxLength={280}
          rows={2}
          className="w-full px-3 py-2 rounded-lg bg-white/[0.05] border border-white/10 text-sm resize-none mb-4"
        />

        <div className="flex items-start gap-2 mb-4 text-[10px] text-amber-200/80 bg-amber-500/10 ring-1 ring-amber-500/30 rounded p-2">
          <AlertCircle size={12} className="shrink-0 mt-0.5" />
          <span>La EXP se debita de tu temporada actual al crear el contrato. Si lo cancelás, se devuelve.</span>
        </div>

        <button
          onClick={submit}
          disabled={submitting || !target}
          className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold text-sm disabled:opacity-50 transition"
        >
          {submitting ? 'Creando…' : `Crear bounty (-${exp} EXP)`}
        </button>
      </motion.div>
    </motion.div>
  );
}
