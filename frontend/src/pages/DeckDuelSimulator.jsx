/** Deck Duel Simulator — dos decks enfrentándose en duelo simulado visual.
 * Cada turno una carta de cada lado levita, choca, partículas, daño visual.
 * Resultado final basado en estadística (random seed por decks).
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Float, Stars, Text, Environment, ContactShadows, RoundedBox,
} from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Play, RotateCcw, Sparkles, Heart, Zap, Crown } from 'lucide-react';

import { api } from '../lib/api';
import AuroraShader from '../components/AuroraShader';
import { useProceduralMusic } from '../lib/useProceduralMusic';

const INITIAL_LIFE = 20;
const TURN_DURATION = 2400;

// PRNG simple para resultados deterministas
function seededRandom(seed) {
  let s = seed;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function DuelistCard({ position, color, attacking, label, side }) {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.position.y = position[1] + Math.sin(t * 1.6 + side) * 0.08;
    if (attacking) {
      // Rush hacia el centro y vuelta
      const phase = (t * 1.6) % 2;
      ref.current.position.z = position[2] + (phase < 1 ? Math.sin(phase * Math.PI) * (side === 0 ? 1.2 : -1.2) : 0);
      ref.current.rotation.z = Math.sin(t * 8) * 0.1;
    } else {
      ref.current.position.z = position[2];
      ref.current.rotation.z = 0;
    }
  });
  return (
    <group ref={ref} position={position}>
      <RoundedBox args={[1.4, 1.95, 0.08]} radius={0.08}>
        <meshPhysicalMaterial
          color={color}
          metalness={0.65}
          roughness={0.15}
          clearcoat={1}
          emissive={color}
          emissiveIntensity={attacking ? 0.55 : 0.18}
        />
      </RoundedBox>
      <mesh position={[0, 0, 0.043]}>
        <ringGeometry args={[0.78, 0.83, 4]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.5} />
      </mesh>
      <Text
        position={[0, 0.2, 0.045]}
        fontSize={0.16}
        color="#fde68a"
        anchorX="center"
        fontWeight="bold"
        outlineWidth={0.006}
        outlineColor="#000"
        maxWidth={1.2}
      >
        {label}
      </Text>
    </group>
  );
}

function ImpactBurst({ position, trigger }) {
  const ref = useRef();
  const startRef = useRef(null);
  useFrame((state) => {
    if (!ref.current) return;
    if (trigger && startRef.current === null) startRef.current = state.clock.elapsedTime;
    if (!trigger) { startRef.current = null; ref.current.scale.setScalar(0); return; }
    const t = state.clock.elapsedTime - startRef.current;
    const dur = 0.8;
    if (t > dur) { ref.current.scale.setScalar(0); return; }
    const eased = 1 - Math.pow(1 - (t / dur), 3);
    const s = eased * 3;
    ref.current.scale.setScalar(s);
    ref.current.material.opacity = 1 - eased;
  });
  return (
    <mesh ref={ref} position={position}>
      <ringGeometry args={[0.4, 0.45, 32]} />
      <meshBasicMaterial color="#fbbf24" transparent />
    </mesh>
  );
}

function ArenaCircle() {
  return (
    <>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.2, 0]}>
        <circleGeometry args={[6, 64]} />
        <meshStandardMaterial color="#1a0a2e" metalness={0.7} roughness={0.3} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.18, 0]}>
        <ringGeometry args={[5.5, 5.7, 64]} />
        <meshBasicMaterial color="#a78bfa" transparent opacity={0.6} />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.18, 0]}>
        <ringGeometry args={[3.0, 3.1, 64]} />
        <meshBasicMaterial color="#a78bfa" transparent opacity={0.35} />
      </mesh>
    </>
  );
}

function DuelScene({ leftCard, rightCard, attackingSide, impactAt }) {
  return (
    <>
      <color attach="background" args={['#04020a']} />
      <fog attach="fog" args={['#04020a', 8, 20]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 4]} intensity={1.2} castShadow />
      <pointLight position={[0, 2, 0]} intensity={1.5} color="#a78bfa" distance={10} />
      <pointLight position={[-6, 3, 0]} intensity={0.7} color="#7c3aed" distance={10} />
      <pointLight position={[6, 3, 0]} intensity={0.7} color="#fbbf24" distance={10} />

      <Stars radius={40} depth={50} count={1200} factor={3} fade speed={0.4} />
      <ArenaCircle />

      <Float speed={1.5} rotationIntensity={0.05} floatIntensity={0.2}>
        <DuelistCard
          position={[-3, 0, 0]}
          color="#7c3aed"
          attacking={attackingSide === 0}
          label={(leftCard?.name || '').toUpperCase().slice(0, 16)}
          side={0}
        />
      </Float>
      <Float speed={1.5} rotationIntensity={0.05} floatIntensity={0.2}>
        <DuelistCard
          position={[3, 0, 0]}
          color="#f59e0b"
          attacking={attackingSide === 1}
          label={(rightCard?.name || '').toUpperCase().slice(0, 16)}
          side={1}
        />
      </Float>

      <ImpactBurst position={[0, 0.1, 0]} trigger={impactAt > 0} />

      <ContactShadows position={[0, -1.18, 0]} opacity={0.5} scale={14} blur={2.5} far={3} />
      <Environment preset="night" />
    </>
  );
}

export default function DeckDuelSimulator() {
  const [params] = useSearchParams();
  const aId = Number(params.get('a') || 1);
  const bId = Number(params.get('b') || 2);

  const [deckA, setDeckA] = useState(null);
  const [deckB, setDeckB] = useState(null);
  const [cardsA, setCardsA] = useState([]);
  const [cardsB, setCardsB] = useState([]);
  const [lifeA, setLifeA] = useState(INITIAL_LIFE);
  const [lifeB, setLifeB] = useState(INITIAL_LIFE);
  const [turn, setTurn] = useState(0);
  const [activeIdxA, setActiveIdxA] = useState(0);
  const [activeIdxB, setActiveIdxB] = useState(0);
  const [attacking, setAttacking] = useState(null);
  const [impactAt, setImpactAt] = useState(0);
  const [running, setRunning] = useState(false);
  const [winner, setWinner] = useState(null);
  const [log, setLog] = useState([]);
  const turnTimerRef = useRef(null);
  const music = useProceduralMusic();

  useEffect(() => {
    Promise.all([
      api.get(`/decks/me/${aId}`).catch(() => ({ data: null })),
      api.get(`/decks/me/${bId}`).catch(() => ({ data: null })),
      api.get(`/tcg/decks/${aId}/enrich`).catch(() => ({ data: { main: [] } })),
      api.get(`/tcg/decks/${bId}/enrich`).catch(() => ({ data: { main: [] } })),
    ]).then(([a, b, ea, eb]) => {
      setDeckA(a.data); setDeckB(b.data);
      setCardsA((ea.data.main || []).filter(c => c.meta?.image_url || c.name));
      setCardsB((eb.data.main || []).filter(c => c.meta?.image_url || c.name));
    });
  }, [aId, bId]);

  const rand = useMemo(() => seededRandom(aId * 1000 + bId), [aId, bId]);

  function nextTurn() {
    if (lifeA <= 0 || lifeB <= 0) return;
    const sideAttacks = rand() > 0.5 ? 0 : 1;
    setAttacking(sideAttacks);
    setImpactAt(0);
    setTurn(t => t + 1);

    setTimeout(() => {
      setImpactAt(Date.now());
      const dmg = Math.floor(rand() * 4) + 2;
      if (sideAttacks === 0) {
        setLifeB(l => Math.max(0, l - dmg));
        setActiveIdxA(i => (i + 1) % Math.max(1, cardsA.length));
        const aName = cardsA[activeIdxA]?.name || 'Carta A';
        const bName = cardsB[activeIdxB]?.name || 'Carta B';
        setLog(l => [`${aName} ataca a ${bName} · -${dmg}`, ...l].slice(0, 8));
      } else {
        setLifeA(l => Math.max(0, l - dmg));
        setActiveIdxB(i => (i + 1) % Math.max(1, cardsB.length));
        const aName = cardsA[activeIdxA]?.name || 'Carta A';
        const bName = cardsB[activeIdxB]?.name || 'Carta B';
        setLog(l => [`${bName} ataca a ${aName} · -${dmg}`, ...l].slice(0, 8));
      }
    }, TURN_DURATION * 0.4);

    turnTimerRef.current = setTimeout(() => {
      setAttacking(null);
      setImpactAt(0);
      if (lifeA > 0 && lifeB > 0 && running) nextTurn();
    }, TURN_DURATION);
  }

  useEffect(() => {
    if (lifeA <= 0 || lifeB <= 0) {
      setRunning(false);
      setWinner(lifeA <= 0 ? 'B' : 'A');
      music.crescendo();
      music.setPhase(4);
    }
  }, [lifeA, lifeB]); // eslint-disable-line

  function start() {
    setLifeA(INITIAL_LIFE); setLifeB(INITIAL_LIFE);
    setWinner(null); setLog([]); setTurn(0);
    setActiveIdxA(0); setActiveIdxB(0);
    setRunning(true);
    music.start(); music.setPhase(1);
    setTimeout(nextTurn, 600);
  }
  function stop() {
    setRunning(false);
    if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
    music.stop();
  }
  useEffect(() => () => {
    if (turnTimerRef.current) clearTimeout(turnTimerRef.current);
  }, []);

  const leftCard = cardsA[activeIdxA] || { name: deckA?.name?.slice(0, 16) || 'Deck A' };
  const rightCard = cardsB[activeIdxB] || { name: deckB?.name?.slice(0, 16) || 'Deck B' };

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden">
      <div className="absolute inset-0 opacity-25 pointer-events-none">
        <AuroraShader seed={(aId + bId) * 13} colorA="#7c3aed" colorB="#04020a" colorC="#f59e0b" />
      </div>

      <Canvas
        shadows
        camera={{ position: [0, 2.5, 9], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          <DuelScene leftCard={leftCard} rightCard={rightCard} attackingSide={attacking} impactAt={impactAt} />
        </Suspense>
      </Canvas>

      {/* HUD: vidas y deck info */}
      <div className="absolute top-0 left-0 right-0 z-10 p-6 grid grid-cols-3 gap-4 items-start pointer-events-none">
        <SidePanel
          deck={deckA}
          life={lifeA}
          color="violet"
          active={attacking === 0}
        />
        <div className="text-center pointer-events-auto">
          <Link to="/decks" className="text-xs text-slate-400 hover:text-white inline-flex items-center gap-1.5">
            <ArrowLeft size={12} /> Volver
          </Link>
          <div className="flex items-center justify-center gap-2 mt-2 mb-1">
            <Sparkles size={11} className="text-amber-300" />
            <span className="text-[10px] uppercase tracking-[0.4em] text-amber-300 font-bold">DUEL_ARENA</span>
          </div>
          <h1 className="text-2xl font-black bg-gradient-to-r from-violet-200 via-white to-amber-200 bg-clip-text text-transparent">
            Turno {turn}
          </h1>
        </div>
        <SidePanel
          deck={deckB}
          life={lifeB}
          color="amber"
          active={attacking === 1}
          mirror
        />
      </div>

      {/* Combat log */}
      <div className="absolute bottom-32 left-1/2 -translate-x-1/2 z-10 w-full max-w-md px-6 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {log.slice(0, 4).map((line, i) => (
            <motion.div
              key={line + i}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1 - i * 0.22, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="text-center text-xs font-mono text-violet-200 mb-1"
            >
              › {line}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* Controls */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
        <div className="flex items-center gap-2 bg-black/70 backdrop-blur-xl rounded-2xl border border-white/10 px-3 py-2">
          {!running && !winner && (
            <button onClick={start} className="px-5 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-amber-500 text-white font-bold uppercase tracking-widest text-xs flex items-center gap-2">
              <Play size={14} /> Iniciar duelo
            </button>
          )}
          {running && (
            <button onClick={stop} className="px-4 py-2 rounded-xl bg-rose-500/30 border border-rose-500/40 text-rose-200 text-xs font-bold uppercase">
              Pausar
            </button>
          )}
          {winner && (
            <button onClick={start} className="px-5 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-amber-500 text-white font-bold uppercase tracking-widest text-xs flex items-center gap-2">
              <RotateCcw size={13} /> Revancha
            </button>
          )}
        </div>
      </div>

      {/* Winner overlay */}
      <AnimatePresence>
        {winner && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-30 bg-black/60 backdrop-blur-md flex items-center justify-center pointer-events-none"
          >
            <motion.div
              initial={{ scale: 0.7, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', damping: 14 }}
              className="text-center"
            >
              <Crown size={80} className="mx-auto text-amber-400 drop-shadow-[0_0_40px_rgba(251,191,36,0.8)]" />
              <p className="text-[10px] uppercase tracking-[0.5em] mt-3"
                 style={{ color: winner === 'A' ? '#a78bfa' : '#fbbf24' }}>
                VICTORIA
              </p>
              <h1 className="text-6xl font-black mt-2"
                  style={{
                    backgroundImage: winner === 'A'
                      ? 'linear-gradient(180deg, #ddd6fe, #a78bfa, #7c3aed)'
                      : 'linear-gradient(180deg, #fef3c7, #fbbf24, #f97316)',
                    WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
                  }}
              >
                {(winner === 'A' ? deckA?.name : deckB?.name) || `Deck ${winner}`}
              </h1>
              <p className="text-xs text-slate-400 mt-3 uppercase tracking-widest">
                {turn} turnos · {winner === 'A' ? lifeA : lifeB} life restante
              </p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SidePanel({ deck, life, color, active, mirror }) {
  const c = {
    violet: { ring: 'border-violet-500/40', bar: 'from-violet-500 to-fuchsia-500', text: 'text-violet-300' },
    amber:  { ring: 'border-amber-500/40',  bar: 'from-amber-500 to-orange-500',  text: 'text-amber-300' },
  }[color];
  const pct = (life / INITIAL_LIFE) * 100;
  return (
    <div className={mirror ? "text-right" : "text-left"}>
      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full backdrop-blur border ${c.ring} ${active ? 'animate-pulse' : ''}`}>
        <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-rose-400' : 'bg-emerald-400'}`} />
        <span className={`text-[10px] uppercase tracking-[0.3em] font-bold ${c.text}`}>
          {active ? 'ATTACKING' : 'READY'}
        </span>
      </div>
      <h3 className="text-2xl font-black mt-2 truncate">{deck?.name || 'Deck'}</h3>
      <p className={`text-[10px] uppercase tracking-widest ${c.text}/70`}>
        {deck?.archetype || deck?.game_name}
      </p>
      <div className="mt-3 flex items-center gap-2" style={{ flexDirection: mirror ? 'row-reverse' : 'row' }}>
        <Heart size={16} className="text-rose-400" />
        <div className="flex-1 max-w-[200px] h-2.5 bg-black/40 rounded-full overflow-hidden">
          <motion.div
            initial={false}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 0.4 }}
            className={`h-full bg-gradient-to-r ${c.bar}`}
            style={{
              transformOrigin: mirror ? 'right' : 'left',
            }}
          />
        </div>
        <span className="text-lg font-black tabular-nums text-rose-300">{life}</span>
      </div>
    </div>
  );
}
