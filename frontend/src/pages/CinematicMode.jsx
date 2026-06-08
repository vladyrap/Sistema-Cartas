/** Modo Cinematic fullscreen para streaming/eventos.
 * Aurora shader background, podio 3D al finalizar, IA narradora con voz,
 * standings + bracket alternando con scroll automático. */
import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX, Maximize, Mic2 } from 'lucide-react';

import { api } from '../lib/api';
import { useWebSocket } from '../lib/useWebSocket';
import { useNarrator } from '../lib/useNarrator';
import AuroraShader from '../components/AuroraShader';
import Podium3D from '../components/Podium3D';

export default function CinematicMode() {
  const { id } = useParams();
  const eventId = Number(id);

  const [event, setEvent] = useState(null);
  const [standings, setStandings] = useState([]);
  const [finished, setFinished] = useState(false);
  const [view, setView] = useState('standings'); // standings | finishing
  const narrator = useNarrator();
  const lastNarratedRef = useRef(0);

  const token = typeof window !== 'undefined' ? localStorage.getItem('ec_access_token') : null;
  const wsPath = token
    ? `/api/rt/ws/events/${eventId}?token=${encodeURIComponent(token)}`
    : `/api/rt/ws/events/${eventId}`;
  const { lastMessage, status: wsStatus } = useWebSocket(wsPath);

  async function refresh() {
    try {
      const [eRes, sRes] = await Promise.all([
        api.get(`/events/${eventId}`),
        api.get(`/events/${eventId}/standings`),
      ]);
      setEvent(eRes.data);
      setStandings(sRes.data || []);
      if (eRes.data?.status === 'FINISHED') {
        setFinished(true);
        setView('finishing');
      }
    } catch {}
  }
  useEffect(() => { refresh(); }, [eventId]);

  // WS bound
  useEffect(() => {
    if (!lastMessage) return;
    const { type } = lastMessage;
    if (['match_reported', 'standings_updated', 'round_started', 'player_dropped'].includes(type)) {
      api.get(`/events/${eventId}/standings`).then(r => setStandings(r.data || []));
    }
    if (type === 'event_finalized') {
      setFinished(true);
      setView('finishing');
    }
    // Narrate (con throttling 3s)
    const now = Date.now();
    if (narrator.enabled && now - lastNarratedRef.current > 3000) {
      lastNarratedRef.current = now;
      narrateEvent(lastMessage).catch(() => {});
    }
  }, [lastMessage]); // eslint-disable-line

  async function narrateEvent(evt) {
    try {
      const top3 = standings.slice(0, 3).map(s => ({ alias: s.alias, mp: s.match_points }));
      const r = await api.post('/ai/narrate-event', {
        event: evt,
        context: { top3, total_active: standings.filter(s => !s.dropped).length },
      });
      if (r.data?.text) narrator.speak(r.data.text);
    } catch {}
  }

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.();
    } else {
      document.exitFullscreen?.();
    }
  }

  const top3 = standings.slice(0, 3);

  return (
    <div className="fixed inset-0 bg-slate-950 text-white overflow-hidden">
      {/* Aurora background WebGL */}
      <div className="absolute inset-0">
        <AuroraShader
          seed={(eventId * 17) % 100}
          colorA={finished ? '#fbbf24' : '#7c3aed'}
          colorB="#0b0b14"
          colorC={finished ? '#f97316' : '#22d3ee'}
        />
      </div>

      {/* Overlay gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-black/70 pointer-events-none" />

      {/* HUD top */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-start justify-between p-8 pointer-events-none">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <div className="flex items-center gap-3 mb-2">
            <span className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-black/40 backdrop-blur border border-white/10">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shadow-lg shadow-rose-500/50" />
              <span className="text-xs font-bold tracking-widest uppercase">EN VIVO</span>
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {wsStatus === 'open' ? '● Sync' : '○ ' + wsStatus}
            </span>
          </div>
          <h1 className="text-6xl font-black bg-gradient-to-r from-white via-violet-100 to-fuchsia-200 bg-clip-text text-transparent drop-shadow-2xl">
            {event?.name || 'Cargando…'}
          </h1>
          <p className="text-slate-400 mt-1 tracking-widest text-sm uppercase">
            {event?.event_type} · {standings.filter(s => !s.dropped).length} jugadores activos
          </p>
        </motion.div>

        <div className="flex gap-2 pointer-events-auto">
          <Btn onClick={() => narrator.setEnabled(v => !v)} title={narrator.enabled ? 'Silenciar narradora' : 'Activar narradora IA'}>
            {narrator.enabled ? <Mic2 size={16} className="text-emerald-400" /> : <Mic2 size={16} className="text-slate-400" />}
          </Btn>
          <Btn onClick={toggleFullscreen} title="Fullscreen">
            <Maximize size={16} />
          </Btn>
        </div>
      </div>

      {/* MAIN: standings o podio */}
      <div className="absolute inset-0 z-10 flex items-center justify-center pointer-events-none">
        <AnimatePresence mode="wait">
          {view === 'standings' && (
            <motion.div
              key="standings"
              initial={{ opacity: 0, y: 30 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -30 }}
              transition={{ duration: 0.6 }}
              className="w-full max-w-3xl mx-auto px-12 pt-20"
            >
              <ol className="space-y-2">
                {standings.slice(0, 10).map((s, i) => (
                  <motion.li
                    key={s.player_id}
                    layout
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.05 }}
                    className={`flex items-center gap-4 px-5 py-3 rounded-2xl backdrop-blur-md border ${
                      s.rank === 1 ? 'bg-amber-500/15 border-amber-400/40 shadow-2xl shadow-amber-500/20'
                      : s.rank === 2 ? 'bg-slate-300/10 border-slate-300/30'
                      : s.rank === 3 ? 'bg-orange-500/10 border-orange-400/30'
                      : 'bg-black/30 border-white/10'
                    }`}
                  >
                    <div className={`text-4xl font-black tabular-nums w-12 text-center ${
                      s.rank === 1 ? 'text-amber-300' :
                      s.rank === 2 ? 'text-slate-200' :
                      s.rank === 3 ? 'text-orange-300' : 'text-slate-500'
                    }`}>
                      {s.rank}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-2xl font-bold truncate">{s.alias}</div>
                      <div className="text-xs text-slate-500 font-mono">{s.elite_id_code}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-3xl font-black tabular-nums text-violet-300">{s.match_points}</div>
                      <div className="text-[10px] uppercase tracking-wider text-slate-500">MP</div>
                    </div>
                    <div className="text-sm text-slate-400 font-mono text-right hidden sm:block">
                      {s.rounds_won}-{s.rounds_lost}{s.rounds_draw > 0 && `-${s.rounds_draw}`}
                      <div className="text-[10px] text-slate-600">OMW {(s.omw * 100).toFixed(0)}%</div>
                    </div>
                  </motion.li>
                ))}
              </ol>
            </motion.div>
          )}

          {view === 'finishing' && (
            <motion.div
              key="finishing"
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 1 }}
              className="w-full h-full flex flex-col items-center justify-center"
            >
              <motion.h2
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-7xl font-black mb-4 bg-gradient-to-r from-amber-300 via-orange-400 to-rose-400 bg-clip-text text-transparent drop-shadow-2xl"
              >
                CAMPEÓN
              </motion.h2>
              <div className="w-full max-w-3xl h-[480px]">
                <Podium3D top3={top3} />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* HUD bottom */}
      <div className="absolute bottom-6 inset-x-0 z-20 flex items-center justify-center pointer-events-none">
        <div className="px-4 py-2 rounded-full bg-black/40 backdrop-blur border border-white/10 text-xs text-slate-400 flex items-center gap-3">
          <span>Cinematic Mode</span>
          <span className="opacity-50">·</span>
          <span>Evento #{eventId}</span>
          {narrator.enabled && (
            <>
              <span className="opacity-50">·</span>
              <span className="text-emerald-300 flex items-center gap-1">
                <Volume2 size={11} /> Narradora IA
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Btn({ children, onClick, title }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="p-2.5 rounded-xl bg-black/40 backdrop-blur border border-white/10 hover:bg-white/10 transition"
    >
      {children}
    </button>
  );
}
