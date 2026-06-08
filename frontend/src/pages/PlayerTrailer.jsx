/** Player Trailer — secuencia cinematográfica 60s del jugador.
 * 8 escenas con audio procedural sync, opción de grabar a MP4 con MediaRecorder.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Pause, Volume2, VolumeX, Sparkles, Crown, Swords, Star,
  Layers, Compass, Trophy, Download, ArrowLeft, Circle,
} from 'lucide-react';

import { api } from '../lib/api';
import AuroraShader from '../components/AuroraShader';
import GlitchOverlay from '../components/GlitchOverlay';
import { useProceduralMusic } from '../lib/useProceduralMusic';

const SCENES = [
  { id: 'intro',      duration: 4500 },
  { id: 'stats',      duration: 7000 },
  { id: 'matches',    duration: 7500 },
  { id: 'decks',      duration: 6500 },
  { id: 'cosmos',     duration: 7000 },
  { id: 'crown',      duration: 6500 },
  { id: 'rating',     duration: 7000 },
  { id: 'outro',      duration: 7500 },
];

const TOTAL_DURATION = SCENES.reduce((a, s) => a + s.duration, 0);

export default function PlayerTrailer() {
  const { id } = useParams();
  const playerId = Number(id);

  const [data, setData] = useState({ player: null, ratings: [], decks: [], matches: [], cosmos: null });
  const [scene, setScene] = useState(0);
  const [running, setRunning] = useState(false);
  const [muted, setMuted] = useState(false);
  const [recording, setRecording] = useState(false);
  const sceneTimerRef = useRef(null);
  const music = useProceduralMusic();
  const stageRef = useRef(null);
  const recorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  useEffect(() => {
    (async () => {
      try {
        const [player, cosmos] = await Promise.all([
          api.get(`/players/${playerId}/public`).catch(() => null),
          api.get(`/cosmos`).catch(() => ({ data: { stars: [], champion_id: null } })),
        ]);
        const star = cosmos.data.stars?.find(s => s.player_id === playerId);
        setData({
          player: player?.data,
          ratings: star ? [{ rating: star.rating, championships: star.championships, matches: star.matches }] : [],
          decks: [],
          matches: [],
          cosmos: { ...cosmos.data, focusedStar: star },
        });
      } catch {}
    })();
  }, [playerId]);

  function play() {
    if (!muted) music.start();
    setRunning(true);
    setScene(0);
    music.setPhase(0);
    let cumulative = 0;
    const timers = [];
    SCENES.forEach((s, i) => {
      cumulative += s.duration;
      if (i < SCENES.length - 1) {
        timers.push(setTimeout(() => {
          setScene(i + 1);
          music.setPhase(Math.min(4, Math.floor((i + 1) / 2)));
          if (i + 1 === SCENES.length - 1) music.crescendo();
        }, cumulative));
      }
    });
    sceneTimerRef.current = timers;
  }

  function stop() {
    sceneTimerRef.current?.forEach(t => clearTimeout(t));
    music.stop();
    setRunning(false);
    setScene(0);
    if (recording) stopRecording();
  }

  async function startRecording() {
    if (!stageRef.current) return;
    const stream = stageRef.current.captureStream?.(60);
    if (!stream) {
      try {
        // Si no soporta captureStream del div, usamos getDisplayMedia como fallback
        const ds = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 } });
        recordOn(ds);
      } catch {}
      return;
    }
    recordOn(stream);
  }

  function recordOn(stream) {
    recordedChunksRef.current = [];
    const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9')
      ? 'video/webm;codecs=vp9'
      : 'video/webm';
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    rec.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    rec.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trailer-${data.player?.alias || 'player'}-${Date.now()}.webm`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    };
    rec.start(200);
    recorderRef.current = rec;
    setRecording(true);
    play();
  }

  function stopRecording() {
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      recorderRef.current.stop();
    }
    setRecording(false);
  }

  useEffect(() => () => sceneTimerRef.current?.forEach(t => clearTimeout(t)), []);

  if (!data.player) return (
    <div className="fixed inset-0 bg-black text-violet-300 font-mono flex items-center justify-center">
      <p className="text-xs uppercase tracking-[0.4em] animate-pulse">Cargando perfil…</p>
    </div>
  );

  const p = data.player;
  const rating = data.ratings[0]?.rating;
  const matches = data.ratings[0]?.matches ?? 0;
  const champs = data.ratings[0]?.championships ?? 0;
  const sceneId = SCENES[scene]?.id;

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden">
      <div ref={stageRef} className="absolute inset-0">
        {/* ============ Aurora base que cambia color por scene ============ */}
        <div className="absolute inset-0">
          <AuroraShader
            seed={playerId * 17 + scene * 13}
            colorA={
              sceneId === 'intro' ? '#ef4444' :
              sceneId === 'stats' ? '#7c3aed' :
              sceneId === 'matches' ? '#0ea5e9' :
              sceneId === 'decks' ? '#10b981' :
              sceneId === 'cosmos' ? '#a855f7' :
              sceneId === 'crown' ? '#fbbf24' :
              sceneId === 'rating' ? '#fb7185' :
              '#f97316'
            }
            colorB="#02020a"
            colorC={
              sceneId === 'outro' ? '#ef4444' :
              sceneId === 'crown' ? '#f97316' :
              '#22d3ee'
            }
          />
        </div>

        {/* ============ Escenas ============ */}
        {sceneId === 'intro' && (
          <SceneIntro alias={p.alias} eliteId={p.elite_id_code} />
        )}
        {sceneId === 'stats' && (
          <SceneStats matches={matches} rating={rating} champs={champs} />
        )}
        {sceneId === 'matches' && (
          <SceneMatches matches={matches} alias={p.alias} />
        )}
        {sceneId === 'decks' && (
          <SceneDecks playerClass={p.player_class} alias={p.alias} />
        )}
        {sceneId === 'cosmos' && (
          <SceneCosmos alias={p.alias} star={data.cosmos?.focusedStar} />
        )}
        {sceneId === 'crown' && (
          <SceneCrown alias={p.alias} champs={champs} />
        )}
        {sceneId === 'rating' && (
          <SceneRating rating={rating} alias={p.alias} />
        )}
        {sceneId === 'outro' && (
          <SceneOutro alias={p.alias} eliteId={p.elite_id_code} />
        )}

        {/* Progress bar abajo */}
        {running && (
          <div className="absolute bottom-0 inset-x-0 h-1 bg-white/5 pointer-events-none">
            <motion.div
              key={scene}
              initial={{ width: 0 }}
              animate={{ width: '100%' }}
              transition={{ duration: SCENES[scene].duration / 1000, ease: 'linear' }}
              className="h-1 bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400"
            />
          </div>
        )}
      </div>

      {/* Splash inicial */}
      {!running && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }}
          className="absolute inset-0 z-20 bg-black/85 backdrop-blur flex items-center justify-center"
        >
          <div className="text-center max-w-md px-6">
            <Sparkles size={32} className="text-violet-400 mx-auto mb-4" />
            <p className="text-[10px] uppercase tracking-[0.4em] text-violet-300 font-bold mb-1">
              PROCEDURAL TRAILER · {Math.round(TOTAL_DURATION / 1000)}s
            </p>
            <h2 className="text-3xl font-black mb-3 bg-gradient-to-r from-white via-violet-100 to-fuchsia-200 bg-clip-text text-transparent">
              Highlights de {p.alias}
            </h2>
            <p className="text-sm text-slate-400 mb-8">
              Una secuencia cinematográfica generada automáticamente. {matches} matches · rating {rating ? Math.round(rating) : '—'} · {champs} corona{champs === 1 ? '' : 's'}.
            </p>
            <div className="flex flex-col gap-3 items-center">
              <button onClick={play} className="px-8 py-3 rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-bold uppercase tracking-widest text-sm shadow-lg shadow-violet-500/40 hover:shadow-violet-500/60 transition">
                ▶ Reproducir
              </button>
              <button
                onClick={recording ? stopRecording : startRecording}
                className={`px-6 py-2 rounded-full text-xs font-bold uppercase tracking-widest transition flex items-center gap-2 ${
                  recording
                    ? 'bg-rose-500/30 border border-rose-500/50 text-rose-200'
                    : 'bg-white/5 border border-white/10 text-slate-400 hover:bg-white/10 hover:text-white'
                }`}
              >
                {recording ? <Circle size={10} className="fill-current animate-pulse" /> : <Download size={11} />}
                {recording ? 'Detener grabación' : 'Reproducir + grabar WebM'}
              </button>
              <label className="flex items-center gap-2 text-xs text-slate-500 mt-2">
                <input
                  type="checkbox"
                  checked={!muted}
                  onChange={(e) => setMuted(!e.target.checked)}
                  className="accent-violet-500"
                />
                Audio procedural
              </label>
              <Link to={`/players/${playerId}`} className="block mt-4 text-xs text-slate-600 hover:text-white">
                Cancelar
              </Link>
            </div>
          </div>
        </motion.div>
      )}

      {/* Top HUD durante reproducción */}
      {running && (
        <div className="absolute top-4 right-4 z-30 flex gap-2 pointer-events-auto">
          <button
            onClick={() => setMuted(m => {
              if (!m) music.stop(); else music.start();
              return !m;
            })}
            className="p-2.5 rounded-xl bg-black/40 backdrop-blur border border-white/10 hover:bg-white/10"
          >
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} className="text-emerald-400" />}
          </button>
          <button onClick={stop} className="p-2.5 rounded-xl bg-rose-500/20 backdrop-blur border border-rose-400/30 hover:bg-rose-500/30">
            <Pause size={14} />
          </button>
        </div>
      )}

      {running && (
        <div className="absolute bottom-4 left-4 z-30 text-[10px] uppercase tracking-widest text-white/40 pointer-events-none">
          Trailer · Escena {scene + 1}/{SCENES.length}
          {recording && <span className="ml-2 text-rose-400 font-bold">● REC</span>}
        </div>
      )}
    </div>
  );
}

