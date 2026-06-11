import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Sparkles, Trophy, Zap, Flame, Calendar, Crown, Swords,
  ChevronLeft, ChevronRight, Share2, Home,
} from 'lucide-react';
import Navbar from '../components/Navbar';
import AuthGuard from '../components/AuthGuard';
import { api } from '../lib/api';

const ACCENT = {
  violet:  { bg: 'from-violet-600 to-fuchsia-800',     text: 'text-white' },
  amber:   { bg: 'from-amber-500 to-orange-700',       text: 'text-amber-50' },
  cyan:    { bg: 'from-cyan-600 to-blue-800',          text: 'text-cyan-50' },
  rose:    { bg: 'from-rose-600 to-fuchsia-800',       text: 'text-rose-50' },
  emerald: { bg: 'from-emerald-600 to-cyan-800',       text: 'text-emerald-50' },
  fuchsia: { bg: 'from-fuchsia-600 to-violet-800',     text: 'text-fuchsia-50' },
};

export default function Wrapped() {
  return (
    <AuthGuard feature="tu Wrapped EliteCards" returnUrl="/wrapped" accent="fuchsia">
      <WrappedContent />
    </AuthGuard>
  );
}

function WrappedContent() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [slide, setSlide] = useState(0);
  const [searchParams] = useSearchParams();
  const seasonId = searchParams.get('season');

  useEffect(() => {
    const url = '/wrapped/me' + (seasonId ? `?season_id=${seasonId}` : '');
    api.get(url)
      .then((r) => setData(r.data))
      .catch((e) => setError(e?.response?.data?.detail || 'No pudimos generar tu Wrapped'));
  }, [seasonId]);

  useEffect(() => {
    const onKey = (e) => {
      if (!data) return;
      if (e.key === 'ArrowRight') setSlide((s) => Math.min(slides.length - 1, s + 1));
      if (e.key === 'ArrowLeft') setSlide((s) => Math.max(0, s - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="max-w-2xl mx-auto px-6 py-20 text-center">
          <p className="text-rose-400">{error}</p>
          <Link to="/dashboard" className="mt-6 inline-flex items-center gap-2 text-violet-300 hover:text-white">
            <Home size={16} /> Volver al dashboard
          </Link>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="max-w-2xl mx-auto px-6 py-20 text-center text-slate-400">
          Calculando tu Wrapped…
        </div>
      </div>
    );
  }

  const slides = buildSlides(data);
  const current = slides[slide];
  const accent = ACCENT[current.accent] || ACCENT.violet;
  const isLast = slide === slides.length - 1;

  return (
    <div className="min-h-screen bg-black text-white relative overflow-hidden">
      <Navbar />

      <div className="max-w-3xl mx-auto px-6 py-10">
        {/* Progress dots */}
        <div className="flex gap-1.5 mb-6">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => setSlide(i)}
              className={`h-1 rounded-full transition-all ${
                i === slide ? 'flex-1 bg-white' : 'flex-1 bg-white/15 hover:bg-white/30'
              }`}
              aria-label={`Slide ${i + 1}`}
            />
          ))}
        </div>

        {/* Slide */}
        <div className="relative" style={{ aspectRatio: '9/16', maxHeight: '75vh' }}>
          <AnimatePresence mode="wait">
            <motion.div
              key={slide}
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 1.05, y: -20 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
              className={`absolute inset-0 rounded-3xl bg-gradient-to-br ${accent.bg} ${accent.text} p-8 sm:p-12 overflow-hidden flex flex-col justify-between shadow-2xl`}
            >
              <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-white/10 blur-3xl pointer-events-none" />
              <div className="absolute -bottom-20 -left-20 w-64 h-64 rounded-full bg-black/30 blur-3xl pointer-events-none" />

              {/* Top brand */}
              <div className="relative flex items-center gap-2 opacity-80">
                <Sparkles size={14} />
                <span className="text-[10px] uppercase tracking-[0.5em] font-bold">
                  Wrapped {data.season_name}
                </span>
              </div>

              {/* Body */}
              <div className="relative">
                {current.icon && (
                  <div className="mb-6">
                    <current.icon size={48} className="opacity-90" />
                  </div>
                )}
                {current.kicker && (
                  <div className="text-sm sm:text-base uppercase tracking-widest font-bold opacity-80 mb-3">
                    {current.kicker}
                  </div>
                )}
                <h2 className="text-5xl sm:text-7xl font-black tracking-tighter leading-[0.95] mb-4">
                  {current.headline}
                </h2>
                {current.subtitle && (
                  <p className="text-lg sm:text-xl opacity-90 max-w-md leading-snug">
                    {current.subtitle}
                  </p>
                )}
              </div>

              {/* Footer */}
              <div className="relative flex items-center justify-between text-xs opacity-60">
                <span>{data.player_alias}</span>
                <span>{slide + 1} / {slides.length}</span>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Controls */}
        <div className="mt-6 flex items-center justify-between">
          <button
            onClick={() => setSlide(Math.max(0, slide - 1))}
            disabled={slide === 0}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-sm hover:bg-white/10 transition disabled:opacity-30"
          >
            <ChevronLeft size={16} /> Anterior
          </button>

          {isLast ? (
            <div className="flex gap-2">
              <button
                onClick={() => setSlide(0)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/[0.05] border border-white/10 text-sm hover:bg-white/10 transition"
              >
                Ver de nuevo
              </button>
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-sm font-bold hover:shadow-lg transition"
              >
                <Home size={14} /> Dashboard
              </Link>
            </div>
          ) : (
            <button
              onClick={() => setSlide(Math.min(slides.length - 1, slide + 1))}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white text-sm font-bold hover:shadow-lg transition"
            >
              Siguiente <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function buildSlides(d) {
  const fmt = (n) => Number(n).toLocaleString('es-CL');
  const slides = [
    {
      accent: 'violet',
      kicker: 'Tu temporada',
      headline: `Hola, ${d.player_alias}.`,
      subtitle: `Acá está tu resumen de ${d.season_name}.`,
      icon: Sparkles,
    },
    {
      accent: 'cyan',
      kicker: 'Matches jugados',
      headline: d.matches_played ? `${d.matches_played}` : '0',
      subtitle: d.matches_played
        ? `Disputaste ${d.matches_played} ${d.matches_played === 1 ? 'partida' : 'partidas'} esta temporada.`
        : 'No jugaste ninguna partida competitiva. El año que viene es tuyo.',
      icon: Swords,
    },
    {
      accent: 'emerald',
      kicker: 'Win rate',
      headline: `${d.win_rate}%`,
      subtitle: `${d.matches_won} victorias, ${d.matches_lost} derrotas${d.matches_drawn ? `, ${d.matches_drawn} empates` : ''}.`,
      icon: Trophy,
    },
    {
      accent: 'amber',
      kicker: 'Racha más larga',
      headline: `${d.longest_streak}`,
      subtitle: d.longest_streak >= 5
        ? '¡Imparable! Eventos consecutivos asistidos en racha.'
        : 'Algunos jugadores estiraron rachas de 15+. ¿Podés batirlos?',
      icon: Flame,
    },
    {
      accent: 'fuchsia',
      kicker: 'EXP ganada',
      headline: fmt(d.exp_total),
      subtitle: `Suficiente para escalar varios niveles de la Ruta del Campeón.`,
      icon: Zap,
    },
  ];

  // Eventos asistidos
  slides.push({
    accent: 'violet',
    kicker: 'Eventos asistidos',
    headline: `${d.events_attended}`,
    subtitle: d.events_attended
      ? `Participaste en ${d.events_attended} ${d.events_attended === 1 ? 'evento' : 'eventos'}.`
      : 'Cero eventos. Te perdiste de la acción.',
    icon: Calendar,
  });

  // Best match
  if (d.best_match && d.best_match.opponent_alias) {
    slides.push({
      accent: 'rose',
      kicker: 'Tu mejor partido',
      headline: `vs ${d.best_match.opponent_alias}`,
      subtitle: d.best_match.event_name
        ? `En "${d.best_match.event_name}". El día que jugaste a otro nivel.`
        : 'Tu match más sólido de la temporada.',
      icon: Swords,
    });
  }

  // Ranking
  if (d.rank_position) {
    slides.push({
      accent: 'amber',
      kicker: 'Posición final',
      headline: `#${d.rank_position}`,
      subtitle: d.rank_position === 1
        ? '¡Cabeza con precio! Sos el campeón.'
        : d.rank_position <= 10
        ? 'Top 10. Élite real.'
        : d.rank_position <= 50
        ? 'Top 50. Buen pelaje.'
        : 'Cada temporada se empieza de cero. Hay revancha.',
      icon: Crown,
    });
  }

  // Final
  slides.push({
    accent: 'fuchsia',
    kicker: 'Y entonces…',
    headline: d.headline,
    subtitle: 'Compartí tu Wrapped y arrancá la próxima temporada con todo.',
    icon: Sparkles,
  });

  return slides;
}
