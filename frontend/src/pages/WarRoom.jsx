/** Holographic War Room — overview dashboard "de otro planeta".
 * 6 paneles holográficos, scanlines CRT, chromatic aberration, tickers,
 * meta heatmap, top players con rating bars, activity feed live (WS),
 * minimap Cosmos embedded, bracket spectator.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Activity, Users, Swords, Trophy, Zap, Star, Compass,
  Layers, ArrowUpRight, Radio, ArrowLeft, AlertOctagon, Crown,
} from 'lucide-react';
import clsx from 'clsx';

import { api } from '../lib/api';
import AuroraShader from '../components/AuroraShader';

function classHue(c) {
  return {
    DUELISTA: 0, ESTRATEGA: 220, MENTOR: 45,
    COLECCIONISTA: 280, TRADER: 140, EXPLORADOR: 180,
  }[c] || 270;
}

function timeAgo(iso) {
  const d = new Date(iso);
  const sec = (Date.now() - d.getTime()) / 1000;
  if (sec < 60) return `${Math.floor(sec)}s`;
  if (sec < 3600) return `${Math.floor(sec / 60)}m`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h`;
  return `${Math.floor(sec / 86400)}d`;
}

export default function WarRoom() {
  const [data, setData] = useState(null);
  const [time, setTime] = useState(Date.now());
  const [glitch, setGlitch] = useState(false);

  async function refresh() {
    try {
      const r = await api.get('/cosmos/warroom');
      setData(r.data);
    } catch {}
  }

  useEffect(() => {
    refresh();
    const t = setInterval(() => setTime(Date.now()), 1000);
    const r = setInterval(refresh, 15000);
    // Glitch burst aleatorio cada 7-15s
    const g = setInterval(() => {
      setGlitch(true);
      setTimeout(() => setGlitch(false), 180);
    }, 8000 + Math.random() * 7000);
    return () => { clearInterval(t); clearInterval(r); clearInterval(g); };
  }, []);

  if (!data) return (
    <div className="fixed inset-0 bg-black text-emerald-300 font-mono flex items-center justify-center">
      <div className="text-center">
        <div className="text-xs uppercase tracking-[0.4em] mb-3 animate-pulse">SYNC // WAR_ROOM</div>
        <div className="text-[10px] text-emerald-500/60">Estableciendo enlace neuronal…</div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden font-mono">
      {/* Background aurora muy tenue */}
      <div className="absolute inset-0 opacity-25">
        <AuroraShader seed={99} colorA="#06b6d4" colorB="#000000" colorC="#a78bfa" />
      </div>

      {/* CRT scanlines */}
      <div
        className="absolute inset-0 pointer-events-none z-[1] mix-blend-overlay opacity-30"
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,255,255,0.06) 0px, rgba(255,255,255,0.06) 1px, transparent 1px, transparent 3px)',
        }}
      />
      {/* CRT curvature vignette */}
      <div className="absolute inset-0 pointer-events-none z-[2] bg-radial-vignette" style={{
        background: 'radial-gradient(ellipse at center, transparent 50%, rgba(0,0,0,0.4) 100%)',
      }} />

      {/* Chromatic aberration burst */}
      <div
        className={clsx(
          "absolute inset-0 pointer-events-none z-[3] transition-opacity duration-150",
          glitch ? "opacity-100" : "opacity-0"
        )}
        style={{
          backgroundImage:
            'repeating-linear-gradient(0deg, rgba(255,0,80,0.06) 0px, rgba(255,0,80,0.06) 2px, transparent 2px, transparent 4px), repeating-linear-gradient(0deg, transparent 0px, transparent 2px, rgba(0,255,234,0.04) 2px, rgba(0,255,234,0.04) 4px)',
          transform: glitch ? 'translateX(2px)' : undefined,
        }}
      />

      {/* HEADER */}
      <div className="relative z-10 border-b border-emerald-500/20 px-6 py-3 flex items-center justify-between bg-black/40 backdrop-blur">
        <div className="flex items-center gap-4">
          <Link to="/" className="text-emerald-300/60 hover:text-emerald-300 transition">
            <ArrowLeft size={14} />
          </Link>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_10px_rgba(34,197,94,0.8)]" />
            <span className="text-[10px] uppercase tracking-[0.4em] text-emerald-300 font-bold">
              WAR_ROOM // CALMAR.NET
            </span>
          </div>
          <span className="text-[10px] text-emerald-500/40">v0.2-elite</span>
        </div>
        <div className="flex items-center gap-6 text-[10px] uppercase tracking-widest">
          <div className="text-emerald-300/70 flex items-center gap-1.5">
            <Radio size={11} /> ENLACE ESTABLE
          </div>
          <div className="text-amber-300 tabular-nums">
            {new Date(time).toLocaleTimeString('es-CL', { hour12: false })}
          </div>
        </div>
      </div>

      {/* MAIN GRID */}
      <div className="relative z-10 h-[calc(100vh-44px)] grid grid-cols-12 grid-rows-6 gap-3 p-3">
        {/* Tickers — top row */}
        <div className="col-span-12 row-span-1 grid grid-cols-4 gap-3">
          {data.tickers.map((t, i) => (
            <TickerCard key={t.label} ticker={t} icon={[Users, Swords, Zap, Activity][i]} />
          ))}
        </div>

        {/* Top Players — col 1-4 */}
        <Panel className="col-span-12 lg:col-span-4 row-span-3" title="// TOP_RATING.LIVE" hue="violet">
          <div className="space-y-1.5">
            {data.top_players.map((tp, i) => (
              <TopPlayerRow key={tp.player_id} player={tp} rank={i + 1} />
            ))}
            {data.top_players.length === 0 && (
              <div className="text-emerald-500/40 text-xs text-center py-8">Sin ratings activos</div>
            )}
          </div>
        </Panel>

        {/* Meta Heatmap — col 5-9 */}
        <Panel className="col-span-12 lg:col-span-5 row-span-3" title="// META_PULSE.ARCHETYPES" hue="cyan">
          <MetaHeatmap meta={data.meta} />
        </Panel>

        {/* Cosmos summary — col 10-12 */}
        <Panel className="col-span-12 lg:col-span-3 row-span-3" title="// COSMOS.LINK" hue="amber" glow>
          <CosmosBeacon summary={data.cosmos_summary} />
          <Link
            to="/cosmos"
            className="mt-3 inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-amber-300 hover:text-white transition"
          >
            <Compass size={11} /> Abrir mapa estelar
            <ArrowUpRight size={11} />
          </Link>
        </Panel>

        {/* Upcoming events — col 1-6 */}
        <Panel className="col-span-12 lg:col-span-6 row-span-2" title="// EVENT_QUEUE.NEXT" hue="violet">
          <div className="space-y-1.5 max-h-full overflow-auto pr-1">
            {data.upcoming_events.map((ev, i) => (
              <EventRow key={ev.id} event={ev} index={i} />
            ))}
            {data.upcoming_events.length === 0 && (
              <div className="text-emerald-500/40 text-xs text-center py-6">Sin eventos próximos</div>
            )}
          </div>
        </Panel>

        {/* Activity feed — col 7-12 */}
        <Panel className="col-span-12 lg:col-span-6 row-span-2" title="// COMBAT_LOG.STREAM" hue="rose" glow>
          <div className="space-y-1 max-h-full overflow-auto pr-1">
            <AnimatePresence>
              {data.activity.map((a, i) => (
                <ActivityLine key={`${a.timestamp}-${i}`} item={a} idx={i} />
              ))}
            </AnimatePresence>
          </div>
        </Panel>
      </div>
    </div>
  );
}

