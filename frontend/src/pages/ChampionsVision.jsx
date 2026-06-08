/** "Champion's Vision" — secuencia cinematográfica audiovisual del campeón.
 *
 * Escenas (auto-progresan con timing musical):
 *   0. Black void + título glitch
 *   1. Aurora shift + stats reveladas con typewriter
 *   2. Black hole shader con nombre del campeón girando en el horizonte
 *   3. Crescendo + glitch máximo + flash
 *   4. Confeti 3D + nombre dorado pulsante + créditos
 *
 * Música procedural sync con escenas (sin samples).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Volume2, VolumeX, SkipForward, X, Crown, Sparkles } from 'lucide-react';

import { api } from '../lib/api';
import AuroraShader from '../components/AuroraShader';
import BlackHoleShader from '../components/BlackHoleShader';
import GlitchOverlay from '../components/GlitchOverlay';
import Confetti3D from '../components/Confetti3D';
import { useProceduralMusic } from '../lib/useProceduralMusic';

const SCENES = [
  { id: 0, duration: 4000, label: 'Ignition'    },
  { id: 1, duration: 7000, label: 'Genesis'     },
  { id: 2, duration: 9000, label: 'Singularity' },
  { id: 3, duration: 4000, label: 'Collapse'    },
  { id: 4, duration: 12000, label: 'Champion'   },
];

export default function ChampionsVision() {
  const { id } = useParams();
  const playerId = Number(id);

  const [player, setPlayer] = useState(null);
  const [ratings, setRatings] = useState([]);
  const [season, setSeason] = useState(null);
  const [scene, setScene] = useState(0);
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const sceneTimerRef = useRef(null);
  const music = useProceduralMusic();

  useEffect(() => {
    Promise.all([
      api.get(`/players/${playerId}/public`).catch(() => api.get(`/auth/me`)),
      api.get(`/cosmos`).catch(() => ({ data: { stars: [] } })),
    ]).then(([pRes, cRes]) => {
      // Tenemos pRes con perfil o con .data.profile si fue /auth/me
      const data = pRes.data?.profile || pRes.data;
      setPlayer(data);
      const star = cRes.data.stars?.find(s => s.player_id === playerId);
      if (star) {
        setRatings([{ rating: star.rating, championships: star.championships, matches: star.matches }]);
      }
    });
    api.get('/seasons/active/me').catch(() => null).then(r => r && setSeason(r.data));
  }, [playerId]);

  function progressTo(idx) {
    setScene(idx);
    if (idx === 1) music.setPhase(1);
    if (idx === 2) music.setPhase(2);
    if (idx === 3) { music.setPhase(3); music.crescendo(); }
    if (idx === 4) music.setPhase(4);
  }

  function play() {
    if (!muted) music.start();
    setRunning(true);
    let cumulative = 0;
    const timers = [];
    SCENES.forEach((s, i) => {
      cumulative += s.duration;
      if (i < SCENES.length - 1) {
        timers.push(setTimeout(() => progressTo(i + 1), cumulative));
      }
    });
    sceneTimerRef.current = timers;
  }

  function stop() {
    sceneTimerRef.current?.forEach(t => clearTimeout(t));
    music.stop();
    setRunning(false);
    setScene(0);
  }

  useEffect(() => () => sceneTimerRef.current?.forEach(t => clearTimeout(t)), []);

  const alias = player?.alias || 'CAMPEÓN';
  const eliteId = player?.elite_id_code || '—';
  const playerClass = player?.player_class || 'DUELISTA';
  const rating = ratings[0]?.rating;
  const championships = ratings[0]?.championships ?? 0;
  const matches = ratings[0]?.matches ?? 0;

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden">
      {/* SCENE 0 — Ignition: black void + título glitch */}
      <AnimatePresence>
        {scene === 0 && (
          <motion.div
            key="s0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <GlitchOverlay active intensity={0.6}>
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 1.5, ease: 'easeOut' }}
                className="text-center"
              >
                <p className="text-[10px] uppercase tracking-[0.5em] text-rose-400 mb-4 font-bold">
                  PRESENTING
                </p>
                <h1 className="text-7xl sm:text-9xl font-black tracking-tighter bg-gradient-to-b from-white via-rose-200 to-rose-500 bg-clip-text text-transparent">
                  CHAMPION'S
                </h1>
                <h1 className="text-7xl sm:text-9xl font-black tracking-tighter bg-gradient-to-b from-rose-500 via-fuchsia-400 to-violet-500 bg-clip-text text-transparent -mt-2">
                  VISION
                </h1>
              </motion.div>
            </GlitchOverlay>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SCENE 1 — Genesis: aurora + stats typewriter */}
      <AnimatePresence>
        {scene === 1 && (
          <motion.div
            key="s1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.8 }}
            className="absolute inset-0"
          >
            <div className="absolute inset-0">
              <AuroraShader seed={playerId * 13} colorA="#7c3aed" colorB="#0b0b14" colorC="#06b6d4" />
            </div>
            <div className="absolute inset-0 flex items-center justify-center px-8">
              <motion.div
                initial={{ y: 30, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                transition={{ delay: 0.5 }}
                className="text-center"
              >
                <p className="text-xs uppercase tracking-[0.4em] text-violet-300 mb-3">
                  Origen · {playerClass}
                </p>
                <h2 className="text-6xl sm:text-8xl font-black bg-gradient-to-r from-white via-violet-100 to-violet-300 bg-clip-text text-transparent drop-shadow-2xl">
                  {alias}
                </h2>
                <p className="text-sm font-mono text-violet-300 mt-2">{eliteId}</p>
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: '60%' }}
                  transition={{ duration: 1.5, delay: 1 }}
                  className="h-px bg-gradient-to-r from-transparent via-violet-400 to-transparent mx-auto mt-6 mb-6"
                />
                <div className="grid grid-cols-3 gap-6 max-w-md mx-auto">
                  <StatReveal label="Partidas" value={matches} delay={1.2} />
                  <StatReveal label="Rating" value={rating ? Math.round(rating) : 'NEW'} delay={1.6} />
                  <StatReveal label="Coronas" value={championships} delay={2.0} icon={Crown} />
                </div>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SCENE 2 — Singularity: black hole + nombre en horizonte */}
      <AnimatePresence>
        {scene === 2 && (
          <motion.div
            key="s2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2 }}
            className="absolute inset-0"
          >
            <div className="absolute inset-0">
              <BlackHoleShader intensity={1.0} />
            </div>
            {/* Nombre orbita el agujero negro */}
            <motion.div
              className="absolute inset-0 flex items-center justify-center"
              animate={{ rotate: 360 }}
              transition={{ duration: 8, ease: 'linear', repeat: Infinity }}
            >
              <motion.h2
                style={{ paddingLeft: 280 }}
                className="text-2xl font-black tracking-widest text-amber-200 drop-shadow-[0_0_20px_rgba(251,191,36,0.8)]"
                animate={{ scale: [1, 1.1, 1] }}
                transition={{ duration: 3, repeat: Infinity }}
              >
                {alias}
              </motion.h2>
            </motion.div>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 3 }}
              className="absolute bottom-16 left-0 right-0 text-center"
            >
              <p className="text-[10px] uppercase tracking-[0.4em] text-amber-300/80 font-bold">
                Gravedad infinita · El meta colapsa
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SCENE 3 — Collapse: glitch máximo + flash blanco */}
      <AnimatePresence>
        {scene === 3 && (
          <motion.div
            key="s3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-white"
            transition={{ duration: 0.2 }}
          >
            <GlitchOverlay active intensity={2.0}>
              <motion.div
                initial={{ opacity: 1, scale: 1 }}
                animate={{ opacity: [1, 0, 1, 0, 1], scale: [1, 1.3, 0.95, 1.5, 1] }}
                transition={{ duration: 3.5, times: [0, 0.2, 0.4, 0.7, 1] }}
                className="absolute inset-0 flex items-center justify-center bg-black"
              >
                <h2 className="text-8xl font-black text-white mix-blend-difference drop-shadow-[0_0_40px_rgba(255,0,128,0.9)]">
                  {alias}
                </h2>
              </motion.div>
            </GlitchOverlay>
          </motion.div>
        )}
      </AnimatePresence>

      {/* SCENE 4 — Champion: confeti + nombre dorado + créditos */}
      <AnimatePresence>
        {scene === 4 && (
          <motion.div
            key="s4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1 }}
            className="absolute inset-0 bg-gradient-to-b from-amber-950 via-orange-950 to-rose-950"
          >
            <div className="absolute inset-0">
              <AuroraShader seed={playerId * 5} colorA="#fbbf24" colorB="#1a0a04" colorC="#ef4444" />
            </div>
            <Confetti3D active />
            <div className="absolute inset-0 flex flex-col items-center justify-center px-8">
              <motion.div
                initial={{ scale: 0, rotate: -45 }}
                animate={{ scale: 1, rotate: 0 }}
                transition={{ type: 'spring', damping: 14, stiffness: 110, delay: 0.4 }}
                className="mb-4"
              >
                <Crown size={88} className="text-amber-300 drop-shadow-[0_0_30px_rgba(251,191,36,0.9)]" />
              </motion.div>
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1 }}
                className="text-[12px] uppercase tracking-[0.6em] text-amber-300 font-bold"
              >
                CAMPEÓN ETERNO
              </motion.p>
              <motion.h1
                initial={{ opacity: 0, scale: 0.85 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 1.4, type: 'spring' }}
                className="text-7xl sm:text-9xl font-black tracking-tighter mt-2 bg-gradient-to-b from-yellow-100 via-amber-300 to-orange-500 bg-clip-text text-transparent drop-shadow-[0_0_60px_rgba(251,191,36,0.6)]"
              >
                {alias}
              </motion.h1>
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 2.2 }}
                className="text-center mt-6 space-y-1"
              >
                <p className="font-mono text-amber-200/80">{eliteId}</p>
                <p className="text-xs text-amber-300/60 uppercase tracking-widest">
                  {playerClass} · {matches} Partidas · Rating {rating ? Math.round(rating) : '—'}
                </p>
              </motion.div>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 3 }}
                className="mt-12"
              >
                <Link
                  to="/cosmos"
                  className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-100 hover:bg-amber-500/30 transition text-sm font-bold uppercase tracking-widest"
                >
                  <Sparkles size={14} /> Volver al Cosmos
                </Link>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* HUD: controles */}
      {!running && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          className="absolute inset-0 flex flex-col items-center justify-center bg-black z-20"
        >
          <div className="text-center max-w-md px-6">
            <Sparkles size={32} className="text-violet-400 mx-auto mb-4" />
            <h2 className="text-3xl font-black mb-3 bg-gradient-to-r from-violet-200 via-white to-fuchsia-200 bg-clip-text text-transparent">
              Champion's Vision
            </h2>
            <p className="text-sm text-slate-400 mb-8">
              Una experiencia audiovisual de 36 segundos celebrando a <span className="text-white font-bold">{alias}</span>.
              Funciona mejor en pantalla completa con audio.
            </p>
            <button
              onClick={play}
              className="px-8 py-3 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-bold uppercase tracking-widest text-sm shadow-lg shadow-violet-500/40 hover:shadow-violet-500/60 transition"
            >
              ▶ Iniciar experiencia
            </button>
            <div className="mt-4 flex items-center justify-center gap-3">
              <label className="flex items-center gap-2 text-xs text-slate-400">
                <input
                  type="checkbox"
                  checked={!muted}
                  onChange={(e) => setMuted(!e.target.checked)}
                  className="accent-violet-500"
                />
                Audio procedural
              </label>
            </div>
            <Link to="/cosmos" className="block mt-8 text-xs text-slate-500 hover:text-white">
              Cancelar
            </Link>
          </div>
        </motion.div>
      )}

      {running && (
        <div className="absolute top-4 right-4 z-30 flex gap-2 pointer-events-auto">
          <button
            onClick={() => setMuted(m => {
              if (!m) music.stop(); else music.start();
              return !m;
            })}
            className="p-2.5 rounded-xl bg-black/40 backdrop-blur border border-white/10 hover:bg-white/10"
            title={muted ? 'Activar audio' : 'Silenciar'}
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
          </button>
          <button
            onClick={() => progressTo(Math.min(scene + 1, SCENES.length - 1))}
            className="p-2.5 rounded-xl bg-black/40 backdrop-blur border border-white/10 hover:bg-white/10"
            title="Siguiente escena"
          >
            <SkipForward size={14} />
          </button>
          <button onClick={stop} className="p-2.5 rounded-xl bg-rose-500/20 backdrop-blur border border-rose-400/30 hover:bg-rose-500/30">
            <X size={14} />
          </button>
        </div>
      )}

      {running && (
        <div className="absolute bottom-4 left-4 z-30 text-[10px] uppercase tracking-widest text-white/50 pointer-events-none">
          Escena {scene + 1}/{SCENES.length} · {SCENES[scene]?.label}
        </div>
      )}
    </div>
  );
}

function StatReveal({ label, value, delay = 0, icon: Icon }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.6 }}
      className="text-center"
    >
      <div className="text-[10px] uppercase tracking-widest text-violet-300/80 mb-1 font-bold">
        {label}
      </div>
      <div className="text-3xl font-black tabular-nums text-white flex items-center justify-center gap-1.5">
        {Icon && <Icon size={20} className="text-amber-400" />}
        {value}
      </div>
    </motion.div>
  );
}
