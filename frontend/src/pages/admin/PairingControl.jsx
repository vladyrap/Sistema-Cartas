import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, ArrowLeftRight, Skull, Play, Loader2, AlertTriangle, Zap } from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../../components/Navbar';
import AuthGuard from '../../components/AuthGuard';
import { api } from '../../lib/api';

export default function PairingControl() {
  return (
    <AuthGuard feature="el control de pairings del torneo" returnUrl={window.location.pathname} accent="amber">
      <Inner />
    </AuthGuard>
  );
}

const SPECIAL_MODES = [
  { value: '', label: 'Sin modo especial' },
  { value: 'GAUNTLET', label: '🜂 Gauntlet — formato rota por ronda' },
  { value: 'QUALIFIER', label: '🎫 Qualifier — clasifica a otro evento' },
  { value: 'LAST_MAN_STANDING', label: '💀 Last Man Standing — perder = drop' },
  { value: 'BOUNTY_BRACKET', label: '💰 Bounty Bracket — recompensas por kill' },
];

function Inner() {
  const { id } = useParams();
  const [event, setEvent] = useState(null);
  const [matches, setMatches] = useState([]);
  const [round, setRound] = useState(null);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [specialMode, setSpecialMode] = useState('');

  const loadSpecialMode = async () => {
    try {
      const r = await api.get(`/api/competitive/events/${id}/special-mode`);
      setSpecialMode(r.data?.mode || '');
    } catch { setSpecialMode(''); }
  };
  useEffect(() => { loadSpecialMode(); }, [id]);

  const changeSpecialMode = async (mode) => {
    try {
      if (!mode) {
        await api.delete(`/api/competitive/events/${id}/special-mode`);
        toast.success('Modo especial removido');
      } else {
        await api.post(`/api/competitive/events/${id}/special-mode`, { mode });
        toast.success(`Modo ${mode} activado`);
      }
      setSpecialMode(mode);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  const load = async () => {
    try {
      const ev = await api.get(`/api/events/${id}`);
      setEvent(ev.data);
      const spec = await api.get(`/api/tour-flow/events/${id}/spectate`);
      const cur = spec.data.current_round;
      setRound(cur);
      if (cur > 0) {
        const r = await api.get(`/api/events/${id}/rounds/${cur}/pairings`);
        setMatches(r.data || []);
      }
    } catch (e) {
      toast.error(e.response?.data?.detail || 'No se pudo cargar');
    }
  };
  useEffect(() => { load(); }, [id]);

  const togglePick = (mid) => {
    setSelected(prev => {
      if (prev.includes(mid)) return prev.filter(x => x !== mid);
      if (prev.length >= 2) return [prev[1], mid];
      return [...prev, mid];
    });
  };

  const doSwap = async () => {
    if (selected.length !== 2) return;
    setBusy(true);
    try {
      const r = await api.post(`/api/tour-admin/events/${id}/pairings/swap`, {
        match_a_id: selected[0], match_b_id: selected[1], swap_position: 'a',
      });
      toast.success(`Mesa A: ${r.data.match_a_now_has} · Mesa B: ${r.data.match_b_now_has}`);
      setSelected([]);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'No se pudo swappear');
    } finally {
      setBusy(false);
    }
  };

  const doForceBye = async (matchId) => {
    const reason = prompt('Razón para forzar bye (jugador no presente, etc.):');
    if (!reason) return;
    setBusy(true);
    try {
      const r = await api.post(`/api/tour-admin/matches/${matchId}/force-bye`, { reason });
      toast.success(`Bye forzado · sin pair: ${r.data.excluded_player_alias}`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    } finally {
      setBusy(false);
    }
  };

  const autoChain = async () => {
    const mins = prompt('Minutos del timer (default 50):', '50');
    if (mins === null) return;
    setBusy(true);
    try {
      const r = await api.post(`/api/tour-admin/events/${id}/auto-next-round`, {
        timer_minutes: parseInt(mins, 10) || 50,
      });
      toast.success(`Ronda ${r.data.round_number} creada con ${r.data.pairings_count} mesas, timer ${r.data.timer_started_minutes}min`);
      load();
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Error');
    } finally {
      setBusy(false);
    }
  };

  if (!event) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="pt-24 grid place-items-center"><Loader2 className="animate-spin" /></div>
      </div>
    );
  }

  const unreported = matches.filter(m => !m.reported_at).length;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-amber-950/15 to-slate-950 text-white">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 pt-24 pb-16 space-y-6">
        <Link to={`/admin/events/${id}`} className="flex items-center gap-2 text-white/60 hover:text-white text-sm w-fit">
          <ArrowLeft size={16} /> Manage event
        </Link>

        <div className="flex items-end justify-between flex-wrap gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-amber-300 mb-1">Pairing Control</div>
            <h1 className="text-3xl font-black">{event.name}</h1>
            <p className="text-white/50 text-sm mt-1">Ronda actual: <span className="text-white font-bold">{round ?? '–'}</span> · {unreported} sin reportar</p>
            <div className="mt-2 flex items-center gap-2">
              <Zap size={12} className="text-fuchsia-300" />
              <select
                value={specialMode}
                onChange={e => changeSpecialMode(e.target.value)}
                className="px-2 py-1 rounded-lg bg-bg-surface border border-fuchsia-400/30 text-xs text-white"
              >
                {SPECIAL_MODES.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>
          </div>
          <button
            onClick={autoChain}
            disabled={busy || unreported > 0}
            className="px-5 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 hover:from-violet-400 hover:to-fuchsia-400 text-white font-bold shadow-lg shadow-violet-500/30 disabled:opacity-40 flex items-center gap-2"
            title={unreported > 0 ? `Faltan ${unreported} reportes` : 'Cerrar ronda + abrir siguiente + arrancar timer'}
          >
            <Play size={18} /> Auto-chain siguiente ronda
          </button>
        </div>

        {selected.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl bg-amber-500/15 border border-amber-400/40 p-4 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <ArrowLeftRight className="text-amber-300" />
              <div>
                <div className="font-bold">Swap pairings</div>
                <div className="text-xs text-white/60">
                  Seleccioná 2 matches · {selected.length}/2
                </div>
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setSelected([])} className="px-3 py-1.5 rounded-lg bg-white/10 text-sm">Cancelar</button>
              <button
                onClick={doSwap}
                disabled={selected.length !== 2 || busy}
                className="px-4 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm disabled:opacity-40"
              >
                Swap player A ↔ player A
              </button>
            </div>
          </motion.div>
        )}

        <div className="rounded-3xl bg-slate-900/40 border border-white/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 flex items-center gap-2 text-sm text-white/60">
            <AlertTriangle size={14} className="text-amber-400" />
            Click en dos matches para swappear · click "force bye" para excluir player B
          </div>
          {matches.length === 0 ? (
            <div className="px-4 py-12 text-center text-white/40">
              Sin matches en la ronda actual. Iniciá la primera ronda desde Manage Event.
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {matches.map(m => {
                const picked = selected.includes(m.id);
                return (
                  <div
                    key={m.id}
                    className={`px-4 py-3 flex items-center gap-3 transition cursor-pointer ${
                      m.reported_at ? 'opacity-50 cursor-not-allowed' : ''
                    } ${picked ? 'bg-amber-500/15 ring-1 ring-amber-400/40' : 'hover:bg-white/5'}`}
                    onClick={() => !m.reported_at && togglePick(m.id)}
                  >
                    <div className="w-10 h-10 rounded-lg bg-white/5 grid place-items-center font-mono font-bold text-amber-300">
                      {m.table_number ?? '–'}
                    </div>
                    <div className="flex-1">
                      <div className="font-medium">{m.player_a_alias}</div>
                      <div className="text-xs text-white/40">
                        vs {m.is_bye ? <span className="text-cyan-300">BYE</span> : (m.player_b_alias || '?')}
                      </div>
                    </div>
                    <div className="text-xs text-white/40">
                      {m.reported_at ? `${m.games_a}-${m.games_b} reportado` : 'pendiente'}
                    </div>
                    {!m.reported_at && !m.is_bye && (
                      <button
                        onClick={(e) => { e.stopPropagation(); doForceBye(m.id); }}
                        disabled={busy}
                        className="px-2 py-1 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 text-xs flex items-center gap-1 disabled:opacity-40"
                      >
                        <Skull size={12} /> Bye
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
