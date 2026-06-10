/** Tour — recorrido guiado paso a paso + catálogo visual de features. */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Star, Compass, Crown, Cast, Cpu, Film, Trophy, Camera, ArrowLeftRight,
  Swords, Music, Layers, ShoppingBag, Zap, GitBranch, Mic, Eye, Activity,
  Award, Users, Calendar, Map, Box, Radio, Play, ChevronLeft, ChevronRight,
  PlayCircle, Grid3x3, ExternalLink, KeyRound, ArrowRight, CheckCircle2,
} from 'lucide-react';
import Navbar from '../components/Navbar';

/* ─────────────────────────  GUIDED STEPS  ───────────────────────── */

const GUIDED_STEPS = [
  {
    icon: Sparkles,
    accent: 'violet',
    chapter: 'Bienvenida',
    title: 'Bienvenido a EliteCards',
    body: 'Plataforma TCG + RPG competitiva por temporadas. 220 jugadores, 1.176 matches y 58 eventos están sembrados — todo lo que veas está corriendo con datos reales.',
    cta: null,
  },
  {
    icon: KeyRound,
    accent: 'violet',
    chapter: 'Acceso',
    title: 'Logueate como Admin',
    body: 'Usa admin@elitecards.cl / admin123 para ver todo. Si prefieres jugador, cualquier alias minúscula @elitecards.cl con password player123 (ej: shadowkaiser, pixelmage…).',
    cta: { to: '/login', label: 'Abrir Login premium' },
  },
  {
    icon: Compass,
    accent: 'amber',
    chapter: 'Identidad',
    title: 'Ruta del Campeón',
    body: 'El sistema RPG de progreso. 30 niveles repartidos en 7 rangos: Iniciado → Aprendiz → Duelista → Retador → Elite → Maestro → Campeón. Cada temporada tiene su propia EXP Elite que se reinicia.',
    cta: { to: '/ruta', label: 'Ver la Ruta' },
  },
  {
    icon: Trophy,
    accent: 'amber',
    chapter: 'Ranking',
    title: 'Temporada activa + Hall of Fame',
    body: 'Ranking competitivo de la temporada vigente y el museo de campeones históricos. Los que quedaron Maestro o Campeón en T-1 empezaron T2 como Duelista N10.',
    cta: { to: '/ranking', label: 'Ranking Temporada 3' },
  },
  {
    icon: Calendar,
    accent: 'violet',
    chapter: 'Eventos',
    title: 'Torneos suizos + Live',
    body: '58 eventos generados con pairings, standings y Glicko-2. Entra a uno en vivo y verás standings con animación FLIP y bracket SVG en tiempo real.',
    cta: { to: '/events', label: 'Lista de Eventos' },
  },
  {
    icon: Film,
    accent: 'rose',
    chapter: 'Cinematic',
    title: "Champion's Vision",
    body: '5 escenas cinematográficas con black hole shader e IA narradora. Es la mejor forma de mostrar a un campeón en pantalla grande durante una premiación.',
    cta: { to: '/players/16/vision', label: "Champion's Vision" },
  },
  {
    icon: Star,
    accent: 'amber',
    chapter: 'Wow',
    title: 'Cosmos Hall of Fame',
    body: '220 estrellas 3D distribuidas en Fibonacci sphere. El campeón vigente tiene un halo dorado. Click en cualquier estrella → perfil público de ese jugador.',
    cta: { to: '/cosmos', label: 'Entrar al Cosmos' },
  },
  {
    icon: Radio,
    accent: 'cyan',
    chapter: 'Wow',
    title: 'Holographic War Room',
    body: 'Dashboard estilo Mass Effect con scanlines CRT y 6 paneles de stats live. Pensado para monitor secundario en eventos físicos.',
    cta: { to: '/warroom', label: 'Entrar al War Room' },
  },
  {
    icon: Swords,
    accent: 'rose',
    chapter: 'Juego',
    title: 'Deck Duel Simulator',
    body: 'Dos decks enfrentándose con cartas levitando y barras de vida. Útil para warmup, contenido para redes o decidir un build-off entre jugadores.',
    cta: { to: '/duel?a=1&b=2', label: 'Iniciar Duel' },
  },
  {
    icon: ArrowLeftRight,
    accent: 'amber',
    chapter: 'Juego',
    title: 'Trade Simulator',
    body: 'Mesa partida con drag-and-drop. Cada lado calcula su balance USD en vivo usando precios reales de Scryfall. Si no hay internet, los precios quedan en cache.',
    cta: { to: '/trade?me=1&peer=2', label: 'Abrir Trade' },
  },
  {
    icon: Layers,
    accent: 'violet',
    chapter: 'Construcción',
    title: 'Deck Builder Visual',
    body: 'Autocomplete con card art de Scryfall, mana curve en tiempo real e insight con IA Claude (si tienes ANTHROPIC_API_KEY configurada).',
    cta: { to: '/decks/1/builder', label: 'Construir un deck' },
  },
  {
    icon: Camera,
    accent: 'fuchsia',
    chapter: 'Mobile',
    title: 'AR Elite ID',
    body: 'Activa la cámara del dispositivo y tu Elite ID Card aparece superpuesta en 3D. Se puede capturar como PNG para redes. Funciona mejor en móvil.',
    cta: { to: '/ar-id', label: 'Abrir AR' },
  },
  {
    icon: Music,
    accent: 'fuchsia',
    chapter: 'Mobile',
    title: 'Audio-Reactive Visualizer',
    body: 'Shader que reacciona al micrófono. Bass causa swirls, treble produce sparkles. Perfecto para tener corriendo en pantalla mientras suena la música del evento.',
    cta: { to: '/visualizer', label: 'Abrir Visualizer' },
  },
  {
    icon: Shield,
    accent: 'cyan',
    chapter: 'Admin',
    title: 'Panel de Administración',
    body: 'Configuras juegos, formatos, sets, banlist, eventos, productos, misiones, achievements, anuncios y encuestas. Todo lo que necesita el dueño del gremio.',
    cta: { to: '/admin', label: 'Ir a Admin' },
  },
  {
    icon: CheckCircle2,
    accent: 'emerald',
    chapter: 'Final',
    title: 'Listo. A jugar.',
    body: 'Tienes el Command Palette siempre a mano con Cmd/Ctrl+K. Si querés explorar todas las features, abajo está el catálogo completo. ¡A romper algunos packs!',
    cta: { to: '/dashboard', label: 'Ir a mi Dashboard' },
  },
];

