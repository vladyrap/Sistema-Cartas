import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, Users, Plus, X, ArrowLeft, Check, RotateCw } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import EmptyState from '../components/EmptyState';
import { api } from '../lib/api';

export default function BrainIO() {
  const { id } = useParams();
  const [polls, setPolls] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

  const load = async () => {
    try {
      const data = await api.get(`/brain/events/${id}`).then((r) => r.data);
      setPolls(data);
    } catch {
      toast.error('No se pudo cargar');
    } finally {
      setLoading(false);
    }
  };

  // Poll cada 3s para semi-realtime sin WebSocket dedicado
  useEffect(() => {
    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [id]);

  const vote = async (pollId, optionIndex) => {
    try {
      await api.post(`/brain/${pollId}/vote`, { option_index: optionIndex });
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No pudiste votar');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-fuchsia-950/15 to-slate-950 text-white">
      <Navbar />

      <div className="max-w-3xl mx-auto px-6 py-10">
        <Link to={`/events/${id}`} className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-4">
          <ArrowLeft size={12} /> Volver al evento
        </Link>

        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <Brain size={14} className="text-fuchsia-300" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-fuchsia-300 font-bold">
              Brain.io · Mente Colectiva
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter bg-gradient-to-r from-fuchsia-200 via-white to-violet-200 bg-clip-text text-transparent">
            La gente vota. En vivo.
          </h1>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto">
            Los espectadores deciden qué carta jugaría el campeón. Las preguntas las arma el juez.
          </p>
        </div>

        <div className="flex justify-end mb-4">
          <button
            onClick={() => setShowCreate(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white text-sm font-bold transition"
          >
            <Plus size={14} /> Nueva pregunta (admin)
          </button>
        </div>

        {loading ? (
          <p className="text-center text-slate-400">Cargando…</p>
        ) : polls.length === 0 ? (
          <EmptyState
            icon={Brain}
            title="Sin preguntas activas"
            description="El juez puede crear preguntas para que la audiencia vote en vivo."
            accent="fuchsia"
          />
        ) : (
          <ul className="space-y-4">
            {polls.map((p) => <PollCard key={p.id} poll={p} onVote={(idx) => vote(p.id, idx)} />)}
          </ul>
        )}
      </div>

      <AnimatePresence>
        {showCreate && <CreatePollModal eventId={id} onClose={() => setShowCreate(false)} onDone={() => { setShowCreate(false); load(); }} />}
      </AnimatePresence>
    </div>
  );
}

function PollCard({ poll, onVote }) {
  const total = poll.total_votes || 0;
  return (
    <motion.li
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl p-5 ring-1 ${
        poll.status === 'CLOSED'
          ? 'bg-slate-800/40 ring-slate-700/60'
          : 'bg-gradient-to-br from-fuchsia-900/20 via-slate-900 to-violet-900/20 ring-fuchsia-500/30'
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <h3 className="text-lg font-black flex-1">{poll.question}</h3>
        <div className="text-xs text-slate-400 inline-flex items-center gap-1 shrink-0">
          <Users size={11} /> {total}
        </div>
      </div>

      <ul className="space-y-2">
        {poll.options.map((opt, idx) => {
          const count = poll.vote_counts[idx] || 0;
          const pct = total > 0 ? (count / total * 100) : 0;
          const mine = poll.my_vote === idx;
          const disabled = poll.status === 'CLOSED';
          return (
            <li key={idx}>
              <button
                onClick={() => !disabled && onVote(idx)}
                disabled={disabled}
                className={`relative w-full text-left rounded-lg p-3 ring-1 overflow-hidden transition ${
                  mine ? 'ring-fuchsia-400/80 bg-fuchsia-500/20' :
                  disabled ? 'ring-white/10 bg-white/[0.02] cursor-not-allowed' :
                  'ring-white/10 bg-white/[0.04] hover:ring-fuchsia-500/40'
                }`}
              >
                {/* Bar */}
                <motion.div
                  className="absolute inset-y-0 left-0 bg-gradient-to-r from-fuchsia-500/30 to-violet-500/20"
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
                <div className="relative flex justify-between items-center">
                  <span className="font-bold flex items-center gap-2">
                    {mine && <Check size={14} className="text-fuchsia-300" />}
                    {opt}
                  </span>
                  <span className="font-mono text-xs tabular-nums">
                    {count} <span className="text-slate-500">({Math.round(pct)}%)</span>
                  </span>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="mt-3 flex justify-between items-center text-[10px] uppercase tracking-widest text-slate-500 font-bold">
        <span className={poll.status === 'OPEN' ? 'text-emerald-300' : 'text-rose-300'}>
          {poll.status === 'OPEN' ? '● LIVE' : '○ Cerrada'}
        </span>
        <span className="inline-flex items-center gap-1">
          <RotateCw size={9} /> Auto-refresh 3s
        </span>
      </div>
    </motion.li>
  );
}

function CreatePollModal({ eventId, onClose, onDone }) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState(['', '']);
  const [submitting, setSubmitting] = useState(false);

  const submit = async () => {
    const opts = options.map((o) => o.trim()).filter(Boolean);
    if (!question.trim() || opts.length < 2) return toast.error('Necesitás pregunta + 2+ opciones');
    setSubmitting(true);
    try {
      await api.post('/brain/', { event_id: Number(eventId), question, options: opts });
      toast.success('Poll creado');
      onDone();
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
        initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }}
        className="w-full max-w-md rounded-2xl bg-gradient-to-br from-fuchsia-900/40 via-slate-900 to-violet-900/40 ring-2 ring-fuchsia-500/40 p-6"
      >
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-black flex items-center gap-2">
            <Brain size={18} className="text-fuchsia-300" /> Nueva pregunta
          </h2>
          <button onClick={onClose}><X size={16} /></button>
        </div>

        <input
          placeholder="¿Qué carta debería jugar?"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          className="w-full mb-3 px-3 py-2 rounded-lg bg-white/[0.05] border border-white/10"
        />

        {options.map((opt, i) => (
          <div key={i} className="flex gap-2 mb-2">
            <input
              placeholder={`Opción ${i + 1}`}
              value={opt}
              onChange={(e) => setOptions((arr) => arr.map((x, j) => j === i ? e.target.value : x))}
              className="flex-1 px-3 py-2 rounded-lg bg-white/[0.05] border border-white/10 text-sm"
            />
            {options.length > 2 && (
              <button
                onClick={() => setOptions((arr) => arr.filter((_, j) => j !== i))}
                className="text-slate-400 hover:text-rose-300"
              ><X size={14} /></button>
            )}
          </div>
        ))}
        {options.length < 6 && (
          <button
            onClick={() => setOptions([...options, ''])}
            className="text-xs text-fuchsia-300 hover:text-white mb-4 inline-flex items-center gap-1"
          >
            <Plus size={11} /> Agregar opción
          </button>
        )}

        <button
          onClick={submit}
          disabled={submitting}
          className="w-full mt-2 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white font-bold disabled:opacity-50"
        >
          {submitting ? 'Creando…' : 'Publicar'}
        </button>
      </motion.div>
    </motion.div>
  );
}