/* ============================== Scenes ============================== */

function SceneIntro({ alias, eliteId }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 flex items-center justify-center"
    >
      <GlitchOverlay active intensity={0.7}>
        <div className="text-center">
          <motion.p
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.3 }}
            className="text-[10px] uppercase tracking-[0.5em] text-rose-300 font-bold mb-3"
          >
            EXPEDIENTE / EC-PROTOCOL
          </motion.p>
          <motion.h1
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.6, duration: 1.2 }}
            className="text-7xl sm:text-9xl font-black tracking-tighter bg-gradient-to-b from-white via-rose-200 to-rose-500 bg-clip-text text-transparent"
          >
            {alias}
          </motion.h1>
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 1.8 }}
            className="font-mono text-rose-200/70 text-sm mt-3 tracking-[0.3em]"
          >
            {eliteId}
          </motion.p>
        </div>
      </GlitchOverlay>
    </motion.div>
  );
}

function SceneStats({ matches, rating, champs }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 flex items-center justify-center">
      <div className="grid grid-cols-3 gap-12 max-w-4xl">
        <BigStat icon={Swords} label="MATCHES" value={matches} delay={0.3} hue={280} />
        <BigStat icon={Trophy} label="RATING" value={rating ? Math.round(rating) : '—'} delay={1.0} hue={45} />
        <BigStat icon={Crown} label="CORONAS" value={champs} delay={1.7} hue={350} />
      </div>
    </motion.div>
  );
}

