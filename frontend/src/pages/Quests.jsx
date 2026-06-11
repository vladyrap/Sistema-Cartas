import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Scroll, Crown, Check, Lock, Sparkles, ChevronRight, ArrowLeft } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import EmptyState from '../components/EmptyState';
import { api } from '../lib/api';

export default function Quests() {
  const [arcs, setArcs] = useState([]);
  const [selectedArc, setSelectedArc] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const data = await api.get('/quests/arcs').then((r) => r.data);
      setArcs(data);
      if (selectedArc) {
        setSelectedArc(data.find((a) => a.id === selectedArc.id) || null);
      }
    } catch {
      toast.error('No se pudo cargar');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const claim = async (step) => {
    try {
      await api.post(`/quests/steps/${step.id}/claim`);
      toast.success(`+${step.reward_exp} EXP`);
      load();
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'No se puede claim aún');
    }
  };

  if (selectedArc) {
    return <ArcDetail arc={selectedArc} onBack={() => setSelectedArc(null)} onClaim={claim} />;
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-amber-950/15 to-black text-white">
      <Navbar />

      <div className="max-w-4xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <Scroll size={14} className="text-amber-300" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-amber-300 font-bold">
              Apprentice Quests
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter">
            Aventuras narrativas.
          </h1>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto">
            NPCs te encargan misiones. Cumplilas en eventos reales y reclamá la EXP.
          </p>
        </div>

        {loading ? (
          <p className="text-center text-slate-400">Cargando crónicas…</p>
        ) : arcs.length === 0 ? (
          <EmptyState icon={Scroll} title="Sin sagas activas" description="Pronto vendrán nuevas misiones." accent="amber" />
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {arcs.map((a) => <ArcCard key={a.id} arc={a} onClick={() => setSelectedArc(a)} />)}
          </div>
        )}
      </div>
    </div>
  );
}

function ArcCard({ arc, onClick }) {
  const pct = arc.total_steps > 0 ? (arc.completed_steps / arc.total_steps * 100) : 0;
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -3 }}
      className={`text-left rounded-2xl p-5 ring-1 transition ${
        arc.is_completed
          ? 'bg-amber-500/10 ring-amber-500/40 hover:ring-amber-400/60'
          : 'bg-white/[0.04] ring-white/10 hover:ring-amber-500/30'
      }`}
    >
      <div className="text-[10px] uppercase tracking-widest text-amber-300 font-bold mb-1 flex items-center gap-1">
        {arc.is_completed && <Crown size={11} />}
        {arc.npc_name} · {arc.npc_role || 'NPC'}
      </div>
      <h3 className="text-xl font-black mb-2">{arc.title}</h3>
      <p className="text-sm text-slate-400 mb-3 line-clamp-2">{arc.synopsis}</p>

      <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden mb-2">
        <div className="h-full bg-gradient-to-r from-amber-500 to-orange-400" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{arc.completed_steps} / {arc.total_steps} pasos</span>
        <span className="text-amber-300 font-bold">+{arc.reward_exp} EXP final</span>
      </div>
    </motion.button>
  );
}

function ArcDetail({ arc, onBack, onClaim }) {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-amber-950/20 to-black text-white">
      <Navbar />

      <div className="max-w-3xl mx-auto px-6 py-10">
        <button onClick={onBack} className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-4">
          <ArrowLeft size={12} /> Volver a sagas
        </button>

        <div className="rounded-2xl bg-gradient-to-br from-amber-900/30 via-slate-900 to-amber-950/30 ring-1 ring-amber-500/30 p-6 mb-6">
          <div className="text-[10px] uppercase tracking-widest text-amber-300 font-bold mb-1">
            {arc.npc_name} · {arc.npc_role}
          </div>
          <h1 className="text-3xl sm:text-4xl font-black mb-3">{arc.title}</h1>
          <p className="text-slate-300 italic leading-relaxed">{arc.intro_narration}</p>
        </div>

        <ol className="space-y-3">
          {arc.steps.map((step, i) => {
            const prevDone = i === 0 || arc.steps[i - 1].is_completed;
            return <StepCard key={step.id} step={step} index={i} locked={!prevDone && !step.is_completed} onClaim={onClaim} />;
          })}
        </ol>

        {arc.is_completed && (
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="mt-6 rounded-2xl bg-gradient-to-br from-amber-500/20 to-orange-500/20 ring-2 ring-amber-400/60 p-6"
          >
            <Crown size={32} className="mx-auto text-amber-300 mb-2" />
            <p className="text-center text-amber-100 italic leading-relaxed mb-3">{arc.outro_narration}</p>
            <div className="text-center text-amber-200 font-black">
              +{arc.reward_exp} EXP por completar la saga
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function StepCard({ step, index, locked, onClaim }) {
  return (
    <motion.li
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: locked ? 0.4 : 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className={`rounded-xl p-4 ring-1 ${
        step.is_completed
          ? 'bg-emerald-500/10 ring-emerald-500/40'
          : locked
          ? 'bg-white/[0.02] ring-white/10'
          : 'bg-amber-500/10 ring-amber-500/40'
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`w-9 h-9 rounded-lg flex items-center justify-center font-black shrink-0 ${
          step.is_completed ? 'bg-emerald-500/30 text-emerald-200' :
          locked ? 'bg-slate-700 text-slate-500' :
          'bg-amber-500/30 text-amber-200'
        }`}>
          {step.is_completed ? <Check size={16} /> : locked ? <Lock size={14} /> : step.step_number}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold mb-1">{step.title}</div>
          <p className="text-xs text-slate-400 italic mb-2">{step.narration}</p>
          <div className="text-[10px] text-slate-500 font-mono">
            {step.requirement_kind} · target {step.requirement_target} · +{step.reward_exp} EXP
          </div>
        </div>
        {!step.is_completed && !locked && (
          <button
            onClick={() => onClaim(step)}
            className="px-3 py-1.5 rounded-lg bg-amber-500/30 hover:bg-amber-500/50 text-amber-100 text-xs font-bold uppercase tracking-widest shrink-0"
          >
            Claim
          </button>
        )}
      </div>
    </motion.li>
  );
}
