import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight, Calendar, Sparkles, Trophy, LogIn, Users, Layers,
  ScanLine, Activity, Zap, ShoppingBag, GitBranch, Brain, ChevronRight,
} from 'lucide-react';
import { api } from '../lib/api';

const fadeUp = {
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.6, ease: [0.16, 1, 0.3, 1] },
};

export default function Landing() {
  const [games, setGames] = useState([]);
  const [stats, setStats] = useState(null);
  const [cardOfDay, setCardOfDay] = useState(null);

  useEffect(() => {
    api.get('/games').then((r) => setGames(r.data || [])).catch(() => setGames([]));
    api.get('/card-of-day/today').then((r) => setCardOfDay(r.data)).catch(() => {});
    // Stats agregados (matches/eventos/players)
    Promise.all([
      api.get('/rankings/active').then((r) => r.data).catch(() => null),
      api.get('/events', { params: { limit: 1 } }).then((r) => r.data).catch(() => null),
    ]).then(([ranking, evs]) => {
      setStats({
        players: ranking?.rows?.length || 0,
        season: ranking?.season_name || null,
      });
    });
  }, []);

  return (
    <div className="min-h-screen bg-bg text-white overflow-x-hidden">
      {/* Top bar */}
      <header className="absolute top-0 inset-x-0 z-30">
        <div className="max-w-6xl mx-auto px-6 py-5 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-elite-violet to-elite-blue flex items-center justify-center">
              <Sparkles size={14} className="text-white" />
            </div>
            <span className="font-display font-bold tracking-tight">EliteCards</span>
          </Link>
          <div className="flex items-center gap-2">
            <Link to="/login" className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-white/80 hover:text-white hover:bg-white/5 border border-white/10 transition">
              <LogIn size={14} /> Iniciar sesión
            </Link>
            <Link to="/register" className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-gradient-to-r from-elite-violet to-elite-blue text-white hover:shadow-glow-violet transition">
              Crear cuenta
            </Link>
          </div>
        </div>
      </header>

      {/* HERO TCG */}
      <section className="relative min-h-screen flex items-center justify-center px-6 py-24">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(124,92,255,0.18),transparent_60%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(77,163,255,0.12),transparent_60%)] pointer-events-none" />

        <div className="relative max-w-6xl mx-auto grid md:grid-cols-[1.4fr_1fr] gap-12 items-center">
          <div>
            <motion.div {...fadeUp} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/5 border border-white/10 mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] tracking-[0.3em] uppercase text-white/70">
                {stats?.season || 'Plataforma competitiva TCG'}
              </span>
            </motion.div>

            <motion.h1
              {...fadeUp}
              transition={{ ...fadeUp.transition, delay: 0.05 }}
              className="font-display font-extrabold text-5xl md:text-7xl leading-[1.02] tracking-tighter"
            >
              Tu liga.<br />
              Tus mazos.<br />
              <span className="bg-gradient-to-r from-elite-violet via-elite-blue to-elite-magenta bg-clip-text text-transparent">
                Tu ranking.
              </span>
            </motion.h1>

            <motion.p {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.15 }} className="text-lg md:text-xl text-white/70 mt-6 max-w-2xl leading-relaxed">
              Torneos suizos, brackets en vivo y rating <span className="text-elite-blue font-semibold">Glicko-2</span> para <span className="text-white font-semibold">Magic</span>, <span className="text-white font-semibold">Pokémon</span>, <span className="text-white font-semibold">Yu-Gi-Oh!</span>, <span className="text-white font-semibold">One Piece</span> y más. Todo en un solo lugar.
            </motion.p>

            <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.25 }} className="flex flex-col sm:flex-row gap-3 mt-8">
              <Link to="/register" className="group inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-elite-violet to-elite-blue text-white font-semibold hover:shadow-glow-violet transition">
                Crear cuenta gratis
                <ArrowRight size={18} className="group-hover:translate-x-1 transition-transform" />
              </Link>
              <Link to="/events" className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-white/5 border border-white/10 text-white font-semibold hover:bg-white/10 transition">
                <Calendar size={18} /> Próximos torneos
              </Link>
            </motion.div>

            <motion.div {...fadeUp} transition={{ ...fadeUp.transition, delay: 0.35 }} className="mt-6 text-xs text-white/40 inline-flex items-center gap-2">
              <span>¿Ya tienes cuenta?</span>
              <Link to="/login" className="text-elite-blue hover:text-white">Iniciar sesión →</Link>
            </motion.div>
          </div>

          {/* Card of the Day showcase */}
          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.4 }}
            className="hidden md:block relative"
          >
            <CardShowcase card={cardOfDay} />
          </motion.div>
        </div>
      </section>

      {/* GAMES SUPPORTED */}
      <section className="border-t border-white/5 py-16 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-10">
            <p className="text-[10px] uppercase tracking-[0.4em] text-white/40 font-bold mb-2">Soportamos</p>
            <h2 className="text-2xl md:text-3xl font-display font-bold">Los juegos que jugás.</h2>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
            {/* Hardcoded list — los seedeados + integrados via Scanner */}
            {[
              { name: 'Magic: The Gathering', short: 'MTG', tier: 'core' },
              { name: 'Pokémon TCG', short: 'PKM', tier: 'core' },
              { name: 'Yu-Gi-Oh!', short: 'YGO', tier: 'core' },
              { name: 'One Piece Card Game', short: 'OP', tier: 'core' },
              { name: 'Union Arena', short: 'UA', tier: 'core' },
              { name: 'Digimon Card Game', short: 'DGM', tier: 'core' },
            ].map((g, i) => (
              <motion.div
                key={g.short}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.04 }}
                className="p-4 rounded-xl bg-bg-surface border border-bg-border text-center hover:border-elite-violet/40 hover:bg-bg-elevated transition"
              >
                <div className="text-2xl font-black bg-gradient-to-br from-elite-violet to-elite-blue bg-clip-text text-transparent">
                  {g.short}
                </div>
                <div className="text-[10px] text-white/50 mt-1 truncate">{g.name}</div>
              </motion.div>
            ))}
          </div>
          {games.length > 0 && (
            <p className="text-center text-[10px] text-white/30 mt-4 font-mono">
              + {games.length} formatos sembrados en la plataforma
            </p>
          )}
        </div>
      </section>

      {/* FEATURES TCG-FIRST */}
      <section className="border-t border-white/5 py-20 px-6">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <p className="text-[10px] uppercase tracking-[0.4em] text-white/40 font-bold mb-2">Para jugar en serio</p>
            <h2 className="text-3xl md:text-4xl font-display font-bold">Herramientas de torneo profesional.</h2>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <Feature
              icon={Trophy}
              title="Torneo Suizo"
              desc="Pairings automáticos con tiebreakers OMW/GW/OGW%. Reporte de matches en 1 click."
            />
            <Feature
              icon={Activity}
              title="Rating Glicko-2"
              desc="Sistema de rating profesional por juego. RD adaptable. Tu skill se mide con la matemática que usan los pros."
            />
            <Feature
              icon={GitBranch}
              title="Brackets en vivo"
              desc="Single-elim con seeding desde standings. Visualización SVG cinematic. Reporte en tiempo real."
            />
            <Feature
              icon={ScanLine}
              title="Card Scanner"
              desc="Lookup instantáneo en Scryfall, Pokémon TCG, YGOPRODeck. Precios TCGPlayer + CLP estimado."
            />
            <Feature
              icon={Layers}
              title="Deck Builder"
              desc="Editor con autocomplete + mana curve + validación contra formato. Sync con archetype + DNA del deck."
            />
            <Feature
              icon={ShoppingBag}
              title="Catálogo & Reservas"
              desc="Sobres, decks, singles, accesorios. Pagos con MercadoPago. Wishlist con alerta de stock."
            />
            <Feature
              icon={Brain}
              title="IA táctica"
              desc="Coach IA, deck analyzer, smack talk generator. Claude detrás de cada herramienta."
            />
            <Feature
              icon={Sparkles}
              title="+15 features locas"
              desc="Cardgrave, Time-Lapse, Quantum Deck, Constellation Map, Card Drama, Tornado of Fate…"
            />
          </div>
        </div>
      </section>

      {/* MOCK LIVE TOURNAMENT */}
      <section className="border-t border-white/5 py-20 px-6 bg-gradient-to-b from-transparent to-bg-surface/40">
        <div className="max-w-6xl mx-auto grid md:grid-cols-[1fr_1.3fr] gap-10 items-center">
          <div>
            <div className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-emerald-500/15 border border-emerald-500/30 mb-4">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] uppercase tracking-widest text-emerald-300 font-bold">Live</span>
            </div>
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-3">Standings + Bracket en vivo.</h2>
            <p className="text-white/60 leading-relaxed mb-5">
              Reportá una ronda y los standings se reordenan animados. El bracket avanza solo.
              Espectadores ven todo vía WebSocket en tiempo real.
            </p>
            <Link to="/events" className="inline-flex items-center gap-2 text-elite-blue hover:text-white font-semibold">
              Ver torneos abiertos <ChevronRight size={16} />
            </Link>
          </div>
          <MockLiveStandings />
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="border-t border-white/5 py-20 px-6 text-center">
        <h2 className="text-4xl md:text-5xl font-display font-extrabold tracking-tight mb-4">
          Empezá a competir.
        </h2>
        <p className="text-white/60 max-w-xl mx-auto mb-8">
          Crear cuenta es gratis. Un solo registro para todos los juegos. Tu Elite ID te identifica en cada torneo.
        </p>
        <Link to="/register" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-xl bg-gradient-to-r from-elite-violet to-elite-blue text-white font-semibold hover:shadow-glow-violet transition">
          Crear cuenta gratis
          <ArrowRight size={18} />
        </Link>
      </section>

      <footer className="border-t border-white/5 py-8 px-6 text-center text-xs text-white/30 font-mono">
        EliteCards · Plataforma competitiva TCG · Chile
      </footer>
    </div>
  );
}