function BigStat({ icon: Icon, label, value, delay, hue }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', damping: 14 }}
      className="text-center"
    >
      <Icon size={44} className="mx-auto mb-3" style={{ color: `hsl(${hue}, 80%, 60%)` }} />
      <p className="text-[10px] uppercase tracking-[0.4em] font-bold mb-2" style={{ color: `hsl(${hue}, 80%, 70%)` }}>
        {label}
      </p>
      <motion.div
        initial={{ scale: 0.6 }}
        animate={{ scale: 1 }}
        transition={{ delay: delay + 0.3, duration: 1, type: 'spring' }}
        className="text-7xl font-black tabular-nums bg-gradient-to-b from-white bg-clip-text text-transparent drop-shadow-2xl"
        style={{ backgroundImage: `linear-gradient(to bottom, #fff, hsl(${hue}, 80%, 60%))`, WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
      >
        {value}
      </motion.div>
    </motion.div>
  );
}

function SceneMatches({ matches, alias }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 flex flex-col items-center justify-center p-8">
      <motion.p
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        className="text-[10px] uppercase tracking-[0.5em] text-cyan-300 font-bold mb-3"
      >
        COMBATE
      </motion.p>
      <motion.h2
        initial={{ scale: 0.85 }} animate={{ scale: 1 }}
        transition={{ duration: 0.6 }}
        className="text-5xl sm:text-7xl font-black text-center bg-gradient-to-r from-cyan-200 via-white to-cyan-200 bg-clip-text text-transparent leading-tight"
      >
        {matches}<span className="text-cyan-400">×</span> DUELOS<br/>
        <span className="text-cyan-300 text-3xl sm:text-5xl">LIBRADOS</span>
      </motion.h2>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ delay: 1.5 }}
        className="mt-8 grid grid-cols-5 gap-2 max-w-md w-full"
      >
        {Array.from({ length: 25 }).map((_, i) => (
          <motion.div
            key={i}
            initial={{ scaleY: 0 }}
            animate={{ scaleY: 1 }}
            transition={{ delay: 1.5 + i * 0.04, duration: 0.4 }}
            className="h-12 rounded origin-bottom"
            style={{ background: `linear-gradient(to top, hsl(${190 + Math.random() * 40}, 80%, 55%), transparent)` }}
          />
        ))}
      </motion.div>
    </motion.div>
  );
}

