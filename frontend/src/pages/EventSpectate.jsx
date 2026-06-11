import { useEffect, useState, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Clock, Trophy, Users, Tv, Radio, Pause, Star } from 'lucide-react';
import toast from 'react-hot-toast';
import { api } from '../lib/api';

const MODE_BADGES = {
  GAUNTLET:          { label: 'Gauntlet',          emoji: '🜂', color: 'amber' },
  QUALIFIER:         { label: 'Qualifier',         emoji: '🎫', color: 'cyan' },
  LAST_MAN_STANDING: { label: 'Last Man Standing', emoji: '💀', color: 'rose' },
  BOUNTY_BRACKET:    { label: 'Bounty Bracket',    emoji: '💰', color: 'yellow' },
};

export default function EventSpectate() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [specialMode, setSpecialMode] = useState(null);
  const [tick, setTick] = useState(0);
  const tickerRef = useRef(0);

  useEffect(() => {
    api.get(`/api/competitive/events/${id}/special-mode`)
      .then(r => setSpecialMode(r.data?.mode || null))
      .catch(() => {});
  }, [id]);

  const load = async () => {
    try {
      const r = await api.get(`/api/tour-flow/events/${id}/spectate`);
      setData(r.data);
    } catch (e) {
      // mostrar nada si falla — vista pública, no leakeamos detalles
    }
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [id]);

  useEffect(() => {
    const t = setInterval(() => {
      tickerRef.current += 1;
      setTick(tickerRef.current);
    }, 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (!data?.event_id) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/api/rt/ws/events/${data.event_id}`);
    ws.onmessage = (ev) => {
      try {
        const m = JSON.parse(ev.data);
        if (['match_reported', 'standings_updated', 'round_started', 'pairing_swapped', 'timer_event'].includes(m.type)) {
          load();
        }
      } catch {}
    };
    return () => ws.close();
  }, [data?.event_id]);

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 text-white grid place-items-center">
        <div className="flex flex-col items-center gap-3">
          <Tv className="animate-pulse text-violet-400" size={40} />
          <p className="text-white/40 text-sm uppercase tracking-widest">Cargando spectator…</p>
        </div>
      </div>
    );
  }

  const min = data.timer ? Math.floor(data.timer.remaining_seconds / 60) : 0;
  const sec = data.timer ? data.timer.remaining_seconds % 60 : 0;
  const lowTime = data.timer && data.timer.remaining_seconds < 300 && !data.timer.is_paused;

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-violet-950/30 to-slate-950 text-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <header className="flex items-center justify-between mb-8">
          <div>
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.3em] text-violet-300/80 mb-1">
              <Radio size={14} className="text-rose-400 animate-pulse" /> Live spectator
            </div>
            <h1 className="text-4xl font-black bg-gradient-to-r from-white via-violet-200 to-fuchsia-200 bg-clip-text text-transparent">
              {data.event_name}
            </h1>
            <p className="text-white/50 text-sm mt-1">
              Ronda {data.current_round} · {data.total_active} de {data.total_registered} activos · {data.status}
            </p>
            {specialMode && MODE_BADGES[specialMode] && (
              <span className={`inline-flex items-center gap-1.5 mt-2 px-3 py-1 rounded-full text-xs font-bold bg-${MODE_BADGES[specialMode].color}-500/20 border border-${MODE_BADGES[specialMode].color}-400/40 text-${MODE_BADGES[specialMode].color}-200`}>
                {MODE_BADGES[specialMode].emoji} {MODE_BADGES[specialMode].label}
              </span>
            )}
          </div>
          {data.timer && (
            <motion.div
              animate={lowTime ? { scale: [1, 1.04, 1] } : {}}
              transition={{ repeat: Infinity, duration: 1 }}
              className={`rounded-3xl px-8 py-4 border ${
                data.timer.is_paused
                  ? 'bg-amber-500/20 border-amber-400/40'
                  : lowTime
                  ? 'bg-rose-500/20 border-rose-400/40'
                  : 'bg-emerald-500/15 border-emerald-400/30'
              }`}
            >
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-white/60 mb-1">
                {data.timer.is_paused ? <Pause size={12} /> : <Clock size={12} />}
                Ronda {data.timer.round_number}
              </div>
              <div className={`text-5xl font-black font-mono tabular-nums ${
                lowTime && !data.timer.is_paused ? 'text-rose-300' : 'text-white'
              }`}>
                {String(min).padStart(2, '0')}:{String(sec).padStart(2, '0')}
              </div>
            </motion.div>
          )}
        </header>

        <div className="grid lg:grid-cols-2 gap-6">
          <section>
            <h2 className="text-sm uppercase tracking-wider text-white/40 mb-3 flex items-center gap-2">
              <Users size={14} /> Pairings — Ronda {data.current_round}
            </h2>
            <div className="space-y-2">
              {data.pairings.map((p, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.02 }}
                  className={`rounded-xl border p-3 flex items-center gap-4 ${
                    p.reported
                      ? 'bg-slate-900/40 border-white/5'
                      : 'bg-violet-500/10 border-violet-400/30'
                  }`}
                >
                  <div className="w-10 h-10 rounded-lg bg-white/5 grid place-items-center font-mono font-bold text-violet-300">
                    {p.table_number ?? '–'}
                  </div>
                  <div className="flex-1 min-w-0 flex items-center gap-3">
                    <span className={`font-bold truncate ${p.winner_alias === p.player_a_alias ? 'text-emerald-300' : 'text-white'}`}>
                      {p.player_a_alias}
                    </span>
                    {p.is_bye ? (
                      <span className="text-xs uppercase tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300">bye</span>
                    ) : (
                      <>
                        <span className="text-white/40">vs</span>
                        <span className={`font-bold truncate ${p.winner_alias === p.player_b_alias ? 'text-emerald-300' : 'text-white'}`}>
                          {p.player_b_alias}
                        </span>
                      </>
                    )}
                  </div>
                  {p.reported ? (
                    <div className="font-mono font-bold text-sm">
                      <span className={p.winner_alias === p.player_a_alias ? 'text-emerald-400' : 'text-white/40'}>
                        {p.games_a}
                      </span>
                      <span className="text-white/30">-</span>
                      <span className={p.winner_alias === p.player_b_alias ? 'text-emerald-400' : 'text-white/40'}>
                        {p.games_b}
                      </span>
                      {p.is_draw && <span className="ml-2 text-amber-300 text-xs">draw</span>}
                    </div>
                  ) : (
                    <span className="text-xs uppercase tracking-wider text-violet-300 animate-pulse">en juego</span>
                  )}
                </motion.div>
              ))}
              {!data.pairings.length && (
                <div className="text-center py-12 text-white/40 text-sm border border-dashed border-white/10 rounded-xl">
                  Sin pairings activos
                </div>
              )}
            </div>
          </section>

          <section>
            <h2 className="text-sm uppercase tracking-wider text-white/40 mb-3 flex items-center gap-2">
              <Trophy size={14} /> Standings vivo
            </h2>
            <div className="rounded-2xl border border-white/10 bg-slate-900/40 overflow-hidden">
              <div className="grid grid-cols-[40px_1fr_60px_60px_60px_60px] gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-white/40 border-b border-white/5 font-bold">
                <div>#</div>
                <div>Jugador</div>
                <div className="text-right" title="Match Points">MP</div>
                <div className="text-right" title="Opponent Match Win %">OMW</div>
                <div className="text-right" title="Game Win %">GW</div>
                <div className="text-right" title="Opponent Game Win %">OGW</div>
              </div>
              {data.standings.map((s, i) => (
                <motion.div
                  key={s.alias}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: i * 0.015 }}
                  className={`grid grid-cols-[40px_1fr_60px_60px_60px_60px] gap-2 px-3 py-2 text-sm border-b border-white/5 last:border-b-0 ${
                    i === 0 ? 'bg-amber-500/10' : i < 8 ? 'bg-emerald-500/5' : ''
                  } ${s.dropped ? 'opacity-40 line-through' : ''}`}
                >
                  <div className="font-mono font-bold text-white/60">{s.rank}</div>
                  <div className="truncate">{s.alias}</div>
                  <div className="text-right font-mono font-bold text-violet-300">{s.match_points}</div>
                  <div className="text-right font-mono text-white/60 text-xs">{(s.omw * 100).toFixed(1)}</div>
                  <div className="text-right font-mono text-white/60 text-xs">{(s.gw * 100).toFixed(1)}</div>
                  <div className="text-right font-mono text-white/60 text-xs">{(s.ogw * 100).toFixed(1)}</div>
                </motion.div>
              ))}
              {!data.standings.length && (
                <div className="text-center py-12 text-white/40 text-sm">Sin standings aún</div>
              )}
            </div>
            <p className="text-[10px] text-white/30 mt-2 text-right">
              MP = Match Points · OMW = Opp. Match Win% · GW = Game Win% · OGW = Opp. Game Win%
            </p>

            {data.current_round > 0 && (
              <MvpPicks eventId={data.event_id} round={data.current_round} pairings={data.pairings} />
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

function MvpPicks({ eventId, round, pairings }) {
  const [picks, setPicks] = useState(null);
  const [voting, setVoting] = useState(false);

  const load = async () => {
    try {
      const r = await api.get(`/api/meta/events/${eventId}/picks/${round}`);
      setPicks(r.data);
    } catch {}
  };
  useEffect(() => {
    load();
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [eventId, round]);

  // Jugadores votables: los de la ronda actual (sin byes, sin duplicados)
  const players = [];
  const seen = new Set();
  for (const p of pairings || []) {
    for (const alias of [p.player_a_alias, p.player_b_alias]) {
      if (alias && !seen.has(alias)) { seen.add(alias); players.push(alias); }
    }
  }
  // Mapeo alias → player_id no viene en spectate pairings; usamos el leaderboard
  // de standings que sí trae rank pero tampoco id… El endpoint de votos necesita id.
  // Solución: votamos vía leaderboard del propio picks si existe, sino pedimos standings.
  const [registry, setRegistry] = useState([]);
  useEffect(() => {
    api.get(`/api/events/${eventId}/standings`)
      .then(r => setRegistry(r.data || []))
      .catch(() => {});
  }, [eventId]);

  const vote = async (playerId) => {
    setVoting(true);
    try {
      await api.post(`/api/meta/events/${eventId}/picks/${round}`, { picked_player_id: playerId });
      toast.success('Voto MVP registrado ⭐');
      load();
    } catch (e) {
      if (e.response?.status === 401) toast.error('Iniciá sesión para votar');
      else toast.error(e.response?.data?.detail || 'Error al votar');
    } finally { setVoting(false); }
  };

  const maxVotes = Math.max(1, ...(picks?.leaderboard || []).map(l => l.votes));

  return (
    <div className="mt-6 rounded-2xl border border-fuchsia-400/20 bg-slate-900/40 overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5 bg-fuchsia-500/10 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-fuchsia-300 font-bold flex items-center gap-1.5">
          <Star size={12} /> MVP Ronda {round}
        </span>
        <span className="text-[10px] font-mono text-white/40">{picks?.total_votes || 0} votos</span>
      </div>

      {picks?.leaderboard?.length > 0 && (
        <div className="px-4 py-3 space-y-2 border-b border-white/5">
          {picks.leaderboard.slice(0, 5).map((l, i) => (
            <div key={l.player_id}>
              <div className="flex justify-between text-xs mb-0.5">
                <span className={i === 0 ? 'text-fuchsia-200 font-bold' : 'text-white/70'}>
                  {i === 0 && '👑 '}{l.alias}
                </span>
                <span className="font-mono text-white/50">{l.votes}</span>
              </div>
              <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full bg-gradient-to-r from-fuchsia-500 to-violet-500"
                     style={{ width: `${(l.votes / maxVotes) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 py-3">
        <div className="text-[10px] text-white/40 mb-2">Votá tu MVP (requiere login):</div>
        <div className="flex flex-wrap gap-1.5">
          {registry.filter(s => !s.dropped).slice(0, 16).map(s => (
            <button
              key={s.player_id}
              onClick={() => vote(s.player_id)}
              disabled={voting}
              className="px-2.5 py-1 rounded-full text-[11px] bg-white/5 hover:bg-fuchsia-500/30 hover:text-fuchsia-100 text-white/60 transition disabled:opacity-40"
            >
              {s.alias}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
