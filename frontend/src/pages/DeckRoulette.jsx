import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Dices, Trophy, Check, X, RotateCw, ArrowRight, History } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import EmptyState from '../components/EmptyState';
import AuthGuard from '../components/AuthGuard';
import { api } from '../lib/api';

export default function DeckRoulette() {
  return (
    <AuthGuard feature="Deck Roulette" returnUrl="/deck-roulette" accent="fuchsia">
      <DeckRouletteContent />
    </AuthGuard>
  );
}

function DeckRouletteContent() {
  const [list, setList] = useState([]);
  const [active, setActive] = useState(null);
  const [spinning, setSpinning] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/deck-roulette/me').then((r) => r.data);
      setList(data);
      setActive(data.find((a) => !a.completed_at) || null);
    } catch {
      toast.error('No se pudo cargar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const spin = async () => {
    setSpinning(true);
    try {
      const { data } = await api.post('/deck-roulette/spin', { target_rounds: 5 });
      // Animación de "girando" 1.6s antes de mostrar resultado
      setTimeout(() => {
        setActive(data);
        load();
        setSpinning(false);
      }, 1600);
    } catch (err) {
      setSpinning(false);
      toast.error(err?.response?.data?.detail || 'No se pudo girar');
    }
  };

  const record = async (result) => {
    if (!active) return;
    try {
      const { data } = await api.post(`/deck-roulette/${active.id}/record`, { result });
      setActive(data);
      if (data.completed_at) {
        if (data.polyglot_awarded) {
          toast.success(`¡Polyglot desbloqueado! +300 EXP`);
        } else {
          toast(`Tanda completada · ${data.wins}W ${data.losses}L`);
        }
      }
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Falló');
    }
  };

  const cancel = async () => {
    if (!active) return;
    if (!confirm('¿Cancelar esta tanda? No vas a poder reclamar Polyglot.')) return;
    await api.post(`/deck-roulette/${active.id}/cancel`).catch(() => {});
    load();
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-fuchsia-950/20 to-slate-950 text-white">
      <Navbar />

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <Dices size={14} className="text-fuchsia-300" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-fuchsia-300 font-bold">
              Deck Roulette
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter">
            Olvidate de tu mono-red.
          </h1>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto">
            Gira la ruleta, recibí un archetype al azar del top metagame, jugá 5 rondas con él.
            Win rate &gt; 50% = título <span className="text-fuchsia-300 font-bold">Polyglot</span> + 300 EXP.
          </p>
        </div>

        {/* Active assignment OR spin button */}
        {active ? (
          <ActiveTanda
            active={active}
            onRecord={record}
            onCancel={cancel}
          />
        ) : (
          <SpinButton spin={spin} spinning={spinning} />
        )}

        {/* History */}
        {list.length > 0 && (
          <div className="mt-10">
            <h2 className="text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-3 flex items-center gap-1.5">
              <History size={11} /> Historial
            </h2>
            <ul className="space-y-2">
              {list.filter((a) => a.completed_at).map((a) => (
                <HistoryRow key={a.id} a={a} />
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

function SpinButton({ spin, spinning }) {
  return (
    <div className="text-center">
      <motion.div
        animate={spinning ? { rotate: 1080 } : { rotate: 0 }}
        transition={{ duration: 1.6, ease: [0.17, 0.84, 0.31, 0.99] }}
        className="inline-block mb-6"
      >
        <Dices size={88} className="text-fuchsia-300 drop-shadow-[0_0_30px_rgba(232,121,249,0.5)]" />
      </motion.div>
      <div>
        <button
          onClick={spin}
          disabled={spinning}
          className="px-8 py-4 rounded-2xl bg-gradient-to-r from-fuchsia-500 via-violet-500 to-rose-500 text-white text-lg font-black uppercase tracking-widest hover:shadow-2xl hover:shadow-fuchsia-500/40 transition disabled:opacity-50 inline-flex items-center gap-2"
        >
          {spinning ? <><RotateCw className="animate-spin" size={20} /> Girando…</> : <><Dices size={20} /> Girar la ruleta</>}
        </button>
      </div>
      <p className="mt-4 text-xs text-slate-500">3 spins por día máximo</p>
    </div>
  );
}

function ActiveTanda({ active, onRecord, onCancel }) {
  const total = active.wins + active.losses + active.draws;
  const wr = total > 0 ? (active.wins / total * 100) : 0;
  const remaining = Math.max(0, active.target_rounds - total);
  const isDone = !!active.completed_at;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
      className="rounded-3xl bg-gradient-to-br from-fuchsia-700/20 via-violet-800/20 to-rose-800/20 ring-2 ring-fuchsia-500/30 p-8"
    >
      <div className="text-center mb-6">
        <div className="text-[10px] uppercase tracking-widest text-fuchsia-300 font-bold mb-1">
          Tu mazo asignado
        </div>
        <h2 className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-fuchsia-200 via-white to-violet-200 bg-clip-text text-transparent">
          {active.archetype}
        </h2>
        {active.game_name && <p className="text-xs text-slate-400 mt-1">{active.game_name}</p>}
      </div>

      {/* Score */}
      <div className="grid grid-cols-4 gap-2 mb-6">
        <Score label="Wins" value={active.wins} accent="emerald" />
        <Score label="Losses" value={active.losses} accent="rose" />
        <Score label="Draws" value={active.draws} accent="slate" />
        <Score label="Win Rate" value={`${wr.toFixed(0)}%`} accent="amber" />
      </div>

      {/* Progress to polyglot */}
      <div className="mb-6">
        <div className="flex justify-between text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-2">
          <span>Progreso</span>
          <span>{total} / {active.target_rounds}</span>
        </div>
        <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-fuchsia-500 via-violet-400 to-amber-300"
            animate={{ width: `${(total / active.target_rounds) * 100}%` }}
            transition={{ duration: 0.4 }}
          />
        </div>
        {!isDone && remaining > 0 && (
          <p className="text-xs text-slate-400 mt-2 text-center">
            {remaining} ronda{remaining !== 1 ? 's' : ''} más para terminar la tanda
          </p>
        )}
      </div>

      {isDone ? (
        <div className={`text-center p-5 rounded-2xl ${
          active.polyglot_awarded
            ? 'bg-amber-500/15 ring-1 ring-amber-500/40'
            : 'bg-white/[0.04] ring-1 ring-white/10'
        }`}>
          {active.polyglot_awarded ? (
            <>
              <Trophy size={36} className="mx-auto text-amber-300 mb-2" />
              <div className="text-amber-200 font-black text-lg">¡Título Polyglot desbloqueado!</div>
              <div className="text-xs text-amber-200/80 mt-1">+300 EXP acreditados</div>
            </>
          ) : (
            <>
              <div className="text-slate-300 text-sm">
                Tanda completada. Win rate &lt;= 50% → sin Polyglot esta vez.
              </div>
              <div className="text-xs text-slate-500 mt-1">Probá de nuevo mañana.</div>
            </>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => onRecord('win')}
            className="py-3 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 font-bold inline-flex items-center justify-center gap-2 transition"
          >
            <Check size={16} /> Win
          </button>
          <button
            onClick={() => onRecord('draw')}
            className="py-3 rounded-xl bg-slate-500/20 hover:bg-slate-500/30 text-slate-200 font-bold transition"
          >
            Draw
          </button>
          <button
            onClick={() => onRecord('loss')}
            className="py-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-bold inline-flex items-center justify-center gap-2 transition"
          >
            <X size={16} /> Loss
          </button>
        </div>
      )}

      {!isDone && (
        <button onClick={onCancel} className="block mx-auto mt-4 text-xs text-slate-500 hover:text-rose-300 transition">
          Cancelar tanda
        </button>
      )}
    </motion.div>
  );
}

function Score({ label, value, accent }) {
  const c = { emerald: 'text-emerald-300', rose: 'text-rose-300', slate: 'text-slate-300', amber: 'text-amber-300' }[accent];
  return (
    <div className="rounded-xl bg-black/30 p-3 text-center">
      <div className={`text-[9px] uppercase tracking-widest font-bold mb-1 ${c}`}>{label}</div>
      <div className="text-2xl font-black tabular-nums">{value}</div>
    </div>
  );
}

function HistoryRow({ a }) {
  const total = a.wins + a.losses + a.draws;
  const wr = total > 0 ? (a.wins / total * 100).toFixed(0) : 0;
  return (
    <li className="flex items-center gap-3 px-3 py-2 rounded-lg bg-white/[0.03] ring-1 ring-white/5">
      <div className="w-8 h-8 rounded-lg bg-fuchsia-500/20 text-fuchsia-300 flex items-center justify-center shrink-0">
        <Dices size={14} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-bold truncate">{a.archetype}</div>
        <div className="text-xs text-slate-500">
          {a.wins}W {a.losses}L {a.draws}D · {wr}% WR
        </div>
      </div>
      {a.polyglot_awarded ? (
        <Trophy size={14} className="text-amber-300 shrink-0" />
      ) : (
        <div className="text-[10px] text-slate-600 shrink-0">—</div>
      )}
    </li>
  );
}
