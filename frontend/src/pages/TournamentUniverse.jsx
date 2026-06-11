import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, TrendingUp, Zap, MessageCircle, Trophy, BookOpen, Sparkles,
  Heart, Plus, Send, Flame, ChevronRight, Crown, Loader2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import AuthGuard from '../components/AuthGuard';
import { api } from '../lib/api';

export default function TournamentUniverse() {
  return (
    <AuthGuard feature="el Tournament Universe" returnUrl={window.location.pathname} accent="violet">
      <Inner />
    </AuthGuard>
  );
}

const TABS = [
  { id: 'predictions', icon: TrendingUp, label: 'Predicciones', color: 'amber' },
  { id: 'hype',        icon: Flame,      label: 'Hype Feed',    color: 'rose' },
  { id: 'achievements',icon: Trophy,     label: 'Achievements', color: 'violet' },
  { id: 'storyline',   icon: BookOpen,   label: 'Storyline',    color: 'cyan' },
];

function Inner() {
  const { id } = useParams();
  const [tab, setTab] = useState('predictions');
  const [event, setEvent] = useState(null);

  useEffect(() => {
    api.get(`/api/events/${id}`).then(r => setEvent(r.data)).catch(() => {});
  }, [id]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-violet-950/20 to-slate-950 text-white">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 pt-24 pb-16">
        <Link to={`/events/${id}`} className="flex items-center gap-2 text-white/60 hover:text-white text-sm w-fit mb-4">
          <ArrowLeft size={16} /> Volver al evento
        </Link>

        <motion.header
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl glass aurora-bg grain p-6 mb-6 overflow-hidden relative"
        >
          <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-violet-300 mb-1">
            <Sparkles size={14} /> Tournament Universe
          </div>
          <h1 className="font-display text-3xl md:text-4xl font-black">
            {event?.name || 'Cargando…'} <span className="text-gradient">·</span> Locura activada
          </h1>
          <p className="text-white/60 text-sm mt-2 max-w-2xl">
            Apostá EXP en los matches · Reaccioná al hype feed · Desbloqueá achievements en tiempo real · Leé la épica IA del torneo al cerrar.
          </p>
        </motion.header>

        {/* Tabs */}
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
          {tab === 'predictions' && <PredictionsTab eventId={id} />}
          {tab === 'hype' && <HypeTab eventId={id} />}
          {tab === 'achievements' && <AchievementsTab eventId={id} />}
          {tab === 'storyline' && <StorylineTab eventId={id} />}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PREDICTIONS
// ═══════════════════════════════════════════════════════════

function PredictionsTab({ eventId }) {
  const [market, setMarket] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [m, p] = await Promise.all([
        api.get(`/api/tour-univ/events/${eventId}/predictions/market`),
        api.get(`/api/tour-univ/events/${eventId}/predictions`),
      ]);
      setMarket(m.data || []);
      setMine(p.data || []);
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al cargar mercado');
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, [eventId]);

  const cancel = async (predId) => {
    if (!confirm('Cancelar apuesta y recuperar EXP?')) return;
    try {
      await api.delete(`/api/tour-univ/predictions/${predId}`);
      toast.success('Cancelada — EXP devuelto');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error');
    }
  };

  return (
    <motion.div
      key="predictions"
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <TrendingUp size={18} className="text-amber-300" /> Mercado de Predicciones
          </h2>
          <p className="text-white/50 text-xs mt-1">
            Stake EXP en el resultado · Si acertás, ganás proporcional al pool de losers.
          </p>
        </div>
        <button
          onClick={() => setOpenModal({ kind: 'champion', target_id: parseInt(eventId, 10) })}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-bold shadow-lg shadow-amber-500/30 flex items-center gap-2 text-sm"
        >
          <Plus size={14} /> Apostar al campeón
        </button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-12"><Loader2 className="animate-spin text-amber-300" /></div>
      ) : market.length === 0 ? (
        <EmptyHint icon={TrendingUp} text="Aún nadie apostó en este evento. Sé el primero." />
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {market.map((m, i) => (
            <MarketCard key={`${m.target_kind}-${m.predicted_target_id}-${i}`} market={m} />
          ))}
        </div>
      )}

      {mine.length > 0 && (
        <div className="rounded-2xl bg-slate-900/40 border border-white/10 overflow-hidden">
          <div className="px-4 py-3 border-b border-white/10 text-xs uppercase tracking-wider text-white/50 font-bold">
            Apuestas en este evento ({mine.length})
          </div>
          <div className="divide-y divide-white/5 max-h-80 overflow-y-auto">
            {mine.map(p => (
              <div key={p.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-sm truncate">
                    {p.bettor_alias} apostó a <span className="text-amber-300">{p.predicted_winner_alias}</span>
                  </div>
                  <div className="text-xs text-white/40">
                    {p.target_kind === 'champion' ? 'Campeón del evento' : `Match #${p.predicted_target_id}`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-mono font-bold text-amber-300">{p.stake_exp} EXP</div>
                  {p.settled_at ? (
                    p.is_winner ? (
                      <div className="text-[10px] text-emerald-300 font-bold">+{p.payout_exp} EXP ✓</div>
                    ) : (
                      <div className="text-[10px] text-rose-400">lost</div>
                    )
                  ) : (
                    <button onClick={() => cancel(p.id)} className="text-[10px] text-white/40 hover:text-rose-300">
                      cancelar
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <AnimatePresence>
        {openModal && (
          <PredictionModal
            eventId={eventId}
            initial={openModal}
            onClose={() => setOpenModal(null)}
            onPlaced={() => { setOpenModal(null); load(); }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function MarketCard({ market }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="rounded-2xl bg-slate-900/50 border border-amber-400/20 overflow-hidden"
    >
      <div className="px-4 py-3 bg-amber-500/10 border-b border-amber-400/20 flex justify-between items-center">
        <span className="text-xs uppercase tracking-wider text-amber-300 font-bold">
          {market.target_kind === 'champion' ? 'Campeón' : `Match #${market.predicted_target_id}`}
        </span>
        <span className="text-xs text-white/50 font-mono">{market.total_stake_exp} EXP · {market.bets_count} apuestas</span>
      </div>
      <div className="p-4 space-y-2">
        {market.by_winner.slice(0, 4).map(w => (
          <div key={w.player_id}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="font-semibold truncate">{w.alias}</span>
              <span className="font-mono text-xs">
                <span className="text-emerald-300">×{w.implied_multiplier}</span>{' '}
                <span className="text-white/40">· {w.share_pct}%</span>
              </span>
            </div>
            <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
              <div className="h-full bg-gradient-to-r from-amber-500 to-orange-500" style={{ width: `${w.share_pct}%` }} />
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

function PredictionModal({ eventId, initial, onClose, onPlaced }) {
  const [players, setPlayers] = useState([]);
  const [winnerId, setWinnerId] = useState('');
  const [stake, setStake] = useState(100);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial.kind === 'champion') {
      api.get(`/api/events/${eventId}/registrations`)
        .then(r => setPlayers((r.data || []).filter(x => !x.dropped)))
        .catch(() => setPlayers([]));
    }
  }, [eventId, initial]);

  const submit = async () => {
    if (!winnerId) { toast.error('Elegí un jugador'); return; }
    setSaving(true);
    try {
      await api.post(`/api/tour-univ/events/${eventId}/predictions`, {
        target_kind: initial.kind,
        predicted_target_id: initial.target_id,
        predicted_winner_id: parseInt(winnerId, 10),
        stake_exp: stake,
      });
      toast.success(`Apuesta colocada · ${stake} EXP`);
      onPlaced();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error al apostar');
    } finally {
      setSaving(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.95, y: 20 }} animate={{ scale: 1, y: 0 }}
        onClick={e => e.stopPropagation()}
        className="bg-bg-elevated border border-amber-400/30 rounded-2xl max-w-lg w-full p-5"
      >
        <h3 className="font-display font-bold text-xl mb-1">Apostar al campeón</h3>
        <p className="text-white/50 text-xs mb-4">Si acertás, te llevás parte proporcional del pool perdedor.</p>

        <label className="text-xs uppercase tracking-wider text-white/50 font-bold mb-1.5 block">
          Jugador
        </label>
        <select
          value={winnerId}
          onChange={e => setWinnerId(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border focus:border-amber-400/60 outline-none text-white mb-4"
        >
          <option value="">— Elegir —</option>
          {players.map(p => (
            <option key={p.player_id} value={p.player_id}>
              {p.player_alias || `#${p.player_id}`}
            </option>
          ))}
        </select>

        <label className="text-xs uppercase tracking-wider text-white/50 font-bold mb-1.5 block">
          Stake EXP: <span className="text-amber-300 font-mono">{stake}</span>
        </label>
        <input
          type="range" min="10" max="5000" step="10"
          value={stake}
          onChange={e => setStake(parseInt(e.target.value, 10))}
          className="w-full accent-amber-400"
        />
        <div className="grid grid-cols-4 gap-2 mt-2">
          {[50, 100, 250, 500].map(v => (
            <button
              key={v}
              onClick={() => setStake(v)}
              className={`px-2 py-1 rounded-md text-xs font-bold ${stake === v ? 'bg-amber-500 text-slate-950' : 'bg-white/5 hover:bg-white/10'}`}
            >
              {v}
            </button>
          ))}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-sm">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving || !winnerId}
            className="px-5 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-bold disabled:opacity-40 text-sm"
          >
            {saving ? 'Apostando…' : `Apostar ${stake} EXP`}
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// HYPE FEED
// ═══════════════════════════════════════════════════════════

function HypeTab({ eventId }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [content, setContent] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/api/tour-univ/events/${eventId}/hype`);
      setItems(r.data || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [eventId]);

  const post = async () => {
    if (!content.trim()) return;
    setPosting(true);
    try {
      await api.post(`/api/tour-univ/events/${eventId}/hype`, { content, kind: 'admin_post' });
      setContent('');
      load();
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Solo admins pueden postear');
    } finally { setPosting(false); }
  };

  const react = async (hypeId) => {
    try {
      const r = await api.post(`/api/tour-univ/hype/${hypeId}/react`);
      setItems(prev => prev.map(it =>
        it.id === hypeId
          ? { ...it, i_reacted: r.data.action === 'added', reactions_count: r.data.reactions_count }
          : it
      ));
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Iniciá sesión para reaccionar');
    }
  };

  return (
    <motion.div
      key="hype"
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="space-y-5"
    >
      <div className="rounded-2xl bg-slate-900/40 border border-rose-400/20 p-4">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-rose-300 font-bold mb-3">
          <MessageCircle size={12} /> Postear al hype (solo admin)
        </div>
        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={2}
          maxLength={600}
          placeholder="Qué pasó? Comentate un highlight, una rivalry, un upset…"
          className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-white/10 focus:border-rose-400/60 outline-none text-sm resize-none"
        />
        <div className="flex justify-between items-center mt-2">
          <span className="text-[10px] text-white/40">{content.length}/600</span>
          <button
            onClick={post}
            disabled={posting || !content.trim()}
            className="px-4 py-1.5 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-bold text-sm disabled:opacity-40 flex items-center gap-2"
          >
            <Send size={12} /> {posting ? 'Postando…' : 'Postear'}
          </button>
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-12"><Loader2 className="animate-spin text-rose-300" /></div>
      ) : items.length === 0 ? (
        <EmptyHint icon={Flame} text="Sin posts en el feed todavía. Cuando arranque el evento, llenálo de hype." />
      ) : (
        <div className="space-y-3">
          {items.map(h => (
            <motion.div
              key={h.id}
              initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }}
              className="rounded-2xl glass border border-rose-400/15 p-4"
            >
              <div className="flex justify-between items-start gap-2 mb-2">
                <span className="text-xs text-rose-300/80 font-bold">
                  {h.author_alias || 'EliteCards'} ·{' '}
                  <span className="text-white/40 font-normal">{new Date(h.created_at).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })}</span>
                </span>
              </div>
              <p className="text-sm whitespace-pre-wrap mb-3">{h.content}</p>
              {h.image_url && (
                <img src={h.image_url} alt="" className="rounded-lg mb-3 max-h-64 object-cover" />
              )}
              <button
                onClick={() => react(h.id)}
                className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded-md transition ${
                  h.i_reacted
                    ? 'bg-rose-500/30 text-rose-200'
                    : 'bg-white/5 text-white/60 hover:bg-rose-500/20 hover:text-rose-200'
                }`}
              >
                <Heart size={12} fill={h.i_reacted ? 'currentColor' : 'none'} />
                {h.reactions_count}
              </button>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// ACHIEVEMENTS
// ═══════════════════════════════════════════════════════════

function AchievementsTab({ eventId }) {
  const [unlocked, setUnlocked] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [u, c] = await Promise.all([
        api.get(`/api/tour-univ/events/${eventId}/achievements`),
        api.get('/api/tour-univ/achievements/catalog'),
      ]);
      setUnlocked(u.data || []);
      setCatalog(c.data || []);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [eventId]);

  if (loading) return <div className="grid place-items-center py-12"><Loader2 className="animate-spin text-violet-300" /></div>;

  const unlockedKeys = new Set(unlocked.map(a => a.achievement_key));

  return (
    <motion.div
      key="achievements"
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
      className="space-y-6"
    >
      {unlocked.length > 0 && (
        <div>
          <h2 className="font-display text-xl font-bold mb-3 flex items-center gap-2">
            <Sparkles size={18} className="text-violet-300" /> Desbloqueados en este evento
          </h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
            {unlocked.map(a => (
              <AchievementCard key={a.id} ach={a.definition} player={a.player_alias} round={a.unlocked_round} unlocked />
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="font-display text-lg font-bold mb-3 text-white/60">Catálogo completo</h2>
        <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-3">
          {catalog.map(d => (
            <AchievementCard key={d.key} ach={d} unlocked={unlockedKeys.has(d.key)} />
          ))}
        </div>
      </div>
    </motion.div>
  );
}

function AchievementCard({ ach, player, round, unlocked }) {
  const rarity = {
    common:    { color: 'text-white/60', ring: 'border-white/10', bg: '' },
    rare:      { color: 'text-cyan-300',    ring: 'border-cyan-400/30', bg: 'from-cyan-500/10' },
    epic:      { color: 'text-violet-300',  ring: 'border-violet-400/40', bg: 'from-violet-500/15' },
    legendary: { color: 'text-amber-300',   ring: 'border-amber-400/50', bg: 'from-amber-500/20' },
  }[ach.rarity];
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className={`relative p-4 rounded-xl border ${unlocked ? rarity.ring : 'border-white/5'} bg-gradient-to-br ${unlocked ? rarity.bg : 'from-bg-surface'} to-bg-surface overflow-hidden`}
    >
      {!unlocked && <div className="absolute inset-0 bg-bg/60 z-10" />}
      <div className="relative z-20">
        <div className="text-3xl mb-2">{ach.icon}</div>
        <div className={`text-sm font-bold ${unlocked ? rarity.color : 'text-white/30'}`}>{ach.title}</div>
        <p className="text-xs text-white/50 mt-1 leading-snug">{ach.description}</p>
        <div className="flex justify-between items-center mt-2 text-[10px]">
          <span className={`uppercase tracking-wider font-bold ${unlocked ? rarity.color : 'text-white/30'}`}>{ach.rarity}</span>
          <span className="text-amber-300 font-mono">+{ach.exp_reward} EXP</span>
        </div>
        {unlocked && player && (
          <div className="mt-2 pt-2 border-t border-white/10 text-[10px] text-emerald-300">
            ✓ {player}{round != null && <span className="text-white/40"> · R{round}</span>}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// STORYLINE
// ═══════════════════════════════════════════════════════════

function StorylineTab({ eventId }) {
  const [story, setStory] = useState(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await api.get(`/api/tour-univ/events/${eventId}/storyline`);
      setStory(r.data);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [eventId]);

  const generate = async (regenerate = false) => {
    setGenerating(true);
    try {
      const r = await api.post(`/api/tour-univ/events/${eventId}/storyline/generate?regenerate=${regenerate}`);
      setStory(r.data);
      toast.success(regenerate ? 'Regenerada' : 'Generada');
    } catch (e) {
      toast.error(e.response?.data?.detail || 'Error generando');
    } finally { setGenerating(false); }
  };

  if (loading) return <div className="grid place-items-center py-12"><Loader2 className="animate-spin text-cyan-300" /></div>;

  return (
    <motion.div
      key="storyline"
      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
    >
      {story ? (
        <motion.article
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="rounded-3xl glass aurora-bg p-8 md:p-12 relative overflow-hidden"
        >
          <div className="absolute top-6 right-6 text-[10px] uppercase tracking-widest text-cyan-300/60 font-mono">
            via {story.model_used || 'AI'}
          </div>
          {story.champion_alias && (
            <div className="flex items-center gap-2 mb-4 text-amber-300">
              <Crown size={20} className="float-y-slow" />
              <span className="text-sm font-bold uppercase tracking-wider">Campeón: {story.champion_alias}</span>
            </div>
          )}
          <h2 className="font-display text-3xl md:text-5xl font-black mb-6">
            {story.title || 'La Crónica del Torneo'}
          </h2>
          <div className="prose prose-invert max-w-none">
            {story.narrative.split('\n\n').map((para, i) => (
              <p key={i} className="text-base md:text-lg text-white/80 leading-relaxed mb-4">{para}</p>
            ))}
          </div>
          <button
            onClick={() => generate(true)}
            disabled={generating}
            className="mt-6 px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs flex items-center gap-1.5 disabled:opacity-40"
          >
            <Sparkles size={12} /> Regenerar
          </button>
        </motion.article>
      ) : (
        <div className="rounded-3xl glass p-12 text-center">
          <BookOpen className="mx-auto mb-3 text-cyan-300/60" size={48} />
          <div className="text-lg font-bold mb-2">Sin narrativa todavía</div>
          <p className="text-white/50 text-sm max-w-md mx-auto mb-5">
            La crónica épica del torneo se genera cuando finaliza. Si el evento ya cerró, podés generarla ahora con Claude.
          </p>
          <button
            onClick={() => generate(false)}
            disabled={generating}
            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold disabled:opacity-40 flex items-center gap-2 mx-auto"
          >
            <Sparkles size={14} /> {generating ? 'Escribiendo épica…' : 'Generar narrativa'}
          </button>
        </div>
      )}
    </motion.div>
  );
}

function EmptyHint({ icon: Icon, text }) {
  return (
    <div className="rounded-2xl glass p-10 text-center">
      <Icon size={32} className="mx-auto text-white/30 mb-3" />
      <p className="text-white/50 text-sm">{text}</p>
    </div>
  );
}
