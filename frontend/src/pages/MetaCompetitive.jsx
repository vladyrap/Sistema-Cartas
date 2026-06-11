import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Gavel, UserCheck, Brain, Star, Plus, Loader2, Trophy, MessageCircle, X,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import AuthGuard from '../components/AuthGuard';
import { api } from '../lib/api';

export default function MetaCompetitive() {
  return (
    <AuthGuard feature="el Meta Hub competitivo" returnUrl={window.location.pathname} accent="fuchsia">
      <Inner />
    </AuthGuard>
  );
}

const TABS = [
  { id: 'auctions',  icon: Gavel,     label: 'Auctions',  color: 'amber' },
  { id: 'mercenary', icon: UserCheck, label: 'Mercenaries', color: 'rose' },
  { id: 'coach',     icon: Brain,     label: 'Coaching',  color: 'cyan' },
  { id: 'picks',     icon: Star,      label: 'Spectator Picks', color: 'fuchsia' },
];

function Inner() {
  const [tab, setTab] = useState('auctions');
  const [games, setGames] = useState([]);
  useEffect(() => { api.get('/api/games').then(r => setGames(r.data || [])).catch(() => {}); }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-fuchsia-950/15 to-slate-950 text-white">
      <Navbar />
      <div className="max-w-6xl mx-auto px-4 pt-24 pb-16">
        <motion.header
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl glass aurora-bg grain p-6 mb-6 overflow-hidden relative"
        >
          <div className="text-xs uppercase tracking-[0.3em] text-fuchsia-300 mb-1">Meta-Competitive</div>
          <h1 className="font-display text-3xl md:text-5xl font-black">
            Ideas <span className="text-gradient">locas</span> competitivas
          </h1>
          <p className="text-white/60 text-sm mt-2 max-w-2xl">
            Subastas por slots top · Mercenaries para guild wars · Coaching de top players · Spectator MVP picks.
          </p>
        </motion.header>

        <div className="flex gap-2 mb-6 overflow-x-auto no-scrollbar">
          {TABS.map(t => {
            const active = tab === t.id;
            const Icon = t.icon;
            return (
              <button
                key={t.id} onClick={() => setTab(t.id)}
                className={`px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-medium whitespace-nowrap border transition ${
                  active ? `bg-${t.color}-500/25 border-${t.color}-400/50 text-${t.color}-100`
                         : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/10'
                }`}
              >
                <Icon size={14} /> {t.label}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          {tab === 'auctions' && <AuctionsTab key="a" />}
          {tab === 'mercenary' && <MercTab key="m" games={games} />}
          {tab === 'coach' && <CoachTab key="c" games={games} />}
          {tab === 'picks' && <PicksInfo key="p" />}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// AUCTIONS
// ═══════════════════════════════════════════════════════════

function AuctionsTab() {
  const [auctionId, setAuctionId] = useState('');
  const [auction, setAuction] = useState(null);
  const [bidAmount, setBidAmount] = useState(500);

  const load = async () => {
    if (!auctionId) return;
    try {
      const r = await api.get(`/api/meta/auctions/${auctionId}`);
      setAuction(r.data);
    } catch (e) { toast.error(e.response?.data?.detail || 'No existe'); setAuction(null); }
  };

  const bid = async () => {
    try {
      await api.post(`/api/meta/auctions/${auctionId}/bid?amount=${bidAmount}`);
      toast.success(`Bid ${bidAmount} EXP colocado`);
      load();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <Gavel size={18} className="text-amber-300" /> Subastas
          </h2>
          <p className="text-white/50 text-xs mt-1">Pujá EXP por un slot en torneo cerrado. Top N bids ganan acceso.</p>
        </div>
      </div>
      <div className="rounded-2xl glass p-4 flex gap-2">
        <input type="number" value={auctionId} onChange={e => setAuctionId(e.target.value)}
          placeholder="ID de subasta"
          className="flex-1 px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm" />
        <button onClick={load} className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm">Ver</button>
      </div>
      {auction && (
        <div className="rounded-2xl glass p-5 space-y-3">
          <div className="flex justify-between items-baseline">
            <div className="font-display font-bold text-lg">Subasta #{auction.id}</div>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold ${
              auction.status === 'OPEN' ? 'bg-emerald-500/20 text-emerald-300' :
              'bg-white/10 text-white/50'
            }`}>{auction.status}</span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-sm">
            <div><span className="text-white/40 text-xs uppercase tracking-wider">Slots</span><div className="font-mono">{auction.slots_available}</div></div>
            <div><span className="text-white/40 text-xs uppercase tracking-wider">Min bid</span><div className="font-mono">{auction.min_bid_exp} EXP</div></div>
            <div><span className="text-white/40 text-xs uppercase tracking-wider">Bids</span><div className="font-mono">{auction.total_bids}</div></div>
          </div>
          {auction.status === 'OPEN' && (
            <div className="flex gap-2 pt-3 border-t border-white/10">
              <input type="number" value={bidAmount} onChange={e => setBidAmount(parseInt(e.target.value, 10) || 0)} min={auction.min_bid_exp}
                className="flex-1 px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm" />
              <button onClick={bid} className="px-4 py-2 rounded-lg bg-gradient-to-r from-amber-500 to-orange-500 text-slate-950 font-bold text-sm">
                Pujar
              </button>
            </div>
          )}
          <div className="divide-y divide-white/5 max-h-64 overflow-y-auto rounded-lg bg-bg-surface/40">
            {auction.bids.map((b, i) => (
              <div key={b.bidder_player_id} className="px-3 py-2 flex justify-between text-sm">
                <span className="font-semibold">#{i + 1} {b.alias}</span>
                <span className={`font-mono ${i < auction.slots_available ? 'text-emerald-300 font-bold' : 'text-white/50'}`}>
                  {b.bid_exp} EXP {i < auction.slots_available && '★'}
                </span>
              </div>
            ))}
            {auction.bids.length === 0 && <div className="px-3 py-6 text-center text-white/40 text-sm">Sin pujas</div>}
          </div>
        </div>
      )}
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// MERCENARIES
// ═══════════════════════════════════════════════════════════

function MercTab({ games }) {
  const [offers, setOffers] = useState([]);
  const [gameId, setGameId] = useState('');
  const [openOffer, setOpenOffer] = useState(false);

  const load = async () => {
    const r = await api.get(`/api/meta/mercenary/offers${gameId ? `?game_id=${gameId}` : ''}`);
    setOffers(r.data || []);
  };
  useEffect(() => { load(); }, [gameId]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <UserCheck size={18} className="text-rose-300" /> Mercenaries
          </h2>
          <p className="text-white/50 text-xs mt-1">Top players ofrecen jugar en guild wars por EXP.</p>
        </div>
        <div className="flex gap-2">
          <select value={gameId} onChange={e => setGameId(e.target.value)} className="px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm">
            <option value="">Todos</option>
            {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
          </select>
          <button onClick={() => setOpenOffer(true)} className="px-4 py-2 rounded-xl bg-rose-500 text-white font-bold text-sm flex items-center gap-1">
            <Plus size={14} /> Ofrecerme
          </button>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-3">
        {offers.map(o => (
          <div key={o.id} className="rounded-2xl glass border border-rose-400/20 p-4">
            <div className="flex justify-between items-baseline mb-2">
              <h3 className="font-display font-bold text-lg">{o.alias}</h3>
              <span className="text-amber-300 font-mono font-bold">{o.rate_per_match_exp} EXP/match</span>
            </div>
            {o.bio && <p className="text-xs text-white/60 mb-2">{o.bio}</p>}
            <div className="text-[10px] text-white/40 font-mono">{o.total_matches_hired} matches contratados</div>
          </div>
        ))}
        {offers.length === 0 && (
          <div className="md:col-span-2 rounded-2xl glass p-10 text-center text-white/40">Sin ofertas todavía.</div>
        )}
      </div>
      {openOffer && (
        <OfferMercModal games={games} onClose={() => setOpenOffer(false)} onSaved={() => { setOpenOffer(false); load(); }} />
      )}
    </motion.div>
  );
}

function OfferMercModal({ games, onClose, onSaved }) {
  const [form, setForm] = useState({ game_id: games[0]?.id || '', rate_per_match_exp: 100, bio: '' });
  const submit = async () => {
    try {
      await api.post('/api/meta/mercenary/offer', { ...form, game_id: parseInt(form.game_id, 10) });
      toast.success('Oferta publicada');
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={e => e.stopPropagation()}
        className="bg-bg-elevated rounded-2xl border border-rose-400/30 max-w-md w-full p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-display font-bold text-xl">Ofrecerme como mercenary</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <select value={form.game_id} onChange={e => setForm({ ...form, game_id: e.target.value })}
          className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm mb-3">
          {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <input type="number" value={form.rate_per_match_exp} onChange={e => setForm({ ...form, rate_per_match_exp: parseInt(e.target.value, 10) || 100 })}
          placeholder="EXP/match" className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm mb-3" />
        <textarea value={form.bio} onChange={e => setForm({ ...form, bio: e.target.value })} rows={3} maxLength={600}
          placeholder="Tu bio: rating, archetypes, disponibilidad…"
          className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm mb-4 resize-none" />
        <button onClick={submit} className="w-full py-2 rounded-lg bg-rose-500 hover:bg-rose-400 text-white font-bold">
          Publicar oferta
        </button>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// COACH
// ═══════════════════════════════════════════════════════════

function CoachTab({ games }) {
  const [offers, setOffers] = useState([]);
  const [openOffer, setOpenOffer] = useState(false);
  const load = async () => {
    const r = await api.get('/api/meta/coach/offers');
    setOffers(r.data || []);
  };
  useEffect(() => { load(); }, []);

  const book = async (offerId, price) => {
    if (!confirm(`Bookear sesión por ${price} EXP?`)) return;
    try {
      await api.post(`/api/meta/coach/book?offer_id=${offerId}`);
      toast.success('Booking confirmado');
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-4">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <h2 className="font-display text-xl font-bold flex items-center gap-2">
            <Brain size={18} className="text-cyan-300" /> Coaching
          </h2>
          <p className="text-white/50 text-xs mt-1">Top players venden sesiones de coaching por EXP.</p>
        </div>
        <button onClick={() => setOpenOffer(true)} className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-sm flex items-center gap-1">
          <Plus size={14} /> Ofrecer coaching
        </button>
      </div>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
        {offers.map(o => (
          <div key={o.id} className="rounded-2xl glass border border-cyan-400/20 p-4">
            <h3 className="font-bold mb-1 truncate">{o.title}</h3>
            <div className="text-xs text-cyan-200 mb-2">por <strong>{o.coach_alias}</strong></div>
            {o.description && <p className="text-xs text-white/60 line-clamp-3 mb-3">{o.description}</p>}
            <div className="flex items-center justify-between text-sm mb-2">
              <span className="text-white/50">{o.duration_minutes} min</span>
              <span className="font-mono font-bold text-amber-300">{o.price_exp} EXP</span>
            </div>
            <div className="flex items-center justify-between text-xs text-white/40 mb-3">
              <span>{o.sessions_completed} sesiones</span>
              {o.rating_avg && <span>⭐ {o.rating_avg.toFixed(1)}</span>}
            </div>
            <button onClick={() => book(o.id, o.price_exp)} className="w-full py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-200 text-sm font-bold">
              Bookear
            </button>
          </div>
        ))}
        {offers.length === 0 && (
          <div className="md:col-span-3 rounded-2xl glass p-10 text-center text-white/40">Sin ofertas. Sé el primero.</div>
        )}
      </div>
      {openOffer && (
        <OfferCoachModal games={games} onClose={() => setOpenOffer(false)} onSaved={() => { setOpenOffer(false); load(); }} />
      )}
    </motion.div>
  );
}

function OfferCoachModal({ games, onClose, onSaved }) {
  const [form, setForm] = useState({ game_id: games[0]?.id || '', title: '', description: '', price_exp: 500, duration_minutes: 60 });
  const submit = async () => {
    if (!form.title) { toast.error('Falta título'); return; }
    try {
      await api.post('/api/meta/coach/offers', { ...form, game_id: parseInt(form.game_id, 10) });
      toast.success('Coaching publicado');
      onSaved();
    } catch (e) { toast.error(e.response?.data?.detail || 'Error'); }
  };
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <motion.div initial={{ scale: 0.95 }} animate={{ scale: 1 }} onClick={e => e.stopPropagation()}
        className="bg-bg-elevated rounded-2xl border border-cyan-400/30 max-w-md w-full p-5">
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-display font-bold text-xl">Ofrecer coaching</h3>
          <button onClick={onClose}><X size={18} /></button>
        </div>
        <select value={form.game_id} onChange={e => setForm({ ...form, game_id: e.target.value })}
          className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm mb-3">
          {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
        <input value={form.title} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Título"
          className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm mb-3" />
        <textarea value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} rows={3} maxLength={600}
          placeholder="Qué incluye la sesión, archetypes que dominás, etc."
          className="w-full px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm mb-3 resize-none" />
        <div className="grid grid-cols-2 gap-3 mb-4">
          <input type="number" value={form.price_exp} onChange={e => setForm({ ...form, price_exp: parseInt(e.target.value, 10) || 500 })}
            placeholder="Precio EXP" className="px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm" />
          <input type="number" value={form.duration_minutes} onChange={e => setForm({ ...form, duration_minutes: parseInt(e.target.value, 10) || 60 })}
            placeholder="Minutos" className="px-3 py-2 rounded-lg bg-bg-surface border border-bg-border text-sm" />
        </div>
        <button onClick={submit} className="w-full py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold">
          Publicar
        </button>
      </motion.div>
    </motion.div>
  );
}

// ═══════════════════════════════════════════════════════════
// SPECTATOR PICKS INFO
// ═══════════════════════════════════════════════════════════

function PicksInfo() {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <div className="rounded-2xl glass p-8 text-center">
        <Star className="mx-auto mb-3 text-fuchsia-300" size={40} />
        <h3 className="font-display font-bold text-xl mb-2">Spectator MVP Picks</h3>
        <p className="text-white/60 text-sm max-w-md mx-auto mb-4">
          Mientras un evento está activo, andá a <code className="text-fuchsia-300">/events/:id</code> para votar al MVP de cada ronda. El backend ya está listo en <code>/api/meta/events/&#123;id&#125;/picks/&#123;round&#125;</code>.
        </p>
        <p className="text-xs text-white/40">El UI inline está integrado en spectator mode y event detail (próximamente).</p>
      </div>
    </motion.div>
  );
}
