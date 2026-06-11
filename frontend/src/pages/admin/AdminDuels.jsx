import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, AlertTriangle, Swords, Gavel, Shield, Loader2, Check, X,
  Flag, Eye,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/Navbar';
import AuthGuard from '../../components/AuthGuard';
import { api } from '../../lib/api';

export default function AdminDuels() {
  return (
    <AuthGuard feature="el panel de disputas de duelos" returnUrl={window.location.pathname} accent="rose">
      <Inner />
    </AuthGuard>
  );
}

function Inner() {
  const [tab, setTab] = useState('disputed');
  const [disputed, setDisputed] = useState([]);
  const [flagged, setFlagged] = useState([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [coll, disp] = await Promise.all([
        api.get('/api/competitive/duels/admin/collusion-flags'),
        api.get('/api/competitive/duels/admin/disputed'),
      ]);
      setFlagged(coll.data || []);
      setDisputed(disp.data || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const resolve = async (duelId, winnerId) => {
    setResolving(duelId);
    try {
      await api.post(`/api/competitive/duels/${duelId}/resolve?winner_id=${winnerId}`);
      toast.success('Disputa resuelta');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally {
      setResolving(null);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-rose-950/15 to-slate-950 text-white">
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 pt-24 pb-16 space-y-6">
        <Link to="/admin" className="flex items-center gap-2 text-white/60 hover:text-white text-sm w-fit">
          <ArrowLeft size={16} /> Admin
        </Link>

        <div>
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-rose-300 mb-1">
            <Gavel size={14} /> Disputas & Anti-abuse
          </div>
          <h1 className="font-display text-3xl font-black">Duelos — moderación</h1>
          <p className="text-white/50 text-sm mt-1">
            Resolvé reportes incompatibles + revisá patrones sospechosos de collusion.
          </p>
        </div>

        <div className="flex gap-2 border-b border-white/10">
          {[
            { id: 'disputed', icon: AlertTriangle, label: 'Disputados', count: disputed.length },
            { id: 'collusion', icon: Flag, label: 'Collusion flags', count: flagged.length },
          ].map(t => {
            const Icon = t.icon;
            const active = tab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2 flex items-center gap-2 text-sm font-medium border-b-2 transition ${
                  active
                    ? 'border-rose-400 text-rose-200'
                    : 'border-transparent text-white/50 hover:text-white'
                }`}
              >
                <Icon size={14} /> {t.label}
                {t.count > 0 && (
                  <span className="px-1.5 py-0.5 rounded-md bg-rose-500/30 text-rose-100 text-[10px] font-bold">
                    {t.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {loading ? (
          <div className="grid place-items-center py-12"><Loader2 className="animate-spin text-rose-300" /></div>
        ) : tab === 'collusion' ? (
          <CollusionTab flagged={flagged} />
        ) : (
          <DisputedTab disputed={disputed} resolving={resolving} onResolve={resolve} />
        )}

        <div className="rounded-2xl glass p-5 text-sm text-white/60 border-l-4 border-cyan-400/50">
          <div className="font-bold text-cyan-200 mb-1 flex items-center gap-2">
            <Shield size={14} /> Cómo funciona
          </div>
          <ul className="space-y-1 text-xs leading-relaxed list-disc list-inside">
            <li><b>Disputas</b>: cuando ambos players reportan ganadores diferentes, el duel queda en <code>DISPUTED</code> hasta que un admin fuerce winner.</li>
            <li><b>Collusion flag</b>: pares con ≥5 duelos ranked en 30 días y desbalance ≥70/30. Si se confirma, podés revertir EXP manualmente.</li>
            <li><b>Trust score</b>: bajar trust score de los implicados es responsabilidad admin si confirmás abuso.</li>
          </ul>
        </div>
      </div>
    </div>
  );
}

function DisputedTab({ disputed, resolving, onResolve }) {
  if (disputed.length === 0) {
    return (
      <div className="rounded-2xl glass p-10 text-center">
        <AlertTriangle size={32} className="mx-auto text-white/30 mb-3" />
        <p className="text-white/50 text-sm">Sin duelos disputados pendientes.</p>
        <p className="text-white/30 text-xs mt-2">
          Cuando dos jugadores reportan winners distintos, aparecerán acá.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {disputed.map(d => (
        <motion.div
          key={d.duel_id}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl glass border border-rose-500/40 p-5"
        >
          <div className="flex items-center gap-2 mb-3 text-rose-300">
            <AlertTriangle size={16} className="animate-pulse" />
            <span className="font-bold uppercase tracking-wider text-sm">Duel #{d.duel_id} — disputed</span>
            {d.stake_exp > 0 && (
              <span className="ml-auto font-mono text-amber-300 text-xs">{d.stake_exp} EXP</span>
            )}
          </div>
          <div className="text-sm font-semibold mb-3">
            {d.challenger_alias} <span className="text-white/40">vs</span> {d.challenged_alias}
            {d.is_ranked && <span className="ml-2 text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-200 font-bold">RANKED</span>}
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-lg bg-bg-surface p-3">
              <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">{d.challenger_alias} reclama ganador</div>
              <div className="font-bold">{d.challenger_reported_winner_alias || '?'}</div>
            </div>
            <div className="rounded-lg bg-bg-surface p-3">
              <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">{d.challenged_alias} reclama ganador</div>
              <div className="font-bold">{d.challenged_reported_winner_alias || '?'}</div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => onResolve(d.duel_id, d.challenger_id)}
              disabled={resolving === d.duel_id}
              className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              <Check size={14} /> Gana {d.challenger_alias}
            </button>
            <button
              onClick={() => onResolve(d.duel_id, d.challenged_id)}
              disabled={resolving === d.duel_id}
              className="flex-1 px-3 py-2 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-200 text-sm font-bold disabled:opacity-40 flex items-center justify-center gap-1.5"
            >
              <Check size={14} /> Gana {d.challenged_alias}
            </button>
          </div>
        </motion.div>
      ))}
    </div>
  );
}

function CollusionTab({ flagged }) {
  if (flagged.length === 0) {
    return (
      <div className="rounded-2xl glass p-10 text-center">
        <Flag size={32} className="mx-auto text-white/30 mb-3" />
        <p className="text-white/50 text-sm">Sin flags de collusion activos.</p>
        <p className="text-white/30 text-xs mt-2">
          Pares con &gt;5 duelos ranked en 30d y desbalance &gt;70/30 aparecen acá.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {flagged.map(d => (
        <motion.div
          key={d.duel_id}
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl glass border border-amber-500/40 p-4"
        >
          <div className="flex items-center gap-2 mb-2 text-amber-300">
            <Flag size={14} />
            <span className="font-bold uppercase tracking-wider text-xs">Duel #{d.duel_id} — collusion flag</span>
            {d.stake_exp > 0 && (
              <span className="ml-auto font-mono text-amber-200 text-xs">{d.stake_exp} EXP</span>
            )}
          </div>
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Challenger</div>
              <div>Player #{d.challenger_id}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Challenged</div>
              <div>Player #{d.challenged_id}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Ganador</div>
              <div className="font-mono">Player #{d.winner_id || '?'}</div>
            </div>
          </div>
          {d.completed_at && (
            <div className="text-[10px] text-white/40 mt-2 font-mono">
              Completado {new Date(d.completed_at).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })}
            </div>
          )}
        </motion.div>
      ))}
    </div>
  );
}