/* ─────────────────────────  CATALOG  ───────────────────────── */

const SECTIONS = [
  {
    title: 'Fuera de este planeta',
    emoji: '🛸',
    subtitle: 'Las experiencias más espectaculares',
    items: [
      { to: '/cosmos', icon: Star, title: 'Cosmos Hall of Fame', desc: '220 estrellas 3D en Fibonacci sphere · campeón con halo dorado', accent: 'amber' },
      { to: '/warroom', icon: Radio, title: 'Holographic War Room', desc: 'Dashboard estilo Mass Effect · scanlines CRT · 6 paneles live', accent: 'cyan' },
      { to: '/players/16/vision', icon: Crown, title: "Champion's Vision", desc: '5 escenas con black hole shader + IA narradora', accent: 'rose' },
      { to: '/visualizer', icon: Music, title: 'Audio-Reactive Visualizer', desc: 'Shader que reacciona al micrófono · bass swirls · treble sparkles', accent: 'fuchsia' },
    ],
  },
  {
    title: 'Cinematic + 3D',
    emoji: '🎬',
    subtitle: 'Renderizado 3D con Three.js + R3F',
    items: [
      { to: '/players/16/trailer', icon: Film, title: 'Player Trailer 60s', desc: '8 escenas auto-generadas + grabación WebM descargable', accent: 'violet' },
      { to: '/events/1/cinema', icon: Film, title: 'Cinematic Tournament', desc: 'Standings full-screen con aurora shader y narrador IA', accent: 'amber' },
      { to: '/events/1/cinema-replay', icon: GitBranch, title: 'Bracket Replay 3D', desc: 'Cámara virtual recorre el bracket nodo por nodo', accent: 'violet' },
      { to: '/events/1/table', icon: Cast, title: 'Spectator Stream', desc: 'Mesa de duel 3D con cartas levitando + 2 jugadores', accent: 'cyan' },
      { to: '/decks/1/holo', icon: Cpu, title: 'Card Hologram Lab', desc: 'Holograma volumétrico Iron Man + voiceover por carta', accent: 'cyan' },
      { to: '/decks/1/showcase', icon: Sparkles, title: 'Card 3D Showcase', desc: 'Cartas con shader foil real (Fresnel + iridescence)', accent: 'fuchsia' },
    ],
  },
  {
    title: 'Torneo + Duelo',
    emoji: '🎮',
    subtitle: 'Sistema TCG completo',
    items: [
      { to: '/events', icon: Calendar, title: 'Eventos', desc: '58 torneos · 1.176 matches reales con Glicko-2', accent: 'violet' },
      { to: '/events/1/live', icon: Activity, title: 'Live Tournament', desc: 'Standings FLIP + Bracket SVG + WebSocket sync', accent: 'emerald' },
      { to: '/duel?a=1&b=2', icon: Swords, title: 'Deck Duel Simulator', desc: 'Dos decks enfrentándose con cartas levitando + life bars', accent: 'rose' },
      { to: '/leaderboard?game_id=2', icon: Trophy, title: 'Leaderboard Glicko', desc: 'Top 100 por rating · OnyxWitch95 (2049) lidera', accent: 'amber' },
    ],
  },
  {
    title: 'Decks + Catálogo',
    emoji: '🃏',
    subtitle: 'Construye y compra',
    items: [
      { to: '/decks/1/builder', icon: Layers, title: 'Deck Builder Visual', desc: 'Autocomplete con card art Scryfall + mana curve + AI insight', accent: 'violet' },
      { to: '/decks', icon: Box, title: 'Mis Decks', desc: '400 decks ejemplo con archetypes reales', accent: 'cyan' },
      { to: '/trade?me=1&peer=2', icon: ArrowLeftRight, title: 'Trade Simulator', desc: 'Mesa partida con drag-and-drop + balance USD en vivo', accent: 'amber' },
      { to: '/catalog/premium', icon: ShoppingBag, title: 'Tienda 3D Premium', desc: 'Cards con tilt 3D mouse-track + comparador de variantes', accent: 'violet' },
    ],
  },
  {
    title: 'Perfil + Identidad',
    emoji: '🚀',
    subtitle: 'Quién eres en EliteCards',
    items: [
      { to: '/profile/premium', icon: Award, title: 'Profile Premium', desc: 'Hero parallax + Glicko gauge + Skill Tree 30 niveles', accent: 'violet' },
      { to: '/ar-id', icon: Camera, title: 'AR Elite ID', desc: 'Cámara real + Elite ID Card 3D superpuesta + snapshot PNG', accent: 'fuchsia' },
      { to: '/ruta', icon: Compass, title: 'Ruta del Campeón', desc: 'Camino 30 niveles · de Iniciado a Campeón', accent: 'amber' },
      { to: '/hall-of-fame', icon: Trophy, title: 'Hall of Fame', desc: 'Campeones históricos por temporada', accent: 'amber' },
    ],
  },
  {
    title: 'Admin + Sistema',
    emoji: '🔧',
    subtitle: 'Para el dueño del gremio',
    items: [
      { to: '/admin', icon: Eye, title: 'Admin Dashboard', desc: 'Vista de administrador', accent: 'cyan' },
      { to: '/admin/games', icon: Box, title: 'Admin · Juegos', desc: 'Configurar formatos, sets, banlist', accent: 'cyan' },
      { to: '/admin/events-list', icon: Calendar, title: 'Admin · Eventos', desc: 'Listar, crear, cerrar torneos', accent: 'cyan' },
      { to: '/login', icon: Zap, title: 'Login premium', desc: 'Best login ever — aurora shader + magnetic button', accent: 'fuchsia' },
    ],
  },
];