function Feature({ icon: Icon, title, desc }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="p-5 rounded-xl bg-bg-surface border border-bg-border hover:border-elite-violet/40 transition"
    >
      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-elite-violet/30 to-elite-blue/20 ring-1 ring-elite-violet/30 flex items-center justify-center text-elite-violet mb-3">
        <Icon size={16} />
      </div>
      <h3 className="font-bold text-sm mb-1">{title}</h3>
      <p className="text-xs text-white/55 leading-snug">{desc}</p>
    </motion.div>
  );
}

function CardShowcase({ card }) {
  return (
    <div className="relative">
      <motion.div
        animate={{ y: [0, -8, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
        className="relative mx-auto w-full max-w-xs rounded-2xl bg-gradient-to-br from-violet-600 via-fuchsia-700 to-violet-950 ring-2 ring-violet-500/60 p-4 shadow-2xl shadow-violet-500/30"
        style={{ aspectRatio: '63/88' }}
      >
        <div className="absolute inset-0 rounded-2xl bg-[radial-gradient(circle_at_30%_20%,rgba(255,255,255,0.2),transparent_60%)] pointer-events-none" />

        {/* Header */}
        <div className="flex justify-between items-start mb-2">
          <div className="font-black text-base text-white drop-shadow-md leading-tight">
            {card?.name || 'Card of the Day'}
          </div>
          <div className="text-xs font-mono text-white/80 whitespace-nowrap">
            {card?.mana_cost || '—'}
          </div>
        </div>

        {/* Art placeholder */}
        <div className="relative rounded-lg bg-black/40 ring-1 ring-white/10 aspect-[4/3] mb-2 flex items-center justify-center overflow-hidden">
          <Sparkles size={40} className="text-violet-300 opacity-50" />
          {card?.art_prompt && (
            <div className="absolute bottom-2 left-2 right-2 text-[8px] text-white/50 leading-tight line-clamp-2">
              {card.art_prompt}
            </div>
          )}
        </div>

        <div className="text-[10px] font-bold text-white/80 uppercase mb-2">
          {card?.card_type || 'Generada por IA'}
        </div>

        <div className="text-[10px] text-white/70 bg-black/30 rounded p-1.5 leading-snug min-h-[48px]">
          {card?.text || 'Una carta nueva cada día. Generada por Claude AI.'}
        </div>

        {card?.flavor && (
          <div className="text-[9px] italic text-white/50 mt-2 leading-tight line-clamp-2">
            "{card.flavor}"
          </div>
        )}

        <div className="absolute bottom-3 right-3 text-[9px] uppercase tracking-widest text-white/40 font-bold">
          {card?.rarity || 'mythic'}
        </div>
      </motion.div>

      <div className="text-center mt-4">
        <p className="text-[10px] text-white/40 uppercase tracking-widest font-bold">Card of the Day</p>
        <Link to="/card-of-day" className="text-xs text-violet-300 hover:text-white">Ver carta del día →</Link>
      </div>
    </div>
  );
}

function MockLiveStandings() {
  const rows = [
    { rank: 1, alias: 'PixelMage', archetype: 'UW Control', rating: 1980, mp: 12 },
    { rank: 2, alias: 'ShadowKaiser', archetype: 'Mono-Red', rating: 1932, mp: 12 },
    { rank: 3, alias: 'OnyxWitch95', archetype: 'Gruul Stompy', rating: 1898, mp: 9 },
    { rank: 4, alias: 'PhantomRider', archetype: 'Esper Midrange', rating: 1854, mp: 9 },
    { rank: 5, alias: 'RagnarSteel', archetype: 'Boros Burn', rating: 1810, mp: 6 },
  ];
  return (
    <div className="rounded-2xl bg-black/40 ring-1 ring-white/10 backdrop-blur overflow-hidden">
      <div className="px-4 py-3 border-b border-white/5 bg-white/[0.03] flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-emerald-300 font-bold flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" /> Standings live
        </span>
        <span className="text-[10px] font-mono text-white/40">Ronda 4/5</span>
      </div>
      <table className="w-full text-sm">
        <thead className="bg-white/[0.02]">
          <tr className="text-left text-[9px] tracking-widest uppercase text-white/40">
            <th className="px-3 py-2 w-8">#</th>
            <th className="px-3 py-2">Jugador</th>
            <th className="px-3 py-2 hidden sm:table-cell">Archetype</th>
            <th className="px-3 py-2 text-right">Rating</th>
            <th className="px-3 py-2 text-right">MP</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <motion.tr
              key={r.alias}
              initial={{ opacity: 0, x: -10 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.6 + i * 0.08 }}
              className="border-t border-white/[0.04]"
            >
              <td className="px-3 py-2 font-mono">
                <span className={r.rank === 1 ? 'text-amber-300' : r.rank === 2 ? 'text-slate-300' : r.rank === 3 ? 'text-orange-400' : 'text-white/50'}>
                  {r.rank}
                </span>
              </td>
              <td className="px-3 py-2 font-semibold">{r.alias}</td>
              <td className="px-3 py-2 text-xs text-white/60 hidden sm:table-cell">{r.archetype}</td>
              <td className="px-3 py-2 text-right font-mono text-violet-300">{r.rating}</td>
              <td className="px-3 py-2 text-right font-mono font-bold">{r.mp}</td>
            </motion.tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