/* ============================== Components ============================== */

function Panel({ children, title, className = '', hue = 'violet', glow = false }) {
  const colors = {
    violet: { border: 'border-violet-500/30', text: 'text-violet-300', dot: 'bg-violet-400' },
    cyan:   { border: 'border-cyan-500/30',   text: 'text-cyan-300',   dot: 'bg-cyan-400' },
    amber:  { border: 'border-amber-500/30',  text: 'text-amber-300',  dot: 'bg-amber-400' },
    rose:   { border: 'border-rose-500/30',   text: 'text-rose-300',   dot: 'bg-rose-400' },
    emerald:{ border: 'border-emerald-500/30',text: 'text-emerald-300',dot: 'bg-emerald-400' },
  }[hue];
  return (
    <div className={clsx(
      'relative bg-black/50 backdrop-blur border rounded-md p-3 overflow-hidden',
      colors.border, className,
    )}>
      {glow && (
        <div className="absolute -inset-px rounded-md pointer-events-none"
             style={{ boxShadow: `inset 0 0 30px ${hue === 'amber' ? 'rgba(251,191,36,0.1)' : hue === 'rose' ? 'rgba(244,63,94,0.1)' : 'rgba(124,58,237,0.1)'}` }} />
      )}
      {/* Corner brackets */}
      <Corner pos="tl" color={colors.text} />
      <Corner pos="tr" color={colors.text} />
      <Corner pos="bl" color={colors.text} />
      <Corner pos="br" color={colors.text} />

      <div className="flex items-center gap-2 mb-2 relative">
        <span className={clsx("w-1.5 h-1.5 rounded-full animate-pulse", colors.dot)} />
        <span className={clsx("text-[9px] uppercase tracking-[0.3em] font-bold", colors.text)}>
          {title}
        </span>
        <div className={clsx("flex-1 h-px ml-1 opacity-30", colors.dot)} />
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

function Corner({ pos, color }) {
  const cls = {
    tl: 'top-0 left-0 border-t border-l',
    tr: 'top-0 right-0 border-t border-r',
    bl: 'bottom-0 left-0 border-b border-l',
    br: 'bottom-0 right-0 border-b border-r',
  }[pos];
  return <span className={clsx("absolute w-2 h-2 pointer-events-none", cls, color)} style={{ borderColor: 'currentColor' }} />;
}

function TickerCard({ ticker, icon: Icon }) {
  const [display, setDisplay] = useState(0);
  // Count-up animation
  useEffect(() => {
    let frame;
    const start = performance.now();
    const dur = 1200;
    const from = display;
    const to = ticker.value;
    function step(now) {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (t < 1) frame = requestAnimationFrame(step);
    }
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [ticker.value]); // eslint-disable-line

  return (
    <Panel title={`// ${ticker.label.toUpperCase()}`} hue="emerald" className="row-span-1">
      <div className="flex items-center gap-3">
        <Icon size={22} className="text-emerald-300" />
        <div>
          <div className="text-3xl font-black tabular-nums text-emerald-100 leading-none">
            {display.toLocaleString('es-CL')}
          </div>
          <div className="text-[9px] text-emerald-500/60 uppercase tracking-widest mt-0.5">
            ↑ LIVE
          </div>
        </div>
      </div>
    </Panel>
  );
}

function TopPlayerRow({ player, rank }) {
  const hue = classHue(player.player_class);
  const ratingPct = Math.min(100, ((player.rating - 1300) / 1000) * 100);
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: rank * 0.04 }}
      className="relative pl-2 pr-2 py-1.5 group"
    >
      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-6 rounded-full"
           style={{ background: `hsl(${hue}, 80%, 60%)`, boxShadow: `0 0 8px hsl(${hue}, 80%, 60%)` }} />
      <div className="flex items-center gap-2 mb-0.5">
        <span className={clsx(
          "text-xs font-black tabular-nums w-5 text-center",
          rank === 1 ? "text-amber-300" : rank === 2 ? "text-slate-200" : rank === 3 ? "text-orange-300" : "text-slate-500"
        )}>
          {rank.toString().padStart(2, '0')}
        </span>
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          <span className="text-sm font-bold truncate text-white">{player.alias}</span>
          {player.championships > 0 && <Crown size={10} className="text-amber-400 shrink-0" />}
        </div>
        <span className="text-sm font-black tabular-nums" style={{ color: `hsl(${hue}, 80%, 75%)` }}>
          {Math.round(player.rating)}
        </span>
      </div>
      {/* Rating bar */}
      <div className="h-px bg-white/5 ml-7 relative">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${ratingPct}%` }}
          transition={{ duration: 0.8, delay: rank * 0.04 }}
          className="absolute inset-y-0 left-0 h-px"
          style={{ background: `linear-gradient(to right, hsl(${hue}, 80%, 50%), hsl(${hue}, 80%, 70%))`, boxShadow: `0 0 4px hsl(${hue}, 80%, 60%)` }}
        />
      </div>
      <div className="ml-7 mt-0.5 flex items-center gap-2 text-[9px] text-slate-500 uppercase tracking-widest">
        <span>{player.matches}m</span>
        <span>·</span>
        <span>{player.player_class.slice(0, 4)}</span>
        <span>·</span>
        <span className="font-mono">{player.elite_id_code.slice(-8)}</span>
      </div>
    </motion.div>
  );
}

function MetaHeatmap({ meta }) {
  if (!meta.length) {
    return <div className="text-cyan-500/40 text-xs text-center py-8">Sin datos del meta</div>;
  }
  const maxCount = Math.max(...meta.map(m => m.deck_count));
  return (
    <div className="grid grid-cols-3 gap-1.5 mt-1">
      {meta.map((m, i) => {
        const heat = m.deck_count / maxCount;
        return (
          <motion.div
            key={`${m.archetype}-${m.game_id}`}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.04 }}
            className="relative aspect-square rounded-sm p-2 border overflow-hidden"
            style={{
              background: `linear-gradient(135deg, hsla(190, 85%, ${20 + heat * 30}%, 0.6), hsla(220, 85%, ${10 + heat * 20}%, 0.4))`,
              borderColor: `hsla(190, 85%, ${40 + heat * 30}%, ${0.4 + heat * 0.4})`,
              boxShadow: heat > 0.6 ? `0 0 12px hsla(190, 85%, 50%, ${heat * 0.4})` : undefined,
            }}
          >
            <div className="absolute top-1 right-1 text-[9px] tabular-nums font-black text-cyan-100">
              {m.deck_count}
            </div>
            <div className="text-[10px] font-bold leading-tight text-cyan-100 line-clamp-2 mb-1">
              {m.archetype}
            </div>
            <div className="absolute bottom-1.5 left-1.5 right-1.5 text-[9px] text-cyan-500/70 uppercase tracking-widest truncate">
              {m.game_name.split(' ')[0]}
            </div>
            {/* Heat bar */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5"
                 style={{ background: `linear-gradient(to right, hsl(190, 85%, 70%) ${heat * 100}%, transparent ${heat * 100}%)` }} />
          </motion.div>
        );
      })}
    </div>
  );
}

function CosmosBeacon({ summary }) {
  return (
    <div className="space-y-3">
      <div className="text-center pt-2">
        <div className="text-5xl font-black tabular-nums bg-gradient-to-b from-amber-200 to-amber-500 bg-clip-text text-transparent">
          {summary.total_stars}
        </div>
        <div className="text-[9px] uppercase tracking-[0.3em] text-amber-300/60">
          ★ ESTRELLAS REGISTRADAS
        </div>
      </div>
      {/* Mini constellation visual */}
      <svg viewBox="0 0 100 60" className="w-full h-14">
        {Array.from({ length: 24 }).map((_, i) => {
          const angle = (i / 24) * Math.PI * 2;
          const r = 18 + (i % 3) * 8;
          const cx = 50 + Math.cos(angle) * r;
          const cy = 30 + Math.sin(angle) * r * 0.5;
          return (
            <g key={i}>
              <circle cx={cx} cy={cy} r={0.6 + (i % 4) * 0.3} fill={i % 5 === 0 ? "#fbbf24" : "#a78bfa"}
                      opacity={0.4 + (i % 4) * 0.15} />
            </g>
          );
        })}
        {/* Conexiones */}
        {Array.from({ length: 6 }).map((_, i) => {
          const a = (i / 6) * Math.PI * 2;
          return (
            <line
              key={`l${i}`}
              x1={50 + Math.cos(a) * 18}
              y1={30 + Math.sin(a) * 9}
              x2={50 + Math.cos(a + 0.7) * 30}
              y2={30 + Math.sin(a + 0.7) * 15}
              stroke="rgba(167,139,250,0.3)"
              strokeWidth="0.2"
            />
          );
        })}
      </svg>
      <div className="grid grid-cols-2 gap-2 text-center">
        <div className="rounded bg-amber-500/5 border border-amber-500/15 p-1.5">
          <div className="text-base font-black tabular-nums text-amber-200">{summary.champion_count}</div>
          <div className="text-[8px] uppercase text-amber-500/60 tracking-widest">Coronas</div>
        </div>
        <div className="rounded bg-amber-500/5 border border-amber-500/15 p-1.5">
          <div className="text-base font-black tabular-nums text-amber-200">{summary.edges}</div>
          <div className="text-[8px] uppercase text-amber-500/60 tracking-widest">Conexiones</div>
        </div>
      </div>
    </div>
  );
}

function EventRow({ event, index }) {
  const t = new Date(event.starts_at);
  const isUrgent = (t.getTime() - Date.now()) < 3600000 * 6 && (t.getTime() - Date.now()) > 0;
  return (
    <motion.div
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.04 }}
      className={clsx(
        "flex items-center gap-3 px-2 py-1.5 rounded border",
        isUrgent ? "bg-rose-500/5 border-rose-500/30 text-rose-200" : "bg-violet-500/5 border-violet-500/15 text-violet-100"
      )}
    >
      <div className={clsx("text-[9px] uppercase tracking-widest font-bold w-12 text-center",
        isUrgent ? "text-rose-400" : "text-violet-400"
      )}>
        {t.toLocaleDateString('es-CL', { day: '2-digit', month: 'short' })}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-semibold truncate">{event.name}</div>
        <div className="text-[9px] text-slate-500 uppercase tracking-widest">
          {event.game_name} · {event.registered}/{event.slots} slots
        </div>
      </div>
      <div className={clsx("text-[9px] uppercase tracking-widest font-bold",
        isUrgent ? "text-rose-400" : "text-emerald-400"
      )}>
        {event.status}
      </div>
    </motion.div>
  );
}

function ActivityLine({ item, idx }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: idx * 0.03 }}
      className="flex items-baseline gap-2 text-xs py-1 border-b border-rose-500/5 last:border-b-0"
    >
      <span className="text-rose-400/60 font-mono text-[9px] tabular-nums shrink-0">
        T-{timeAgo(item.timestamp)}
      </span>
      <span className="text-rose-300/40 shrink-0 text-[9px]">›</span>
      <span className="text-slate-300 truncate">{item.summary}</span>
    </motion.div>
  );
}