const ACCENT = {
  violet:  { ring: 'ring-violet-500/30 hover:ring-violet-400',   text: 'text-violet-300',  bg: 'from-violet-500/20 to-violet-700/10',    glow: 'shadow-violet-500/30' },
  amber:   { ring: 'ring-amber-500/30 hover:ring-amber-400',     text: 'text-amber-300',   bg: 'from-amber-500/20 to-orange-700/10',     glow: 'shadow-amber-500/30' },
  cyan:    { ring: 'ring-cyan-500/30 hover:ring-cyan-400',       text: 'text-cyan-300',    bg: 'from-cyan-500/20 to-blue-700/10',        glow: 'shadow-cyan-500/30' },
  rose:    { ring: 'ring-rose-500/30 hover:ring-rose-400',       text: 'text-rose-300',    bg: 'from-rose-500/20 to-fuchsia-700/10',     glow: 'shadow-rose-500/30' },
  emerald: { ring: 'ring-emerald-500/30 hover:ring-emerald-400', text: 'text-emerald-300', bg: 'from-emerald-500/20 to-cyan-700/10',     glow: 'shadow-emerald-500/30' },
  fuchsia: { ring: 'ring-fuchsia-500/30 hover:ring-fuchsia-400', text: 'text-fuchsia-300', bg: 'from-fuchsia-500/20 to-violet-700/10',   glow: 'shadow-fuchsia-500/30' },
};

