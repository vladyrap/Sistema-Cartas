import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Trophy, Swords, Users as UsersIcon, BarChart3, TrendingUp, Shield,
  Sparkles, Zap, Snowflake, Crown, ChevronRight, Plus, Send, Award,
  Loader2, X, Check, Activity,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import AuthGuard from '../components/AuthGuard';
import { api } from '../lib/api';

export default function Competitive() {
  return (
    <AuthGuard feature="el Competitive Hub" returnUrl={window.location.pathname} accent="violet">
      <Inner />
    </AuthGuard>
  );
}

const TABS = [
  { id: 'ladder',    icon: Trophy,      label: 'Ladder',       color: 'amber' },
  { id: 'duels',     icon: Swords,      label: 'Duelos',       color: 'rose' },
  { id: 'sparring',  icon: Activity,    label: 'Sparring',     color: 'cyan' },
  { id: 'drafts',    icon: UsersIcon,   label: 'Drafts',       color: 'indigo' },
  { id: 'meta',      icon: BarChart3,   label: 'Meta',         color: 'violet' },
  { id: 'guildwars', icon: Shield,      label: 'Guild Wars',   color: 'emerald' },
  { id: 'sponsors',  icon: Award,       label: 'Sponsors',     color: 'fuchsia' },
];

function Inner() {
  const [tab, setTab] = useState('ladder');
  const [games, setGames] = useState([]);

  useEffect(() => {
    api.get('/api/games').then(r => setGames(r.data || [])).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-violet-950/15 to-slate-950 text-white">
      <Navbar />
      <div className="max-w-7xl mx-auto px-4 pt-24 pb-16">
        <motion.header
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl glass aurora-bg grain p-6 mb-6 overflow-hidden relative"
        >
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-violet-300 mb-1">
            <Sparkles size={14} /> Competitive Hub
          </div>
          <h1 className="font-display text-3xl md:text-5xl font-black">
            <span className="text-gradient">Locura</span> competitiva
          </h1>
          <p className="text-white/60 text-sm mt-2 max-w-2xl">
            Ladder con divisiones · Duelos directos con stakes · Sparring queue · Guild wars · Meta tracker · Sponsors. Todo en un solo lugar.
          </p>
        </motion.header>

        <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar">
          {TABS.map(t => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium whitespace-nowrap transition border ${
                  active
                    ? `bg-${t.color}-500/25 border-${t.color}-400/50 text-${t.color}-100`
                    : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                }`}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {tab === 'ladder' && <LadderTab games={games} />}
          {tab === 'duels' && <DuelsTab games={games} />}
          {tab === 'sparring' && <SparringTab games={games} />}
          {tab === 'drafts' && <DraftsTab />}
          {tab === 'meta' && <MetaTab games={games} />}
          {tab === 'guildwars' && <GuildWarsTab />}
          {tab === 'sponsors' && <SponsorsTab />}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// LADDER + TIERS + FREEZE
// ═══════════════════════════════════════════════════════════

function LadderTab({ games }) {
  const [gameId, setGameId] = useState(games[0]?.id || '');
  const [data, setData] = useState(null);
  const [promo, setPromo] = useState(null);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (games.length && !gameId) setGameId(games[0].id); }, [games]);

  const load = async () => {
    if (!gameId) return;
    setLoading(true);
    try {
      const r = await api.get(`/api/competitive/ladder/${gameId}`);
      setData(r.data);
      const m = await api.get('/players/me').catch(() => ({ data: null }));
      setMe(m.data?.player);
      if (m.data?.player) {
        try {
          const p = await api.get(`/api/competitive/players/${m.data.player.id}/promotion-status?game_id=${gameId}`);
          setPromo(p.data);
        } catch { setPromo(null); }
      }
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [gameId]);

  const freeze = async (days) => {
    try {
      await api.post(`/api/competitive/ladder/freeze?game_id=${gameId}&days=${days}`);
      toast.success(`Rating congelado ${days} días`);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al congelar');
    }
  };

  return (
    <motion.div key="ladder" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <Trophy size={18} className="text-amber-300" /> Ladder por divisiones
          </h2>
          <p className="text-white/50 text-xs mt-1">Bronce → Grandmaster, basado en Glicko-2. Sin matches en 14d → decay.</p>
        </div>
        <div className="flex gap-2">
          <select
            value={gameId} onChange={e => setGameId(parseInt(e.target.value, 10))}
            className="px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm"
          >
            {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button
            onClick={() => freeze(7)}
            className="px-3 py-2 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-400/30 text-cyan-200 text-xs flex items-center gap-1.5"
            title="Pausar decay 7 días"
          >
            <Snowflake size={12} /> Freeze 7d
          </button>
        </div>
      </div>

      {promo && (
        <PromoSeriesWidget promo={promo} />
      )}

      {loading ? <CenterSpinner /> : !data ? <EmptyHint icon={Trophy} text="Sin ladder todavía" /> : (
        <div className="space-y-4">
          {data.tiers.filter(t => t.players.length > 0).map(t => (
            <div key={t.tier.key} className="rounded-2xl glass overflow-hidden">
              <div className={`px-4 py-3 flex items-center justify-between bg-${t.tier.color}-500/10 border-b border-${t.tier.color}-400/30`}>
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{t.tier.emoji}</span>
                  <div>
                    <div className={`font-display font-black text-${t.tier.color}-200`}>{t.tier.label}</div>
                    <div className="text-[10px] text-white/40 font-mono">{t.tier.min_rating} - {t.tier.max_rating}</div>
                  </div>
                </div>
                <span className="text-xs text-white/50 font-mono">{t.players.length} jugadores</span>
              </div>
              <div className="divide-y divide-white/5">
                {t.players.slice(0, 10).map((p, i) => (
                  <motion.div
                    key={p.player_id} initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.02 }}
                    className="px-4 py-2.5 flex items-center gap-4"
                  >
                    <div className="w-8 text-center font-mono text-white/40 text-sm">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <Link to={`/players/${p.player_id}`} className="font-semibold hover:text-violet-200 truncate block">
                        {p.alias}
                      </Link>
                      <div className="text-[10px] text-white/40 font-mono">{p.matches_played} matches · peak {p.peak_rating}</div>
                    </div>
                    {p.is_frozen && <Snowflake size={12} className="text-cyan-300" title="Frozen" />}
                    <div className="font-mono font-bold text-amber-300 shrink-0">{p.rating}</div>
                    <div className="w-20 shrink-0">
                      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                        <div className={`h-full bg-${t.tier.color}-400`} style={{ width: `${(p.tier_progress * 100).toFixed(0)}%` }} />
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// DUELS
// ═══════════════════════════════════════════════════════════

function DuelsTab({ games }) {
  const [duels, setDuels] = useState([]);
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(false);
  const [reportModal, setReportModal] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [r, m] = await Promise.all([
        api.get('/api/competitive/duels/inbox'),
        api.get('/players/me').catch(() => ({ data: null })),
      ]);
      setDuels(r.data || []);
      setMe(m.data?.player);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const respond = async (id, action) => {
    try {
      await api.post(`/api/competitive/duels/${id}/${action}`);
      toast.success(action === 'accept' ? 'Aceptado' : 'Declinado');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };

  return (
    <motion.div key="duels" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <Swords size={18} className="text-rose-300" /> Duelos 1v1
          </h2>
          <p className="text-white/50 text-xs mt-1">Desafiá a alguien con stakes EXP. Ranked o casual.</p>
        </div>
        <button
          onClick={() => setOpenModal(true)}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-rose-500 to-orange-500 text-white font-bold shadow-lg shadow-rose-500/30 flex items-center gap-2 text-sm"
        >
          <Plus size={14} /> Nuevo desafío
        </button>
      </div>
      {loading ? <CenterSpinner /> : duels.length === 0 ? (
        <EmptyHint icon={Swords} text="Sin duelos en tu inbox." />
      ) : (
        <div className="space-y-3">
          {duels.map(d => {
            const iAmReceiver = me && d.challenged_id === me.id;
            const iAmChallenger = me && d.challenger_id === me.id;
            const iReported = (iAmChallenger && d.challenger_reported_at)
                            || (iAmReceiver && d.challenged_reported_at);
            const otherReported = (iAmChallenger && d.challenged_reported_at)
                                || (iAmReceiver && d.challenger_reported_at);
            const collusion = d.collusion_flag;

            return (
              <motion.div key={d.id} layout
                className={`rounded-2xl glass border p-4 ${
                  d.is_disputed ? 'border-rose-500/60 shadow-lg shadow-rose-500/20' :
                  collusion ? 'border-amber-500/60' :
                  'border-rose-400/20'
                }`}
              >
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                        d.status === 'PENDING' ? 'bg-amber-500/20 text-amber-300' :
                        d.status === 'ACCEPTED' ? 'bg-emerald-500/20 text-emerald-300' :
                        d.status === 'COMPLETED' ? 'bg-violet-500/20 text-violet-300' :
                        'bg-white/5 text-white/40'
                      }`}>{d.status}</span>
                      {d.is_ranked && <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-200 font-bold">RANKED</span>}
                      {d.stake_exp > 0 && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 font-mono font-bold">{d.stake_exp} EXP</span>}
                      {d.is_disputed && <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/40 text-rose-100 font-bold animate-pulse">⚠ DISPUTED</span>}
                      {collusion && !d.is_disputed && <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/40 text-amber-100 font-bold">⚠ FLAG</span>}
                    </div>
                    <div className="font-semibold">
                      {d.challenger_alias} <span className="text-white/40">vs</span> {d.challenged_alias}
                    </div>
                    {d.message && <p className="text-xs text-white/50 mt-1 italic">"{d.message}"</p>}

                    {d.status === 'ACCEPTED' && (iReported || otherReported) && !d.is_disputed && (
                      <div className="text-xs text-white/60 mt-2 flex items-center gap-2">
                        <span className={iReported ? 'text-emerald-300' : 'text-white/40'}>
                          {iReported ? '✓ Vos reportaste' : '○ Vos no reportaste'}
                        </span>
                        <span className="text-white/30">·</span>
                        <span className={otherReported ? 'text-emerald-300' : 'text-amber-300'}>
                          {otherReported ? '✓ Rival reportó' : '⏱ Esperando rival'}
                        </span>
                      </div>
                    )}

                    {d.is_disputed && (
                      <div className="text-xs text-rose-300 mt-2 font-mono bg-rose-500/10 px-2 py-1.5 rounded-lg">
                        Reportes no coinciden — esperando admin
                      </div>
                    )}

                    {d.status === 'COMPLETED' && (
                      <div className="text-xs text-emerald-300 mt-1 font-mono">
                        Ganador: {d.winner_id === d.challenger_id ? d.challenger_alias : d.challenged_alias} ({d.games_challenger}-{d.games_challenged})
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    {d.status === 'PENDING' && iAmReceiver && (
                      <>
                        <button onClick={() => respond(d.id, 'accept')} className="px-3 py-1.5 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center gap-1">
                          <Check size={12} /> Aceptar
                        </button>
                        <button onClick={() => respond(d.id, 'decline')} className="px-3 py-1.5 rounded-lg bg-rose-500/15 hover:bg-rose-500/30 text-rose-300 text-xs font-bold flex items-center gap-1">
                          <X size={12} /> Declinar
                        </button>
                      </>
                    )}
                    {d.status === 'ACCEPTED' && !iReported && !d.is_disputed && (
                      <button
                        onClick={() => setReportModal(d)}
                        className="px-3 py-1.5 rounded-lg bg-violet-500 hover:bg-violet-400 text-white text-xs font-bold flex items-center gap-1"
                      >
                        <Send size={12} /> Reportar resultado
                      </button>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}
      <AnimatePresence>
        {openModal && (
          <DuelModal games={games} onClose={() => setOpenModal(false)} onCreated={() => { setOpenModal(false); load(); }} />
        )}
        {reportModal && (
          <ReportDuelModal duel={reportModal} onClose={() => setReportModal(null)} onSent={() => { setReportModal(null); load(); }} />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function ReportDuelModal({ duel, onClose, onSent }) {
  const [winnerId, setWinnerId] = useState('');
  const [gc, setGc] = useState(2);
  const [gd, setGd] = useState(0);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!winnerId) { toast.error('Elegí ganador'); return; }
    setSaving(true);
    try {
      const r = await api.post(`/api/competitive/duels/${duel.id}/report`, {
        winner_id: parseInt(winnerId, 10),
        games_challenger: gc,
        games_challenged: gd,
      });
      if (r.data.status === 'COMPLETED') toast.success('Match completado ✓');
      else if (r.data.status === 'PENDING_OPPONENT') toast('Esperando que tu rival también reporte', { icon: '⏱' });
      else if (r.data.status === 'DISPUTED') toast.error('Reportes no coinciden — admin resolverá');
      onSent();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    } finally { setSaving(false); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={e => e.stopPropagation()}
        className="bg-bg-elevated border border-violet-400/30 rounded-2xl max-w-md w-full p-5">
        <h3 className="font-display font-bold text-xl mb-1">Reportar resultado</h3>
        <p className="text-white/50 text-xs mb-4">Ambos jugadores deben reportar. Si coinciden, se aplica EXP + Glicko.</p>

        <label className="text-xs uppercase tracking-wider text-white/50 font-bold mb-1.5 block">Ganador</label>
        <div className="grid grid-cols-2 gap-2 mb-4">
          {[
            { id: duel.challenger_id, alias: duel.challenger_alias },
            { id: duel.challenged_id, alias: duel.challenged_alias },
          ].map(p => (
            <button
              key={p.id}
              onClick={() => setWinnerId(String(p.id))}
              className={`px-3 py-2.5 rounded-lg text-sm font-bold transition ${
                winnerId === String(p.id)
                  ? 'bg-violet-500 text-white ring-2 ring-violet-300'
                  : 'bg-white/5 text-white/70 hover:bg-white/10'
              }`}
            >
              {p.alias}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <div>
            <label className="text-xs uppercase tracking-wider text-white/50 font-bold mb-1.5 block">{duel.challenger_alias}</label>
            <input type="number" min="0" max="5" value={gc} onChange={e => setGc(parseInt(e.target.value, 10) || 0)}
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-center font-mono text-lg" />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wider text-white/50 font-bold mb-1.5 block">{duel.challenged_alias}</label>
            <input type="number" min="0" max="5" value={gd} onChange={e => setGd(parseInt(e.target.value, 10) || 0)}
              className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-center font-mono text-lg" />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm">Cancelar</button>
          <button onClick={submit} disabled={saving || !winnerId}
            className="px-5 py-2 rounded-lg bg-violet-500 hover:bg-violet-400 text-white font-bold disabled:opacity-40 text-sm">
            {saving ? 'Enviando…' : 'Reportar'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

function DuelModal({ games, onClose, onCreated }) {
  const [form, setForm] = useState({ challenged_id: '', game_id: games[0]?.id || '', stake_exp: 0, is_ranked: false, message: '' });
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!form.challenged_id || !form.game_id) { toast.error('Falta jugador o juego'); return; }
    setSaving(true);
    try {
      await api.post('/api/competitive/duels', { ...form, challenged_id: parseInt(form.challenged_id, 10), game_id: parseInt(form.game_id, 10) });
      toast.success('Desafío enviado');
      onCreated();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); } finally { setSaving(false); }
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={e => e.stopPropagation()}
        className="bg-bg-elevated border border-rose-400/30 rounded-2xl max-w-md w-full p-5">
        <h3 className="font-display font-bold text-xl mb-1">Nuevo desafío</h3>
        <p className="text-white/50 text-xs mb-4">Stake EXP se descuenta al crear y se devuelve si declinan.</p>
        <label className="text-xs uppercase tracking-wider text-white/50 font-bold mb-1.5 block">Player ID (rival)</label>
        <input value={form.challenged_id} onChange={e => setForm({ ...form, challenged_id: e.target.value })} type="number"
          className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-white mb-3" />
        <label className="text-xs uppercase tracking-wider text-white/50 font-bold mb-1.5 block">Juego</label>
        <select value={form.game_id} onChange={e => setForm({ ...form, game_id: e.target.value })}
          className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-white mb-3">
          {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <label className="text-xs uppercase tracking-wider text-white/50 font-bold mb-1.5 block">Stake: {form.stake_exp} EXP</label>
        <input type="range" min="0" max="2000" step="50" value={form.stake_exp} onChange={e => setForm({ ...form, stake_exp: parseInt(e.target.value, 10) })}
          className="w-full accent-rose-400 mb-3" />
        <label className="flex items-center gap-2 mb-3 cursor-pointer">
          <input type="checkbox" checked={form.is_ranked} onChange={e => setForm({ ...form, is_ranked: e.target.checked })} className="accent-rose-400" />
          <span className="text-sm">Ranked (impacta Glicko)</span>
        </label>
        <textarea value={form.message} onChange={e => setForm({ ...form, message: e.target.value })} placeholder="Mensaje opcional…"
          rows={2} maxLength={300}
          className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-white text-sm resize-none mb-4" />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm">Cancelar</button>
          <button onClick={submit} disabled={saving} className="px-5 py-2 rounded-lg bg-gradient-to-r from-rose-500 to-orange-500 text-white font-bold disabled:opacity-40 text-sm">
            {saving ? 'Enviando…' : 'Desafiar'}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// SPARRING QUEUE
// ═══════════════════════════════════════════════════════════

function SparringTab({ games }) {
  const [queue, setQueue] = useState(null);
  const [gameId, setGameId] = useState('');
  useEffect(() => { if (games[0]) setGameId(games[0].id); }, [games]);
  const load = async () => {
    try {
      const r = await api.get(`/api/competitive/sparring/queue${gameId ? `?game_id=${gameId}` : ''}`);
      setQueue(r.data);
    } catch {}
  };
  useEffect(() => { load(); const t = setInterval(load, 8000); return () => clearInterval(t); }, [gameId]);

  const join = async () => {
    try {
      await api.post('/api/competitive/sparring/join', { game_id: parseInt(gameId, 10) });
      toast.success('En cola — el matcher corre cada 30s');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };

  return (
    <motion.div key="sparring" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <Activity size={18} className="text-cyan-300" /> Sparring Queue
          </h2>
          <p className="text-white/50 text-xs mt-1">Cola de matchmaking casual — el matcher corre cada 30s.</p>
        </div>
        <div className="flex gap-2">
          <select value={gameId} onChange={e => setGameId(parseInt(e.target.value, 10))}
            className="px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm">
            {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button onClick={join} className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm">
            Entrar en cola
          </button>
        </div>
      </div>

      {queue?.my_match && (
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
          className="rounded-2xl glass border-2 border-emerald-400/40 p-5">
          <div className="flex items-center gap-2 text-emerald-300 mb-2">
            <Sparkles size={16} /> <span className="font-bold uppercase tracking-wider text-sm">Match encontrado</span>
          </div>
          <div className="font-display font-black text-2xl">Vs. {queue.my_match.partner_alias}</div>
          <p className="text-white/50 text-xs mt-1">
            Emparejado {new Date(queue.my_match.matched_at).toLocaleTimeString('es-CL', { timeStyle: 'short' })} hrs · Buscáte el rival en sala.
          </p>
        </motion.div>
      )}

      <div className="rounded-2xl glass overflow-hidden">
        <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
          <span className="text-xs uppercase tracking-wider text-cyan-300 font-bold">Cola actual</span>
          <span className="text-xs text-white/40 font-mono">{queue?.total_waiting || 0} esperando</span>
        </div>
        <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
          {(queue?.waiting || []).map(w => (
            <div key={w.id} className="px-4 py-2.5 flex items-center gap-3">
              <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <div className="flex-1">
                <div className="font-semibold text-sm">{w.alias}</div>
                {w.archetype && <div className="text-[10px] text-white/40">{w.archetype}</div>}
              </div>
              <span className="text-[10px] text-white/40 font-mono">{new Date(w.joined_at).toLocaleTimeString('es-CL', { timeStyle: 'short' })}</span>
            </div>
          ))}
          {!queue?.waiting?.length && <div className="px-4 py-8 text-center text-white/40 text-sm">Nadie en cola</div>}
        </div>
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// META TRACKER
// ═══════════════════════════════════════════════════════════

function MetaTab({ games }) {
  const [meta, setMeta] = useState(null);
  const [gameId, setGameId] = useState('');
  const [days, setDays] = useState(30);
  const [loading, setLoading] = useState(false);
  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/api/competitive/meta/snapshot${gameId ? `?game_id=${gameId}&` : '?'}days=${days}`);
      setMeta(r.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [gameId, days]);
  return (
    <motion.div key="meta" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <BarChart3 size={18} className="text-violet-300" /> Meta Tracker
          </h2>
          <p className="text-white/50 text-xs mt-1">Win-rate por archetype + matchup matrix.</p>
        </div>
        <div className="flex gap-2">
          <select value={gameId} onChange={e => setGameId(e.target.value)} className="px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm">
            <option value="">Todos</option>
            {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <select value={days} onChange={e => setDays(parseInt(e.target.value, 10))} className="px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm">
            <option value={7}>7d</option><option value={30}>30d</option><option value={90}>90d</option>
          </select>
        </div>
      </div>
      {loading ? <CenterSpinner /> : !meta ? null : (
        <div className="grid lg:grid-cols-2 gap-4">
          <div className="rounded-2xl glass overflow-hidden">
            <div className="px-4 py-3 bg-violet-500/10 border-b border-violet-400/30">
              <div className="text-xs uppercase tracking-wider text-violet-200 font-bold">Archetypes ({meta.total_matches} matches)</div>
            </div>
            <div className="divide-y divide-white/5">
              {meta.archetypes.slice(0, 15).map(a => (
                <div key={a.name} className="px-4 py-3">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-semibold text-sm truncate">{a.name}</span>
                    <span className="font-mono text-xs">
                      <span className={a.win_rate >= 0.55 ? 'text-emerald-300' : a.win_rate <= 0.45 ? 'text-rose-300' : 'text-white/60'}>
                        {(a.win_rate * 100).toFixed(0)}%
                      </span>
                      {' '}<span className="text-white/40">· {a.share_pct}%</span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500" style={{ width: `${a.share_pct}%` }} />
                  </div>
                </div>
              ))}
              {!meta.archetypes.length && <div className="px-4 py-8 text-center text-white/40 text-sm">Sin data</div>}
            </div>
          </div>
          <div className="rounded-2xl glass overflow-hidden">
            <div className="px-4 py-3 bg-violet-500/10 border-b border-violet-400/30">
              <div className="text-xs uppercase tracking-wider text-violet-200 font-bold">Matchup Matrix</div>
            </div>
            <div className="divide-y divide-white/5 max-h-96 overflow-y-auto text-sm">
              {meta.matchups.slice(0, 20).map((m, i) => (
                <div key={i} className="px-4 py-2 flex items-center justify-between gap-2">
                  <span className="truncate flex-1 text-xs">
                    <span className={m.a_winrate >= 0.55 ? 'text-emerald-300' : 'text-white'}>{m.a}</span>
                    <span className="text-white/40 mx-1">vs</span>
                    <span className="truncate">{m.b}</span>
                  </span>
                  <span className="font-mono text-xs text-white/60 shrink-0">{m.a_wins}-{m.b_wins}{m.draws > 0 ? `-${m.draws}` : ''}</span>
                </div>
              ))}
              {!meta.matchups.length && <div className="px-4 py-8 text-center text-white/40 text-sm">Sin matchups</div>}
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// GUILD WARS
// ═══════════════════════════════════════════════════════════

function GuildWarsTab() {
  const [wars, setWars] = useState([]);
  useEffect(() => { api.get('/api/competitive/guild-wars/active').then(r => setWars(r.data || [])).catch(() => {}); }, []);
  return (
    <motion.div key="gw" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <h2 className="font-display text-xl font-bold flex items-center gap-2 mb-4">
        <Shield size={18} className="text-emerald-300" /> Guild Wars activas
      </h2>
      {wars.length === 0 ? <EmptyHint icon={Shield} text="Sin wars activas. Guild admins pueden proponer una." /> : (
        <div className="space-y-3">
          {wars.map(w => (
            <div key={w.id} className="rounded-2xl glass p-5">
              <div className="grid grid-cols-3 items-center gap-3">
                <div className="text-right">
                  <div className="font-display font-bold text-lg truncate">{w.guild_a_name}</div>
                  <div className="font-mono text-4xl font-black text-emerald-300">{w.score_a}</div>
                </div>
                <div className="text-center text-white/30 font-bold uppercase tracking-widest text-xs">VS</div>
                <div>
                  <div className="font-display font-bold text-lg truncate">{w.guild_b_name}</div>
                  <div className="font-mono text-4xl font-black text-rose-300">{w.score_b}</div>
                </div>
              </div>
              <div className="text-center mt-3 text-xs text-white/40">
                Hasta {new Date(w.ends_at).toLocaleDateString('es-CL', { dateStyle: 'medium' })}
              </div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// SPONSORS
// ═══════════════════════════════════════════════════════════

function SponsorsTab() {
  const [sponsors, setSponsors] = useState([]);
  useEffect(() => { api.get('/api/competitive/sponsors').then(r => setSponsors(r.data || [])).catch(() => {}); }, []);
  return (
    <motion.div key="sp" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <h2 className="font-display text-xl font-bold flex items-center gap-2 mb-4">
        <Award size={18} className="text-fuchsia-300" /> Sponsors registrados
      </h2>
      {sponsors.length === 0 ? <EmptyHint icon={Award} text="Sin sponsors todavía. Admin puede registrar uno." /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {sponsors.map(s => (
            <div key={s.id} className="rounded-2xl glass border border-fuchsia-400/20 p-4">
              {s.logo_url ? <img src={s.logo_url} alt={s.name} className="h-16 object-contain mb-3" />
                          : <div className="h-16 grid place-items-center text-fuchsia-300/40"><Award size={32} /></div>}
              <h3 className="font-display font-bold">{s.name}</h3>
              {s.description && <p className="text-xs text-white/50 mt-1 line-clamp-2">{s.description}</p>}
              <div className="mt-2 text-[10px] text-fuchsia-300 font-mono">{s.total_paid_exp.toLocaleString()} EXP pagados</div>
            </div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// TEAM DRAFTS — snake pick room
// ═══════════════════════════════════════════════════════════

function DraftsTab() {
  const [drafts, setDrafts] = useState([]);
  const [active, setActive] = useState(null);  // draft abierto en sala
  const [me, setMe] = useState(null);
  const [openCreate, setOpenCreate] = useState(false);
  const [pool, setPool] = useState([]);

  const load = async () => {
    try {
      const [d, m, t] = await Promise.all([
        api.get('/api/competitive/drafts'),
        api.get('/players/me').catch(() => ({ data: null })),
        api.get('/api/competitive/tier-list?limit=100').catch(() => ({ data: [] })),
      ]);
      setDrafts(d.data || []);
      setMe(m.data?.player);
      setPool(t.data || []);
      // refrescar la sala activa si está abierta
      if (active) {
        const fresh = (d.data || []).find(x => x.id === active.id);
        if (fresh) setActive(fresh);
      }
    } catch {}
  };
  useEffect(() => { load(); const t = setInterval(load, 6000); return () => clearInterval(t); }, []);

  const start = async (id) => {
    try {
      const r = await api.post(`/api/competitive/drafts/${id}/start`);
      setActive(r.data);
      toast.success('Draft iniciado — picks abiertos');
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };

  const pick = async (draftId, playerId) => {
    try {
      const r = await api.post(`/api/competitive/drafts/${draftId}/pick`, { player_id: playerId });
      setActive(r.data);
      if (r.data.status === 'LOCKED') toast.success('Draft completo — equipos locked 🔒');
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };

  if (active) {
    const pickedIds = new Set([
      active.captain_a_id, active.captain_b_id,
      ...active.picks.map(p => p.player_id),
    ]);
    const available = pool.filter(p => !pickedIds.has(p.player_id));
    const myTurn = me && active.current_pick_captain_id === me.id;

    return (
      <motion.div key="draft-room" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
        <button onClick={() => setActive(null)} className="text-sm text-white/60 hover:text-white">
          ← Volver a la lista
        </button>
        <div className="flex items-center justify-between flex-wrap gap-2">
          <h2 className="font-display text-2xl font-black">{active.title}</h2>
          <span className={`text-xs px-3 py-1 rounded-full font-bold ${
            active.status === 'PICKING' ? 'bg-indigo-500/30 text-indigo-200 animate-pulse' :
            active.status === 'LOCKED' ? 'bg-emerald-500/30 text-emerald-200' :
            'bg-white/10 text-white/50'
          }`}>{active.status} · {active.picks_made}/{active.picks_needed} picks</span>
        </div>

        {active.status === 'PICKING' && (
          <div className={`rounded-xl p-3 text-center text-sm font-bold ${
            myTurn ? 'bg-indigo-500/30 border border-indigo-400/50 text-indigo-100' : 'glass text-white/60'
          }`}>
            {myTurn ? '🎯 Tu turno — elegí del pool' :
              `Esperando pick de ${active.current_pick_captain_id === active.captain_a_id ? active.captain_a_alias : active.captain_b_alias}…`}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          {[
            { letter: 'A', alias: active.captain_a_alias, team: active.team_a, color: 'cyan' },
            { letter: 'B', alias: active.captain_b_alias, team: active.team_b, color: 'rose' },
          ].map(t => (
            <div key={t.letter} className={`rounded-2xl glass border border-${t.color}-400/30 overflow-hidden`}>
              <div className={`px-4 py-3 bg-${t.color}-500/15 border-b border-${t.color}-400/30`}>
                <div className={`font-display font-black text-${t.color}-200`}>Equipo {t.letter}</div>
                <div className="text-[10px] text-white/50">Capitán: {t.alias}</div>
              </div>
              <div className="divide-y divide-white/5">
                {t.team.map(p => (
                  <div key={p.player_id} className="px-4 py-2.5 flex items-center gap-2 text-sm">
                    {p.is_captain && <Crown size={12} className="text-amber-300" />}
                    <span className={p.is_captain ? 'font-bold' : ''}>{p.alias}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {active.status === 'PICKING' && myTurn && (
          <div className="rounded-2xl glass overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10 text-xs uppercase tracking-wider text-indigo-300 font-bold">
              Pool disponible ({available.length})
            </div>
            <div className="p-3 flex flex-wrap gap-1.5 max-h-60 overflow-y-auto">
              {available.map(p => (
                <button
                  key={p.player_id}
                  onClick={() => pick(active.id, p.player_id)}
                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-indigo-500/30 hover:text-indigo-100 text-sm transition"
                >
                  {p.tier_emoji} {p.alias} <span className="text-white/40 font-mono text-xs">{p.rating}</span>
                </button>
              ))}
              {!available.length && <div className="text-white/40 text-sm py-4 px-2">Pool vacío — sin más jugadores con rating</div>}
            </div>
          </div>
        )}

        {active.status === 'OPEN' && me && (me.id === active.captain_a_id || me.id === active.captain_b_id) && (
          <button onClick={() => start(active.id)}
            className="w-full py-3 rounded-xl bg-gradient-to-r from-indigo-500 to-violet-500 text-white font-bold">
            Iniciar draft
          </button>
        )}
      </motion.div>
    );
  }

  return (
    <motion.div key="drafts" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <UsersIcon size={18} className="text-indigo-300" /> Team Drafts
          </h2>
          <p className="text-white/50 text-xs mt-1">Dos capitanes arman equipos con snake picks (A·B·B·A·A·B…).</p>
        </div>
        <button onClick={() => setOpenCreate(true)}
          className="px-4 py-2 rounded-xl bg-indigo-500 hover:bg-indigo-400 text-white font-bold text-sm flex items-center gap-1">
          <Plus size={14} /> Nuevo draft
        </button>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {drafts.map(d => (
          <button key={d.id} onClick={() => setActive(d)}
            className="text-left rounded-2xl glass border border-indigo-400/20 p-4 hover:border-indigo-400/50 transition">
            <div className="flex justify-between items-baseline mb-1">
              <h3 className="font-bold truncate">{d.title}</h3>
              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold shrink-0 ${
                d.status === 'PICKING' ? 'bg-indigo-500/30 text-indigo-200' :
                d.status === 'LOCKED' ? 'bg-emerald-500/30 text-emerald-200' :
                'bg-white/10 text-white/50'
              }`}>{d.status}</span>
            </div>
            <div className="text-xs text-white/60">
              {d.captain_a_alias} <span className="text-white/30">vs</span> {d.captain_b_alias}
              <span className="text-white/30"> · {d.picks_made}/{d.picks_needed} picks · {d.team_size}v{d.team_size}</span>
            </div>
          </button>
        ))}
        {drafts.length === 0 && (
          <div className="md:col-span-2 rounded-2xl glass p-10 text-center text-white/40">
            Sin drafts. Creá el primero y elegí capitanes.
          </div>
        )}
      </div>
      {openCreate && (
        <CreateDraftModal pool={pool} onClose={() => setOpenCreate(false)}
          onCreated={(d) => { setOpenCreate(false); setActive(d); load(); }} />
      )}
    </motion.div>
  );
}

function CreateDraftModal({ pool, onClose, onCreated }) {
  const [form, setForm] = useState({ title: '', captain_a_id: '', captain_b_id: '', team_size: 4 });
  const submit = async () => {
    if (!form.title || !form.captain_a_id || !form.captain_b_id) { toast.error('Faltan campos'); return; }
    try {
      const r = await api.post('/api/competitive/drafts', {
        ...form,
        captain_a_id: parseInt(form.captain_a_id, 10),
        captain_b_id: parseInt(form.captain_b_id, 10),
      });
      toast.success('Draft creado');
      onCreated(r.data);
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={e => e.stopPropagation()}
        className="bg-bg-elevated rounded-2xl border border-indigo-400/30 max-w-md w-full p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-display font-bold text-xl">Nuevo Team Draft</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}
          placeholder="Título (ej: Clásico de los Viernes)" maxLength={120}
          className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm mb-3" />
        {['captain_a_id', 'captain_b_id'].map((field, i) => (
          <select key={field} value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })}
            className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm mb-3">
            <option value="">— Capitán {i === 0 ? 'A' : 'B'} —</option>
            {pool.map(p => (
              <option key={p.player_id} value={p.player_id}>{p.alias} ({p.rating})</option>
            ))}
          </select>
        ))}
        <label className="text-xs uppercase tracking-wider text-white/50 font-bold mb-1.5 block">
          Tamaño de equipo: {form.team_size}v{form.team_size}
        </label>
        <input type="range" min="2" max="8" value={form.team_size}
          onChange={e => setForm({ ...form, team_size: parseInt(e.target.value, 10) })}
          className="w-full accent-indigo-400 mb-4" />
        <button onClick={submit} className="w-full py-2 rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white font-bold">
          Crear draft
        </button>
      </motion.div>
    </motion.div>
  );
}

function PromoSeriesWidget({ promo }) {
  const trustColor =
    promo.trust_score >= 0.9 ? 'text-emerald-300' :
    promo.trust_score >= 0.7 ? 'text-cyan-300' :
    promo.trust_score >= 0.5 ? 'text-amber-300' : 'text-rose-300';
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl glass border border-amber-400/30 p-4 mb-4 grid md:grid-cols-3 gap-3 items-center"
    >
      <div>
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Tu rating</div>
        <div className="font-display text-3xl font-black text-amber-300 font-mono tabular-nums">{promo.rating}</div>
      </div>

      {promo.in_promotion_series ? (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-violet-300 font-bold mb-1 flex items-center gap-1">
            <Trophy size={10} /> Promotion Series → {promo.target_tier}
          </div>
          <div className="flex items-center gap-1.5">
            {Array.from({ length: 3 }).map((_, i) => {
              const isWin = i < promo.wins;
              const isLoss = i >= promo.wins && i < promo.total;
              return (
                <div key={i} className={`w-8 h-8 rounded-lg flex items-center justify-center text-sm font-black ${
                  isWin ? 'bg-emerald-500 text-white' :
                  isLoss ? 'bg-rose-500 text-white' :
                  'bg-white/5 text-white/30 border border-white/10'
                }`}>
                  {isWin ? 'W' : isLoss ? 'L' : '?'}
                </div>
              );
            })}
            <span className="text-xs text-white/50 ml-2 font-mono">{promo.wins}/{promo.needed_wins} para promover</span>
          </div>
        </div>
      ) : promo.demotion_shield_active ? (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-cyan-300 font-bold mb-1">Demotion Shield</div>
          <div className="flex items-center gap-2">
            <Shield size={20} className="text-cyan-300 glow-pulse" />
            <span className="text-sm text-white/70">Tu próxima derrota no demuele</span>
          </div>
        </div>
      ) : (
        <div>
          <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Estado</div>
          <div className="text-sm text-white/70">Compitiendo normal</div>
        </div>
      )}

      <div>
        <div className="text-[10px] uppercase tracking-wider text-white/40 font-bold mb-1">Trust score</div>
        <div className="flex items-center gap-2">
          <div className="font-mono text-2xl font-black tabular-nums">{(promo.trust_score * 100).toFixed(0)}</div>
          <div className={`text-xs font-bold uppercase tracking-wider ${trustColor}`}>
            {promo.trust_score >= 0.9 ? 'pristine' :
             promo.trust_score >= 0.7 ? 'good' :
             promo.trust_score >= 0.5 ? 'mediocre' : 'low'}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function CenterSpinner() {
  return <div className="grid place-items-center py-12"><Loader2 className="animate-spin text-white/40" /></div>;
}

function EmptyHint({ icon: Icon, text }) {
  return (
    <div className="rounded-2xl glass p-10 text-center">
      <Icon size={32} className="mx-auto text-white/30 mb-3" />
      <p className="text-white/50 text-sm">{text}</p>
    </div>
  );
}
