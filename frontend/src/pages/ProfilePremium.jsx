/** Profile premium: hero parallax + Glicko gauge animado + Skill Tree Ruta +
 * timeline de matches + deck gallery con card flip 3D.
 */
import { useEffect, useState } from 'react';
import { motion, useScroll, useTransform } from 'framer-motion';
import { Sparkles, Trophy, Zap, Calendar, Award, Layers } from 'lucide-react';

import { api } from '../lib/api';
import GlickoGauge from '../components/GlickoGauge';
import SkillTreeRuta from '../components/SkillTreeRuta';
import IdentityBackground from '../components/IdentityBackground';

export default function ProfilePremium() {
  const [user, setUser] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [decks, setDecks] = useState([]);
  const [season, setSeason] = useState(null);
  const [achievements, setAchievements] = useState([]);
  const [activeRatingIdx, setActiveRatingIdx] = useState(0);

  // Parallax para el hero
  const { scrollY } = useScroll();
  const heroY = useTransform(scrollY, [0, 400], [0, 100]);
  const heroOpacity = useTransform(scrollY, [0, 300], [1, 0.3]);

  useEffect(() => {
    (async () => {
      try {
        const [me, rt, dk, sp, ach] = await Promise.all([
          api.get('/auth/me'),
          api.get('/ratings/me').catch(() => ({ data: [] })),
          api.get('/decks/me').catch(() => ({ data: [] })),
          api.get('/seasons/active/me').catch(() => ({ data: null })),
          api.get('/gamification/achievements/me').catch(() => ({ data: [] })),
        ]);
        setUser(me.data);
        setRatings(rt.data);
        setDecks(dk.data);
        setSeason(sp.data);
        setAchievements(ach.data);
      } catch {}
    })();
  }, []);

  if (!user) return <div className="min-h-screen flex items-center justify-center text-slate-400">Cargando…</div>;
  const p = user.profile;
  const currentRating = ratings[activeRatingIdx];

  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-hidden relative">
      {/* Identity Background único por jugador */}
      <IdentityBackground seedKey={p?.elite_id_code || 'anon'} opacity={0.45} />
      {/* HERO PARALLAX */}
      <motion.div
        className="relative h-[55vh] min-h-[420px] overflow-hidden"
        style={{ y: heroY, opacity: heroOpacity }}
      >
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_40%,rgba(124,58,237,0.35),transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_60%,rgba(244,114,182,0.25),transparent_55%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_100%,rgba(34,211,238,0.2),transparent_50%)]" />
        {/* Estrellas */}
        {Array.from({ length: 60 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0 }}
            animate={{ opacity: Math.random() * 0.7 + 0.3 }}
            transition={{ delay: i * 0.02, duration: 1 }}
            className="absolute w-0.5 h-0.5 bg-white rounded-full"
            style={{
              left: `${(i * 173) % 100}%`,
              top: `${(i * 211) % 100}%`,
              boxShadow: '0 0 4px rgba(255,255,255,0.8)',
            }}
          />
        ))}

        <div className="relative h-full max-w-6xl mx-auto px-6 flex flex-col justify-end pb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <div className="flex items-center gap-2 mb-3">
              <Sparkles size={14} className="text-violet-400" />
              <span className="text-[10px] uppercase tracking-widest text-violet-300 font-bold">
                {p?.player_class} · {p?.elite_id_code}
              </span>
            </div>
            <h1 className="text-5xl sm:text-7xl font-black bg-gradient-to-r from-white via-violet-100 to-fuchsia-200 bg-clip-text text-transparent">
              {p?.alias}
            </h1>
            {p?.full_name && (
              <p className="text-xl text-slate-400 mt-2">{p.full_name}</p>
            )}
            {p?.bio && (
              <p className="text-sm text-slate-500 mt-3 max-w-2xl italic">{p.bio}</p>
            )}
          </motion.div>
        </div>
      </motion.div>

      <div className="max-w-6xl mx-auto px-6 pb-16 -mt-12 relative z-10 space-y-8">
        {/* GLICKO + ESTADÍSTICAS BASE */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-6">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-slate-900/80 to-slate-950 p-6 backdrop-blur"
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-violet-300 font-bold">
                <Trophy size={11} /> Glicko-2 Rating
              </div>
              {ratings.length > 1 && (
                <select
                  value={activeRatingIdx}
                  onChange={e => setActiveRatingIdx(Number(e.target.value))}
                  className="text-xs bg-slate-800 border border-white/10 rounded px-2 py-1"
                >
                  {ratings.map((r, i) => <option key={i} value={i}>Juego #{r.game_id}</option>)}
                </select>
              )}
            </div>
            {currentRating ? (
              <GlickoGauge rating={currentRating.rating} rd={currentRating.rd} peak={currentRating.peak_rating} />
            ) : (
              <div className="text-center text-slate-500 text-sm py-10">
                Aún no jugaste eventos ranked. Anótate a uno COMPETITIVE para empezar a ratear.
              </div>
            )}
            {currentRating && (
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <Mini label="Partidas" value={currentRating.matches_played} />
                <Mini label="Pico" value={Math.round(currentRating.peak_rating)} />
              </div>
            )}
          </motion.div>

          {/* TEMPORADA */}
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="rounded-2xl border border-white/5 bg-gradient-to-br from-slate-900/60 to-slate-950 p-6 backdrop-blur"
          >
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-amber-300 font-bold mb-3">
              <Zap size={11} /> Temporada actual
            </div>
            {season ? (
              <>
                <div className="flex items-end justify-between mb-3">
                  <div>
                    <div className="text-6xl font-black bg-gradient-to-r from-amber-300 to-orange-500 bg-clip-text text-transparent">
                      {season.level}
                    </div>
                    <div className="text-xs text-slate-400 mt-1">{season.current_rank}</div>
                  </div>
                  <div className="text-right text-xs">
                    <div className="text-slate-500">EXP total</div>
                    <div className="font-bold tabular-nums text-lg">{season.exp_total?.toLocaleString()}</div>
                  </div>
                </div>
                <div className="h-2 bg-black/40 rounded-full overflow-hidden mb-2">
                  <motion.div
                    className="h-full bg-gradient-to-r from-violet-500 to-fuchsia-500"
                    initial={{ width: 0 }}
                    animate={{ width: `${(season.exp_in_level / Math.max(1, season.exp_in_level + 100)) * 100}%` }}
                    transition={{ duration: 1.2, ease: 'easeOut' }}
                  />
                </div>
              </>
            ) : (
              <p className="text-slate-500 text-sm">Sin progreso de temporada activa</p>
            )}
            {p?.prestige > 0 && (
              <div className="mt-4 flex items-center gap-2 text-sm">
                <Sparkles size={14} className="text-fuchsia-400" />
                <span className="text-slate-400">Prestigio:</span>
                <span className="font-bold text-fuchsia-300 tabular-nums">{p.prestige}</span>
              </div>
            )}
          </motion.div>
        </div>

        {/* SKILL TREE RUTA */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-violet-300 font-bold mb-3">
            <Layers size={11} /> Ruta del Campeón
          </div>
          <SkillTreeRuta currentLevel={season?.level || 1} currentExp={season?.exp_total || 0} />
        </motion.div>

        {/* DECK GALLERY 3D */}
        {decks.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-violet-300 font-bold mb-3">
              <Layers size={11} /> Decks · {decks.length}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {decks.slice(0, 9).map((d, i) => <DeckCard3D key={d.id} deck={d} idx={i} />)}
            </div>
          </motion.div>
        )}

        {/* ACHIEVEMENT SHOWCASE */}
        {achievements.length > 0 && (
          <motion.div
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center gap-2 text-[10px] uppercase tracking-widest text-amber-300 font-bold mb-3">
              <Award size={11} /> Medallas · {achievements.length}
            </div>
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
              {achievements.slice(0, 12).map((a, i) => (
                <motion.div
                  key={a.id || i}
                  initial={{ scale: 0, rotate: -10 }}
                  whileInView={{ scale: 1, rotate: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.05, type: 'spring' }}
                  whileHover={{ y: -4, rotate: 5 }}
                  className="aspect-square rounded-xl bg-gradient-to-br from-amber-500/20 to-orange-700/20 border border-amber-500/30 flex flex-col items-center justify-center p-2 cursor-pointer"
                  title={a.description}
                >
                  <Trophy size={22} className="text-amber-400 mb-1" />
                  <div className="text-[9px] text-center font-semibold text-amber-200 leading-tight">
                    {a.name || a.code}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value }) {
  return (
    <div className="bg-black/30 rounded-lg p-2 text-center">
      <div className="text-[9px] uppercase text-slate-500">{label}</div>
      <div className="text-lg font-bold tabular-nums">{value}</div>
    </div>
  );
}

function DeckCard3D({ deck, idx }) {
  const [flipped, setFlipped] = useState(false);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: idx * 0.08 }}
      whileHover={{ y: -6, scale: 1.02 }}
      onClick={() => setFlipped(!flipped)}
      className="relative cursor-pointer h-44 [perspective:1000px]"
    >
      <motion.div
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.6 }}
        className="relative w-full h-full [transform-style:preserve-3d]"
      >
        {/* Front */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-slate-800 via-violet-900/40 to-slate-950 border border-white/10 p-4 [backface-visibility:hidden]">
          <div className="flex items-center gap-1 text-[9px] uppercase tracking-widest text-violet-300 font-bold mb-1">
            <Layers size={9} /> {deck.game_name}
          </div>
          <h3 className="text-lg font-bold mb-1 line-clamp-2">{deck.name}</h3>
          {deck.archetype && <p className="text-xs text-slate-400">{deck.archetype}</p>}
          <div className="absolute bottom-3 left-4 right-4 flex items-center justify-between text-xs">
            <span className="text-slate-500">{deck.main_count} cartas</span>
            {deck.is_legal === true && <span className="text-emerald-400">✓ Legal</span>}
            {deck.is_legal === false && <span className="text-rose-400">⚠ Issues</span>}
          </div>
        </div>
        {/* Back */}
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-violet-900/80 to-slate-950 border border-violet-400/30 p-4 [backface-visibility:hidden] [transform:rotateY(180deg)] flex flex-col justify-center">
          <div className="text-xs text-violet-300 font-semibold mb-2">Detalles</div>
          {deck.format_name && <Detail label="Formato" value={deck.format_name} />}
          {deck.leader_card && <Detail label="Líder" value={deck.leader_card} />}
          <Detail label="Main / Side / Extra" value={`${deck.main_count} / ${deck.side_count} / ${deck.extra_count}`} />
          <a href={`/decks/${deck.id}/builder`} onClick={e => e.stopPropagation()}
             className="mt-3 text-xs text-violet-300 hover:text-white underline">
            Abrir builder →
          </a>
        </div>
      </motion.div>
    </motion.div>
  );
}

function Detail({ label, value }) {
  return (
    <div className="text-xs mb-1">
      <span className="text-slate-500">{label}: </span>
      <span className="text-white font-medium">{value}</span>
    </div>
  );
}
