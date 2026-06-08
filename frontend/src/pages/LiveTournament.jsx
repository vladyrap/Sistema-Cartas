/** Sala de Torneo en VIVO — la pieza insignia.
 * Standings con FLIP, pairings actuales con resultados live, bracket SVG si existe.
 * WebSocket bound: cada match_reported/round_started gatilla refresh.
 */
import { useEffect, useState, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Trophy, Users, Zap, Layers, GitBranch } from 'lucide-react';
import clsx from 'clsx';

import { api } from '../lib/api';
import { useWebSocket } from '../lib/useWebSocket';
import { usePresence } from '../lib/usePresence';
import LiveBadge from '../components/LiveBadge';
import StandingsLive from '../components/StandingsLive';
import PairingsLive from '../components/PairingsLive';
import BracketSVG from '../components/BracketSVG';
import PresenceLayer from '../components/PresenceLayer';
import ReactionBar from '../components/ReactionBar';

const TABS = [
  { id: 'standings', label: 'Standings', icon: Layers },
  { id: 'pairings',  label: 'Pairings',  icon: Zap },
  { id: 'bracket',   label: 'Bracket',   icon: GitBranch },
];

export default function LiveTournament() {
  const { id } = useParams();
  const eventId = Number(id);

  const [event, setEvent] = useState(null);
  const [standings, setStandings] = useState([]);
  const [currentRound, setCurrentRound] = useState(0);
  const [pairings, setPairings] = useState([]);
  const [bracket, setBracket] = useState({ bracket: null, nodes: [] });
  const [tab, setTab] = useState('standings');

  async function fetchAll() {
    try {
      const [eRes, sRes, bRes] = await Promise.all([
        api.get(`/events/${eventId}`),
        api.get(`/events/${eventId}/standings`),
        api.get(`/events/${eventId}/bracket`),
      ]);
      setEvent(eRes.data);
      setStandings(sRes.data);
      setBracket(bRes.data);
    } catch {}
  }

  async function fetchPairings(round) {
    if (!round) return;
    try {
      const r = await api.get(`/events/${eventId}/rounds/${round}/pairings`);
      setPairings(r.data);
    } catch { setPairings([]); }
  }

  useEffect(() => { fetchAll(); }, [eventId]);
  useEffect(() => { fetchPairings(currentRound); }, [currentRound, eventId]);

  // Detectar ronda actual desde las pairings (la más alta del evento).
  useEffect(() => {
    api.get(`/events/${eventId}/rounds/1/pairings`).then(r => {
      // Hack: encontramos la ronda más alta probando incrementalmente.
      // Simple: usamos info de algún pairing ya hecho. Por ahora: empieza en 1
      // y el WS nos avisa cuando hay round_started.
      if (r.data?.length) setCurrentRound(prev => prev || 1);
    }).catch(() => {});
  }, [eventId]);

  // WebSocket bound a TODOS los eventos del torneo.
  const token = typeof window !== 'undefined' ? localStorage.getItem('ec_access_token') : null;
  const wsPath = token
    ? `/api/rt/ws/events/${eventId}?token=${encodeURIComponent(token)}`
    : `/api/rt/ws/events/${eventId}`;
  const { status: wsStatus, lastMessage } = useWebSocket(wsPath);

  // Multiplayer presence
  const meAlias = (() => {
    try {
      const t = localStorage.getItem('ec_access_token');
      if (!t) return null;
      const payload = JSON.parse(atob(t.split('.')[1]));
      return payload?.alias || null;
    } catch { return null; }
  })();
  const { peers, reactions, sendCursor, sendReaction } = usePresence({ eventId, alias: meAlias });

  useEffect(() => {
    if (!lastMessage) return;
    const { type, round_number } = lastMessage;
    if (type === 'round_started') {
      setCurrentRound(round_number);
      fetchPairings(round_number);
      // Refresh standings tambien.
      api.get(`/events/${eventId}/standings`).then(r => setStandings(r.data));
    } else if (type === 'match_reported' || type === 'standings_updated' || type === 'player_dropped') {
      api.get(`/events/${eventId}/standings`).then(r => setStandings(r.data));
      if (type === 'match_reported' && currentRound) fetchPairings(currentRound);
    } else if (type === 'event_finalized') {
      fetchAll();
    }
  }, [lastMessage]); // eslint-disable-line react-hooks/exhaustive-deps

  const stats = useMemo(() => {
    const active = standings.filter(s => !s.dropped).length;
    const dropped = standings.length - active;
    const top = standings[0];
    return { active, dropped, leader: top?.alias, mp: top?.match_points };
  }, [standings]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-violet-950/40 text-white">
      {/* HERO */}
      <div className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_50%,rgba(124,58,237,0.18),transparent_55%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_80%_20%,rgba(244,114,182,0.10),transparent_60%)] pointer-events-none" />
        <div className="relative max-w-7xl mx-auto px-6 py-8">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="flex items-center gap-3 mb-2">
                <LiveBadge status={wsStatus} />
                {event?.event_type && (
                  <span className="text-[10px] uppercase tracking-widest text-violet-300/80 font-semibold">
                    {event.event_type}
                  </span>
                )}
              </div>
              <h1 className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-white via-violet-100 to-violet-300 bg-clip-text text-transparent">
                {event?.name || 'Cargando evento…'}
              </h1>
              <p className="text-slate-400 mt-1 text-sm">
                Ronda {currentRound || '—'} · {stats.active} activos
                {stats.dropped > 0 && <> · <span className="text-rose-400">{stats.dropped} dropped</span></>}
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 min-w-[280px]">
              <StatCard icon={Users} label="Activos" value={stats.active} />
              <StatCard icon={Trophy} label="Líder" value={stats.leader || '—'} sub={stats.mp ? `${stats.mp} MP` : ''} />
              <StatCard icon={Zap} label="Ronda" value={currentRound || '—'} />
            </div>
          </div>

          {/* Tabs */}
          <div className="flex gap-2 mt-6">
            {TABS.map(({ id: tid, label, icon: Icon }) => (
              <button
                key={tid}
                onClick={() => setTab(tid)}
                className={clsx(
                  'px-3.5 py-1.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-all',
                  tab === tid
                    ? 'bg-violet-500/20 text-violet-100 border border-violet-400/40 shadow-lg shadow-violet-500/10'
                    : 'text-slate-400 hover:text-white hover:bg-white/5 border border-transparent'
                )}
              >
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* CONTENT */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.25 }}
        >
          {tab === 'standings' && <StandingsLive rows={standings} />}
          {tab === 'pairings' && <PairingsLive pairings={pairings} />}
          {tab === 'bracket' && <BracketSVG tree={bracket} />}
        </motion.div>
      </div>

      {/* OBS overlay link */}
      <div className="max-w-7xl mx-auto px-6 pb-12 text-center flex flex-col items-center gap-2">
        <a href={`/api/rt/overlay/events/${eventId}`} target="_blank" rel="noreferrer"
           className="inline-flex items-center gap-2 text-xs text-slate-500 hover:text-violet-300 transition">
          🎥 Abrir overlay para OBS Studio →
        </a>
        <a href={`/events/${eventId}/cinema`}
           className="inline-flex items-center gap-2 text-xs text-violet-400 hover:text-violet-200 transition">
          🎬 Cinematic Mode (fullscreen + IA narradora) →
        </a>
      </div>

      {/* Multiplayer layers */}
      <PresenceLayer peers={peers} reactions={reactions} onMouseMove={sendCursor} />
      <ReactionBar peersCount={Object.keys(peers).length} onReact={sendReaction} />
    </div>
  );
}

function StatCard({ icon: Icon, label, value, sub }) {
  return (
    <div className="rounded-xl bg-white/[0.03] border border-white/10 p-3 backdrop-blur-sm">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-500 font-semibold mb-1">
        <Icon size={11} /> {label}
      </div>
      <div className="text-lg font-bold truncate">{value}</div>
      {sub && <div className="text-[10px] text-violet-400 font-mono">{sub}</div>}
    </div>
  );
}
