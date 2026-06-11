import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Radio, Trophy, Users, Star, Flame } from 'lucide-react';
import { api } from '../lib/api';

/** Kiosko TV — pantalla rotativa fullscreen para el local.
 *  Rota cada 12s: pairings → standings → MVP QR → hype.
 *  Sin navbar, sin auth, pensado para Smart TV / monitor. */
export default function Kiosk() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const [hype, setHype] = useState([]);
  const [picks, setPicks] = useState(null);
  const [view, setView] = useState(0);

  const load = async () => {
    try {
      const r = await api.get(`/tour-flow/events/${id}/spectate`);
      setData(r.data);
      if (r.data.current_round > 0) {
        api.get(`/meta/events/${id}/picks/${r.data.current_round}`).then(x => setPicks(x.data)).catch(() => {});
      }
      api.get(`/tour-univ/events/${id}/hype?limit=5`).then(x => setHype(x.data || [])).catch(() => {});
    } catch {}
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    const rot = setInterval(() => setView(v => (v + 1) % 4), 12000);
    return () => { clearInterval(t); clearInterval(rot); };
  }, [id]);

  if (!data) {
    return <div className="min-h-screen bg-bg grid place-items-center text-white/40">Conectando…</div>;
  }

  const min = data.timer ? Math.floor(data.timer.remaining_seconds / 60) : null;
  const voteUrl = `${window.location.origin}/events/${id}/spectate`;
  const qr = `https://api.qrserver.com/v1/create-qr-code/?size=380x380&margin=12&data=${encodeURIComponent(voteUrl)}`;

  return (
    <div className="min-h-screen bg-bg text-white overflow-hidden aurora-bg">
      {/* Header fijo */}
      <div className="flex items-center justify-between px-10 py-6">
        <div>
          <div className="flex items-center gap-2 text-sm uppercase tracking-[0.3em] text-violet-300">
            <Radio size={16} className="text-rose-400 animate-pulse" /> EliteCards Live
          </div>
          <h1 className="font-display text-4xl font-black">{data.event_name}</h1>
        </div>
        {data.timer && (
          <div className={`rounded-3xl px-10 py-5 border-2 ${min < 5 ? 'border-rose-400/60 bg-rose-500/15' : 'border-emerald-400/40 bg-emerald-500/10'}`}>
            <div className="text-xs uppercase tracking-widest text-white/50 text-center">Ronda {data.current_round}</div>
            <div className={`font-mono text-7xl font-black tabular-nums ${min < 5 ? 'text-rose-300' : ''}`}>
              {String(min).padStart(2, '0')}:{String(data.timer.remaining_seconds % 60).padStart(2, '0')}
            </div>
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={view} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -40 }} transition={{ duration: 0.5 }}
          className="px-10 pb-10">

          {view === 0 && (
            <div>
              <h2 className="text-lg uppercase tracking-widest text-white/40 mb-4 flex items-center gap-2">
                <Users size={18} /> Pairings — Ronda {data.current_round}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                {data.pairings.slice(0, 12).map((p, i) => (
                  <div key={i} className={`rounded-xl p-4 flex items-center gap-4 text-xl ${p.reported ? 'bg-white/[0.03]' : 'glass border border-violet-400/30'}`}>
                    <span className="w-12 h-12 rounded-lg bg-white/5 grid place-items-center font-mono font-black text-violet-300 text-2xl">{p.table_number ?? '–'}</span>
                    <span className={`font-bold truncate ${p.winner_alias === p.player_a_alias ? 'text-emerald-300' : ''}`}>{p.player_a_alias}</span>
                    <span className="text-white/30">vs</span>
                    <span className={`font-bold truncate ${p.winner_alias === p.player_b_alias ? 'text-emerald-300' : ''}`}>{p.player_b_alias || 'BYE'}</span>
                    {p.reported && <span className="ml-auto font-mono text-white/50">{p.games_a}-{p.games_b}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === 1 && (
            <div>
              <h2 className="text-lg uppercase tracking-widest text-white/40 mb-4 flex items-center gap-2">
                <Trophy size={18} /> Standings
              </h2>
              <div className="grid grid-cols-2 gap-x-8 gap-y-2">
                {data.standings.slice(0, 16).map((s, i) => (
                  <div key={s.alias} className={`flex items-center gap-4 px-4 py-2.5 rounded-lg text-xl ${i === 0 ? 'bg-amber-500/15' : i < 8 ? 'bg-emerald-500/5' : ''}`}>
                    <span className="font-mono font-black text-white/40 w-8">{s.rank}</span>
                    <span className="font-bold flex-1 truncate">{i === 0 && '👑 '}{s.alias}</span>
                    <span className="font-mono font-black text-violet-300">{s.match_points}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {view === 2 && (
            <div className="grid grid-cols-2 gap-10 items-center">
              <div>
                <h2 className="text-lg uppercase tracking-widest text-fuchsia-300 mb-3 flex items-center gap-2">
                  <Star size={18} /> Votá al MVP de la ronda
                </h2>
                <p className="text-2xl text-white/70 mb-6">Escaneá el QR con tu celular y elegí tu jugador destacado.</p>
                {picks?.leaderboard?.slice(0, 5).map((l, i) => (
                  <div key={l.player_id} className="flex justify-between text-xl py-1.5">
                    <span className={i === 0 ? 'text-fuchsia-200 font-bold' : 'text-white/70'}>{i === 0 && '👑 '}{l.alias}</span>
                    <span className="font-mono text-white/50">{l.votes} votos</span>
                  </div>
                ))}
              </div>
              <div className="grid place-items-center">
                <div className="bg-white rounded-3xl p-5">
                  <img src={qr} alt="QR votar" className="w-72 h-72" />
                </div>
              </div>
            </div>
          )}

          {view === 3 && (
            <div>
              <h2 className="text-lg uppercase tracking-widest text-rose-300 mb-4 flex items-center gap-2">
                <Flame size={18} /> Hype del torneo
              </h2>
              <div className="space-y-4 max-w-3xl">
                {hype.map(h => (
                  <div key={h.id} className="glass rounded-2xl p-5 text-2xl leading-relaxed">
                    "{h.content}"
                    <div className="text-sm text-white/40 mt-2">— {h.author_alias || 'EliteCards'} · 🔥 {h.reactions_count}</div>
                  </div>
                ))}
                {!hype.length && <div className="text-white/30 text-xl">El hype se construye match a match…</div>}
              </div>
            </div>
          )}
        </motion.div>
      </AnimatePresence>

      {/* Dots de rotación */}
      <div className="fixed bottom-6 left-1/2 -translate-x-1/2 flex gap-2">
        {[0, 1, 2, 3].map(i => (
          <div key={i} className={`w-2.5 h-2.5 rounded-full transition ${view === i ? 'bg-violet-400' : 'bg-white/15'}`} />
        ))}
      </div>
    </div>
  );
}