function SceneDecks({ playerClass, alias }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 flex flex-col items-center justify-center p-8">
      <Layers size={36} className="text-emerald-300 mb-3" />
      <p className="text-[10px] uppercase tracking-[0.5em] text-emerald-300 font-bold mb-2">CLASE</p>
      <motion.h2
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.7 }}
        className="text-6xl sm:text-8xl font-black bg-gradient-to-b from-emerald-100 via-emerald-300 to-emerald-600 bg-clip-text text-transparent"
      >
        {playerClass}
      </motion.h2>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1 }}
        className="mt-6 flex gap-3 perspective-1000"
      >
        {[0, 1, 2, 3].map(i => (
          <motion.div
            key={i}
            initial={{ rotateY: -30, opacity: 0, y: 30 }}
            animate={{ rotateY: -10 + i * 6, opacity: 1, y: 0 }}
            transition={{ delay: 1.2 + i * 0.15, duration: 0.7 }}
            className="w-20 h-28 rounded-lg bg-gradient-to-br from-emerald-700 to-emerald-950 border border-emerald-400/40 shadow-xl"
            style={{ transformStyle: 'preserve-3d' }}
          />
        ))}
      </motion.div>
    </motion.div>
  );
}

function SceneCosmos({ alias, star }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 flex items-center justify-center">
      <div className="relative text-center">
        <motion.div
          initial={{ scale: 0 }} animate={{ scale: 1 }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          className="absolute inset-[-200px] rounded-full"
          style={{
            background: star ? `radial-gradient(circle, hsla(${star.hue}, 80%, 60%, 0.4), transparent 60%)` : 'transparent',
          }}
        />
        <motion.div
          animate={{ rotate: 360 }}
          transition={{ duration: 30, repeat: Infinity, ease: 'linear' }}
          className="relative w-64 h-64 mx-auto"
        >
          {Array.from({ length: 12 }).map((_, i) => {
            const angle = (i / 12) * Math.PI * 2;
            return (
              <div
                key={i}
                className="absolute w-2 h-2 rounded-full bg-violet-400"
                style={{
                  left: '50%',
                  top: '50%',
                  transform: `translate(${Math.cos(angle) * 110 - 4}px, ${Math.sin(angle) * 110 - 4}px)`,
                  boxShadow: '0 0 8px rgba(167,139,250,0.8)',
                  opacity: 0.5 + (i % 4) * 0.15,
                }}
              />
            );
          })}
          <motion.div
            animate={{ scale: [1, 1.4, 1] }}
            transition={{ duration: 2, repeat: Infinity }}
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 rounded-full"
            style={{
              background: star ? `hsl(${star.hue}, 80%, 60%)` : '#a78bfa',
              boxShadow: `0 0 30px ${star ? `hsl(${star.hue}, 80%, 60%)` : '#a78bfa'}`,
            }}
          />
        </motion.div>
        <motion.div
          initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-8"
        >
          <Compass size={20} className="text-violet-300 mx-auto mb-2" />
          <p className="text-[10px] uppercase tracking-[0.5em] text-violet-300 font-bold">
            ESTRELLA REGISTRADA
          </p>
          <p className="text-2xl font-black mt-2">en el COSMOS</p>
        </motion.div>
      </div>
    </motion.div>
  );
}