/* ─────────────────────────  COMPONENT  ───────────────────────── */

export default function Tour() {
  const [mode, setMode] = useState('guided'); // 'guided' | 'browse'
  const [step, setStep] = useState(0);

  const next = useCallback(() => setStep((s) => Math.min(GUIDED_STEPS.length - 1, s + 1)), []);
  const prev = useCallback(() => setStep((s) => Math.max(0, s - 1)), []);

  useEffect(() => {
    if (mode !== 'guided') return;
    const onKey = (e) => {
      if (e.key === 'ArrowRight') next();
      else if (e.key === 'ArrowLeft') prev();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode, next, prev]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-violet-950/30 text-white">
      <Navbar />

      {/* Hero */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(124,58,237,0.25),transparent_60%)] pointer-events-none" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(244,114,182,0.18),transparent_55%)] pointer-events-none" />

        <div className="relative max-w-6xl mx-auto px-6 pt-10 pb-6">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles size={14} className="text-violet-400" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-violet-300 font-bold">
              EliteCards · Master Tour
            </span>
          </div>
          <h1 className="text-4xl sm:text-6xl font-black tracking-tighter bg-gradient-to-r from-white via-violet-100 to-fuchsia-200 bg-clip-text text-transparent drop-shadow-2xl leading-none">
            Conoce la plataforma<br/>en 15 pasos.
          </h1>
          <p className="text-slate-400 mt-4 max-w-2xl text-base sm:text-lg">
            <span className="text-white font-bold">220 jugadores</span>,{' '}
            <span className="text-white font-bold">1.176 matches</span>,{' '}
            <span className="text-white font-bold">58 eventos</span> y{' '}
            <span className="text-white font-bold">362 ratings Glicko-2</span>. Hacé el tour guiado o explorá libre.
          </p>

          {/* Stats */}
          <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-3 max-w-3xl">
            <StatPill icon={Users} label="Jugadores" value="220" />
            <StatPill icon={Swords} label="Matches" value="1.176" />
            <StatPill icon={Calendar} label="Eventos" value="58" />
            <StatPill icon={Trophy} label="Ratings" value="362" />
          </div>

          {/* Mode tabs */}
          <div className="mt-8 inline-flex rounded-xl bg-white/[0.05] border border-white/10 p-1">
            <ModeTab active={mode === 'guided'} onClick={() => setMode('guided')} icon={PlayCircle}>
              Tour Guiado
            </ModeTab>
            <ModeTab active={mode === 'browse'} onClick={() => setMode('browse')} icon={Grid3x3}>
              Catálogo
            </ModeTab>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-6xl mx-auto px-6 pb-20">
        <AnimatePresence mode="wait">
          {mode === 'guided' ? (
            <motion.div
              key="guided"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <GuidedPanel step={step} setStep={setStep} next={next} prev={prev} />
            </motion.div>
          ) : (
            <motion.div
              key="browse"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <BrowsePanel />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Tips */}
        <div className="mt-12 p-6 rounded-2xl bg-white/[0.03] border border-white/10">
          <h3 className="text-sm font-bold uppercase tracking-widest text-violet-300 mb-3">⚡ Tips</h3>
          <ul className="text-sm text-slate-400 space-y-1.5 list-disc list-inside">
            <li>Pulsá <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">Cmd+K</kbd> (o <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">Ctrl+K</kbd>) en cualquier página para abrir el Command Palette.</li>
            <li>En el tour guiado, usá <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">←</kbd> / <kbd className="px-1.5 py-0.5 rounded bg-white/10 text-xs font-mono">→</kbd> para navegar.</li>
            <li>Si una página parece vacía, asegurate de estar logueado.</li>
            <li>AR, Visualizer y narrador IA piden permisos de cámara/micrófono.</li>
            <li>OBS overlay del torneo: <code className="text-cyan-300">/api/rt/overlay/events/1</code></li>
          </ul>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────  GUIDED PANEL  ───────────────────────── */

function GuidedPanel({ step, setStep, next, prev }) {
  const s = GUIDED_STEPS[step];
  const a = ACCENT[s.accent];
  const Icon = s.icon;
  const total = GUIDED_STEPS.length;
  const pct = ((step + 1) / total) * 100;

  return (
    <div>
      {/* Progress bar */}
      <div className="mt-2 mb-6">
        <div className="flex items-center justify-between mb-2 text-xs">
          <span className={`uppercase tracking-widest font-bold ${a.text}`}>{s.chapter}</span>
          <span className="text-slate-400 font-mono tabular-nums">
            {String(step + 1).padStart(2, '0')} / {String(total).padStart(2, '0')}
          </span>
        </div>
        <div className="h-1 rounded-full bg-white/[0.06] overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-violet-500 via-fuchsia-400 to-amber-300"
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ type: 'spring', stiffness: 120, damping: 20 }}
          />
        </div>
      </div>

      {/* Step card */}
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -30 }}
          transition={{ duration: 0.35 }}
          className={`relative rounded-3xl bg-gradient-to-br ${a.bg} ring-1 ${a.ring} overflow-hidden shadow-2xl ${a.glow}`}
        >
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-white/[0.04] blur-3xl pointer-events-none" />
          <div className="relative p-8 sm:p-12">
            <div className="flex items-start gap-5">
              <div className={`shrink-0 w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-black/40 backdrop-blur flex items-center justify-center ${a.text} ring-1 ring-white/10`}>
                <Icon size={28} />
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl sm:text-4xl font-black tracking-tight leading-tight">
                  {s.title}
                </h2>
                <p className="mt-3 text-slate-300 text-base sm:text-lg leading-relaxed max-w-2xl">
                  {s.body}
                </p>
                {s.cta && (
                  <Link
                    to={s.cta.to}
                    className={`mt-6 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-black/40 backdrop-blur ring-1 ${a.ring} ${a.text} font-bold text-sm hover:bg-black/60 transition`}
                  >
                    <ExternalLink size={14} /> {s.cta.label}
                    <ArrowRight size={14} />
                  </Link>
                )}
              </div>
            </div>
          </div>
        </motion.div>
      </AnimatePresence>

      {/* Controls */}
      <div className="mt-6 flex items-center justify-between gap-3">
        <button
          onClick={prev}
          disabled={step === 0}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-sm font-medium hover:bg-white/10 transition disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={16} /> Anterior
        </button>

        {/* Dots */}
        <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto no-scrollbar max-w-md">
          {GUIDED_STEPS.map((_, i) => (
            <button
              key={i}
              onClick={() => setStep(i)}
              className={`h-1.5 rounded-full transition-all ${
                i === step
                  ? 'w-6 bg-white'
                  : i < step
                  ? 'w-1.5 bg-white/60 hover:bg-white/80'
                  : 'w-1.5 bg-white/15 hover:bg-white/30'
              }`}
              aria-label={`Ir al paso ${i + 1}`}
            />
          ))}
        </div>

        {step === GUIDED_STEPS.length - 1 ? (
          <button
            onClick={() => setStep(0)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-sm font-bold hover:shadow-lg hover:shadow-violet-500/30 transition"
          >
            Reiniciar <Play size={14} />
          </button>
        ) : (
          <button
            onClick={next}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-sm font-bold hover:shadow-lg hover:shadow-violet-500/30 transition"
          >
            Siguiente <ChevronRight size={16} />
          </button>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────────  BROWSE PANEL  ───────────────────────── */

function BrowsePanel() {
  return (
    <div>
      {SECTIONS.map((sec) => (
        <motion.section
          key={sec.title}
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mt-10 first:mt-4"
        >
          <div className="mb-4 flex items-end gap-3">
            <span className="text-2xl">{sec.emoji}</span>
            <div>
              <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight">{sec.title}</h2>
              <p className="text-sm text-slate-400">{sec.subtitle}</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {sec.items.map((item, i) => {
              const a = ACCENT[item.accent];
              return (
                <motion.div
                  key={item.to}
                  initial={{ opacity: 0, y: 16 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.04 }}
                >
                  <Link
                    to={item.to}
                    className={`group relative block p-4 rounded-2xl bg-gradient-to-br ${a.bg} ring-1 ${a.ring} transition-all hover:scale-[1.025] hover:shadow-2xl overflow-hidden`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className={`w-9 h-9 rounded-xl bg-black/40 backdrop-blur flex items-center justify-center ${a.text}`}>
                        <item.icon size={16} />
                      </div>
                      <span className={`text-[9px] uppercase tracking-widest font-bold ${a.text} opacity-50 group-hover:opacity-100 transition`}>
                        OPEN →
                      </span>
                    </div>
                    <h3 className="font-bold text-base leading-tight mb-1">{item.title}</h3>
                    <p className="text-xs text-slate-400 line-clamp-2">{item.desc}</p>
                    <p className={`text-[10px] font-mono mt-2 ${a.text} opacity-50 truncate`}>
                      {item.to}
                    </p>
                  </Link>
                </motion.div>
              );
            })}
          </div>
        </motion.section>
      ))}
    </div>
  );
}

/* ─────────────────────────  PRIMITIVES  ───────────────────────── */

function ModeTab({ active, onClick, icon: Icon, children }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition ${
        active
          ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-lg shadow-violet-500/20'
          : 'text-white/60 hover:text-white'
      }`}
    >
      <Icon size={14} /> {children}
    </button>
  );
}

function StatPill({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl bg-white/[0.04] border border-white/10 p-3 backdrop-blur">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-400 font-bold mb-1">
        <Icon size={11} /> {label}
      </div>
      <div className="text-2xl font-black tabular-nums">{value}</div>
    </div>
  );
}

/* Re-export del shield para evitar imports duplicados */
function Shield({ size = 16, className = '' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>
    </svg>
  );
}
