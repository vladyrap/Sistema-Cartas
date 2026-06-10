import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Crown, Target, Skull, Zap, Trophy, ArrowRight } from 'lucide-react';
import Navbar from '../components/Navbar';
import EmptyState from '../components/EmptyState';
import { api } from '../lib/api';

export default function Bounty() {
  const [bounty, setBounty] = useState(null);
  const [feed, setFeed] = useState([]);
  const [mine, setMine] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/bounty/current').then((r) => r.data).catch(() => null),
      api.get('/bounty/feed').then((r) => r.data).catch(() => []),
      api.get('/bounty/me').then((r) => r.data).catch(() => null),
    ]).then(([b, f, m]) => {
      setBounty(b);
      setFeed(f);
      setMine(m);
      setLoading(false);
    });
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="max-w-5xl mx-auto px-6 py-20 text-center text-slate-400">Cargando bounty…</div>
      </div>
    );
  }

  if (!bounty || !bounty.player_id) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <EmptyState
          icon={Target}
          title="No hay bounty activo"
          description="Cuando la temporada tenga al menos un jugador con EXP, su cabeza tendrá precio."
          accent="rose"
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-rose-950/20 to-slate-950 text-white">
      <Navbar />

      <div className="max-w-5xl mx-auto px-6 py-10 sm:py-14">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 mb-3">
            <Skull size={14} className="text-rose-400" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-rose-300 font-bold">
              Bounty del Campeón · {bounty.season_name}
            </span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tighter bg-gradient-to-r from-amber-200 via-rose-300 to-rose-500 bg-clip-text text-transparent">
            Cabeza con precio.
          </h1>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto">
            El líder del ranking tiene la cabeza marcada. Vencelo en evento oficial y ganás{' '}
            <span className="text-amber-300 font-bold">+{bounty.bounty_exp} EXP</span> bonus + título{' '}
            <span className="text-rose-300 font-bold">"Regicida del Mes"</span>.
          </p>
        </div>

        {/* Champion card */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative rounded-3xl bg-gradient-to-br from-amber-700/40 via-rose-700/30 to-rose-950/60 ring-2 ring-amber-500/40 p-8 sm:p-10 overflow-hidden mb-10 shadow-2xl shadow-amber-500/20"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(245,193,108,0.3),transparent_60%)] pointer-events-none" />
          <div className="absolute -top-10 -right-10 w-72 h-72 rounded-full bg-amber-500/20 blur-3xl pointer-events-none" />

          <div className="relative flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar */}
            <div className="relative shrink-0">
              <div className="w-32 h-32 sm:w-40 sm:h-40 rounded-2xl bg-gradient-to-br from-amber-500 to-rose-600 ring-4 ring-amber-400/50 flex items-center justify-center overflow-hidden">
                {bounty.avatar_url ? (
                  <img src={bounty.avatar_url} alt={bounty.alias} className="w-full h-full object-cover" />
                ) : (
                  <Crown size={64} className="text-white drop-shadow-lg" />
                )}
              </div>
              <div className="absolute -bottom-2 -right-2 w-12 h-12 rounded-full bg-gradient-to-br from-rose-500 to-rose-700 ring-2 ring-rose-300 flex items-center justify-center">
                <Target size={20} className="text-white" />
              </div>
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 text-center sm:text-left">
              <div className="text-[10px] uppercase tracking-[0.4em] text-amber-300 font-bold mb-1">
                #1 ranking · {bounty.is_me ? 'TÚ' : 'Objetivo'}
              </div>
              <h2 className="text-4xl sm:text-5xl font-black text-white mb-1 break-words">
                {bounty.alias}
              </h2>
              <div className="text-xs font-mono text-amber-200/80 mb-4">
                {bounty.elite_id}
              </div>
              <div className="flex flex-wrap gap-3 justify-center sm:justify-start">
                <div className="px-4 py-2 rounded-xl bg-black/40 ring-1 ring-amber-500/30">
                  <div className="text-[10px] uppercase tracking-widest text-amber-300 font-bold">EXP Total</div>
                  <div className="text-2xl font-black text-white tabular-nums">{bounty.exp_total.toLocaleString('es-CL')}</div>
                </div>
                <div className="px-4 py-2 rounded-xl bg-black/40 ring-1 ring-rose-500/40">
                  <div className="text-[10px] uppercase tracking-widest text-rose-300 font-bold">Recompensa</div>
                  <div className="text-2xl font-black text-rose-200 tabular-nums">+{bounty.bounty_exp}</div>
                </div>
              </div>

              {bounty.is_me && (
                <div className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-amber-500/20 ring-1 ring-amber-400/40 text-amber-200 text-sm">
                  <Crown size={14} /> Sos vos. Cuidate la espalda.
                </div>
              )}
              {!bounty.is_me && (
                <Link
                  to={`/players/${bounty.player_id}`}
                  className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-rose-500 to-rose-700 text-white text-sm font-bold hover:shadow-lg hover:shadow-rose-500/30 transition"
                >
                  Ver perfil del objetivo <ArrowRight size={14} />
                </Link>
              )}
            </div>
          </div>
        </motion.div>

        {/* Tus stats + feed */}
        <div className="grid md:grid-cols-3 gap-5">
          <div className="md:col-span-1 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-5">
            <div className="text-[10px] uppercase tracking-widest text-violet-300 font-bold mb-3 flex items-center gap-1.5">
              <Trophy size={11} /> Tu historial
            </div>
            <Stat label="Total regicidios" value={mine?.total_kills ?? 0} />
            <Stat label="Esta temporada" value={mine?.season_kills ?? 0} accent="amber" />
            <Stat label="EXP bounty acumulada" value={(mine?.total_bounty_exp ?? 0).toLocaleString('es-CL')} accent="emerald" />
          </div>

          <div className="md:col-span-2 rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-5">
            <div className="text-[10px] uppercase tracking-widest text-rose-300 font-bold mb-3 flex items-center gap-1.5">
              <Skull size={11} /> Wall of regicidas
            </div>
            {feed.length === 0 ? (
              <p className="text-sm text-slate-400 italic py-8 text-center">
                Nadie ha derrocado al campeón todavía. ¿Serás el primero?
              </p>
            ) : (
              <ul className="space-y-2">
                {feed.map((k, i) => (
                  <li key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-white/[0.03] transition">
                    <div className="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-300 flex items-center justify-center shrink-0">
                      <Skull size={14} />
                    </div>
                    <div className="flex-1 min-w-0 text-sm">
                      <span className="font-bold text-white">{k.killer_alias}</span>{' '}
                      <span className="text-slate-400">venció a</span>{' '}
                      <span className="font-bold text-amber-300">{k.victim_alias}</span>
                    </div>
                    <div className="text-xs text-emerald-300 font-mono shrink-0">+{k.exp_awarded}</div>
                    <div className="text-[10px] text-slate-500 shrink-0 hidden sm:inline">
                      {new Date(k.occurred_at).toLocaleDateString('es-CL')}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, accent = 'violet' }) {
  const c = { violet: 'text-violet-300', amber: 'text-amber-300', emerald: 'text-emerald-300', rose: 'text-rose-300' }[accent] || 'text-violet-300';
  return (
    <div className="mb-3 last:mb-0">
      <div className="text-xs text-slate-400 mb-0.5">{label}</div>
      <div className={`text-3xl font-black tabular-nums ${c}`}>{value}</div>
    </div>
  );
}