function SceneCrown({ alias, champs }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 flex items-center justify-center">
      <div className="text-center">
        <motion.div
          initial={{ rotate: -180, scale: 0 }} animate={{ rotate: 0, scale: 1 }}
          transition={{ type: 'spring', damping: 12, duration: 1.2 }}
        >
          <Crown size={120} className="text-amber-300 mx-auto drop-shadow-[0_0_60px_rgba(251,191,36,0.9)]" />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1.4 }}
          className="mt-6"
        >
          <p className="text-[10px] uppercase tracking-[0.5em] text-amber-300 font-bold mb-2">
            {champs > 0 ? 'CORONAS OBTENIDAS' : 'EN BUSCA DE LA CORONA'}
          </p>
          <p className="text-9xl font-black tabular-nums bg-gradient-to-b from-amber-100 via-amber-300 to-orange-500 bg-clip-text text-transparent">
            ×{champs}
          </p>
        </motion.div>
      </div>
    </motion.div>
  );
}

function SceneRating({ rating, alias }) {
  const display = useMemo(() => Math.round(rating || 1500), [rating]);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 flex items-center justify-center">
      <div className="text-center">
        <p className="text-[10px] uppercase tracking-[0.5em] text-rose-300 font-bold mb-2">
          GLICKO-2 RATING
        </p>
        <motion.div
          initial={{ scale: 1.5, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 1 }}
        >
          <p className="text-[14rem] font-black tabular-nums leading-none bg-gradient-to-b from-rose-100 via-rose-300 to-rose-700 bg-clip-text text-transparent drop-shadow-[0_0_60px_rgba(244,63,94,0.4)]">
            {display}
          </p>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, width: 0 }}
          animate={{ opacity: 1, width: '80%' }}
          transition={{ delay: 1, duration: 1.5 }}
          className="h-1 bg-gradient-to-r from-transparent via-rose-400 to-transparent mx-auto mt-2"
        />
        <motion.p
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.8 }}
          className="text-xs uppercase tracking-[0.4em] text-rose-300 mt-4 font-bold"
        >
          {rating > 1800 ? 'TIER ELITE' : rating > 1600 ? 'TIER RETADOR' : 'TIER DUELISTA'}
        </motion.p>
      </div>
    </motion.div>
  );
}

function SceneOutro({ alias, eliteId }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      className="absolute inset-0 flex flex-col items-center justify-center">
      <motion.div
        initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 1.2 }}
        className="text-center"
      >
        <Star size={32} className="text-orange-400 mx-auto mb-4 drop-shadow-[0_0_30px_rgba(251,146,60,0.8)]" />
        <p className="text-[10px] uppercase tracking-[0.5em] text-orange-300 font-bold mb-3">
          CONTINÚA TU LEYENDA
        </p>
        <h1 className="text-6xl sm:text-8xl font-black tracking-tighter bg-gradient-to-b from-white via-orange-200 to-rose-500 bg-clip-text text-transparent">
          {alias}
        </h1>
        <p className="text-xl font-mono text-orange-200/70 mt-4 tracking-[0.3em]">{eliteId}</p>
      </motion.div>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }}
        transition={{ delay: 2 }}
        className="mt-12"
      >
        <p className="text-xs uppercase tracking-[0.4em] text-orange-300/60 font-bold">
          ELITECARDS · RUTA DEL CAMPEÓN
        </p>
      </motion.div>
    </motion.div>
  );
}
