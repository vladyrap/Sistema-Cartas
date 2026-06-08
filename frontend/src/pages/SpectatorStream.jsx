/** Live Spectator Stream — mesa de duel 3D con cartas levitando.
 * Vista panorámica de dos jugadores enfrentados. Reusable para cualquier evento.
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Canvas, useFrame } from '@react-three/fiber';
import {
  Environment, Float, Stars, OrbitControls, Text, RoundedBox,
  ContactShadows,
} from '@react-three/drei';
import * as THREE from 'three';
import { motion } from 'framer-motion';
import { ArrowLeft, Cast, Eye, Heart, Sparkles } from 'lucide-react';

import { api } from '../lib/api';
import AuroraShader from '../components/AuroraShader';

const ZONES = {
  HAND:    { y: 1.0, z: -0.5, count: 6, spread: 2.2, tilt: -0.35 },
  MAIN:    { y: 0.05, z: -0.4, count: 5, spread: 3.0, tilt: -0.05 },
  GRAVE:   { y: 0.05, z: -1.5, count: 1, spread: 0.5, tilt: -0.05 },
};

function FloatingCard({ position, rotation, color = "#1a1a2e", title, faceup = true, glow = false }) {
  const ref = useRef();
  const offset = useMemo(() => Math.random() * Math.PI * 2, []);
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    ref.current.position.y = position[1] + Math.sin(t * 1.2 + offset) * 0.05;
    ref.current.rotation.z = rotation[2] + Math.sin(t * 0.8 + offset) * 0.04;
  });
  return (
    <group ref={ref} position={position} rotation={rotation}>
      <RoundedBox args={[1.2, 1.7, 0.05]} radius={0.07} smoothness={3}>
        <meshPhysicalMaterial
          color={color}
          metalness={0.55}
          roughness={0.2}
          clearcoat={1}
          clearcoatRoughness={0.18}
          emissive={glow ? "#7c3aed" : "#0a0a14"}
          emissiveIntensity={glow ? 0.5 : 0.05}
        />
      </RoundedBox>
      {/* Border ring */}
      <mesh position={[0, 0, 0.026]}>
        <ringGeometry args={[0.74, 0.79, 4]} />
        <meshBasicMaterial color="#a78bfa" transparent opacity={0.5} />
      </mesh>
      {faceup && title && (
        <Text
          position={[0, 0.6, 0.03]}
          fontSize={0.1}
          color="#fde68a"
          anchorX="center"
          fontWeight="bold"
          letterSpacing={0.05}
          maxWidth={1.0}
          outlineWidth={0.005}
          outlineColor="#0a0a14"
        >
          {title?.toUpperCase().slice(0, 18)}
        </Text>
      )}
    </group>
  );
}

function PlayerNameplate({ position, alias, life = 20, color = "#a78bfa", side = "A" }) {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y = Math.sin(state.clock.elapsedTime * 0.4) * 0.08;
  });
  return (
    <group position={position}>
      <Float speed={0.8} rotationIntensity={0.05} floatIntensity={0.2}>
        <group ref={ref}>
          <RoundedBox args={[3, 0.6, 0.08]} radius={0.08}>
            <meshPhysicalMaterial color="#0a0a14" metalness={0.7} roughness={0.2}
              emissive={color} emissiveIntensity={0.3} />
          </RoundedBox>
          <Text position={[-1.3, 0.05, 0.05]} fontSize={0.22} color="white"
            anchorX="left" fontWeight="bold" outlineWidth={0.006} outlineColor="#000">
            {alias}
          </Text>
          <Text position={[-1.3, -0.18, 0.05]} fontSize={0.1} color={color}
            anchorX="left" letterSpacing={0.2}>
            PLAYER · {side}
          </Text>
          <Text position={[1.2, 0.0, 0.05]} fontSize={0.32} color="#ef4444"
            anchorX="right" fontWeight="bold" outlineWidth={0.008} outlineColor="#000">
            ♥ {life}
          </Text>
        </group>
      </Float>
    </group>
  );
}

function ArenaTable() {
  return (
    <group>
      {/* Mesa principal */}
      <mesh position={[0, -0.1, 0]} receiveShadow>
        <boxGeometry args={[14, 0.2, 9]} />
        <meshPhysicalMaterial
          color="#0a0a14"
          metalness={0.6}
          roughness={0.45}
          emissive="#1e1b4b"
          emissiveIntensity={0.18}
        />
      </mesh>
      {/* Línea central */}
      <mesh position={[0, 0.011, 0]}>
        <boxGeometry args={[14, 0.001, 0.03]} />
        <meshBasicMaterial color="#a78bfa" transparent opacity={0.7} />
      </mesh>
      {/* Marcas de zona */}
      {[-1, 1].map(side => (
        <group key={side} position={[0, 0.012, side * 2.0]}>
          {[-4, 0, 4].map(x => (
            <mesh key={x} position={[x, 0, 0]}>
              <ringGeometry args={[0.65, 0.72, 32]} />
              <meshBasicMaterial color="#a78bfa" transparent opacity={0.35} side={THREE.DoubleSide} />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Particles() {
  const ref = useRef();
  const count = 80;
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      arr[i * 3] = (Math.random() - 0.5) * 16;
      arr[i * 3 + 1] = Math.random() * 4 + 0.5;
      arr[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }
    return arr;
  }, []);

  useFrame((state) => {
    if (!ref.current) return;
    const pos = ref.current.geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] += 0.005 + Math.sin(state.clock.elapsedTime + i) * 0.001;
      if (pos[i * 3 + 1] > 5) pos[i * 3 + 1] = 0.3;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color="#a78bfa" size={0.06} transparent opacity={0.7} sizeAttenuation />
    </points>
  );
}

function DuelScene({ playerA, playerB, lifeA = 20, lifeB = 20, theme }) {
  return (
    <>
      <color attach="background" args={['#040415']} />
      <fog attach="fog" args={['#040415', 12, 30]} />

      <ambientLight intensity={0.45} />
      <directionalLight position={[5, 8, 5]} intensity={0.9} castShadow />
      <pointLight position={[0, 5, 0]} intensity={1.2} color="#a78bfa" distance={12} />
      <pointLight position={[-6, 3, 0]} intensity={0.6} color="#06b6d4" distance={10} />
      <pointLight position={[6, 3, 0]} intensity={0.6} color="#f59e0b" distance={10} />

      <Stars radius={50} depth={60} count={1200} factor={3} fade speed={0.5} />

      <ArenaTable />
      <Particles />

      {/* Player A — bottom */}
      <PlayerNameplate position={[0, 0.5, 3.8]} alias={playerA?.alias || "PLAYER A"} life={lifeA} color="#a78bfa" side="A" />
      {/* Mano A */}
      {Array.from({ length: ZONES.HAND.count }).map((_, i) => {
        const t = (i / (ZONES.HAND.count - 1)) - 0.5;
        return (
          <FloatingCard
            key={`a-h-${i}`}
            position={[t * ZONES.HAND.spread, ZONES.HAND.y, 2.7]}
            rotation={[ZONES.HAND.tilt, 0, t * 0.12]}
            faceup={false}
          />
        );
      })}
      {/* Mainboard A */}
      {Array.from({ length: ZONES.MAIN.count }).map((_, i) => {
        const t = (i / (ZONES.MAIN.count - 1)) - 0.5;
        const titles = ['DRAGON LORD', 'PHANTOM WITCH', 'ASTRAL KNIGHT', 'VOID SAGE', 'SOLAR PALADIN'];
        return (
          <FloatingCard
            key={`a-m-${i}`}
            position={[t * ZONES.MAIN.spread, 0.6, 1.6]}
            rotation={[-Math.PI / 2.2, 0, t * 0.05]}
            faceup
            title={titles[i]}
            glow={i === 2}
          />
        );
      })}

      {/* Player B — top (mirror) */}
      <PlayerNameplate position={[0, 0.5, -3.8]} alias={playerB?.alias || "PLAYER B"} life={lifeB} color="#f59e0b" side="B" />
      {Array.from({ length: ZONES.HAND.count }).map((_, i) => {
        const t = (i / (ZONES.HAND.count - 1)) - 0.5;
        return (
          <FloatingCard
            key={`b-h-${i}`}
            position={[t * ZONES.HAND.spread, ZONES.HAND.y, -2.7]}
            rotation={[-ZONES.HAND.tilt, Math.PI, -t * 0.12]}
            faceup={false}
            color="#1a0a1a"
          />
        );
      })}
      {Array.from({ length: ZONES.MAIN.count }).map((_, i) => {
        const t = (i / (ZONES.MAIN.count - 1)) - 0.5;
        const titles = ['BLAZE BERSERKER', 'CHAOS MAGE', 'INFERNO HUNTER', 'STORM TEMPLAR', 'ECLIPSE ROGUE'];
        return (
          <FloatingCard
            key={`b-m-${i}`}
            position={[t * ZONES.MAIN.spread, 0.6, -1.6]}
            rotation={[Math.PI / 2.2, Math.PI, -t * 0.05]}
            faceup
            title={titles[i]}
            color="#1a0a14"
            glow={i === 1}
          />
        );
      })}

      <ContactShadows position={[0, 0.01, 0]} opacity={0.6} scale={20} blur={3.5} far={6} />
      <Environment preset="warehouse" />
    </>
  );
}

export default function SpectatorStream() {
  const { id } = useParams();
  const eventId = Number(id);
  const [event, setEvent] = useState(null);
  const [match, setMatch] = useState(null);
  const [standings, setStandings] = useState([]);
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    api.get(`/events/${eventId}`).then(r => setEvent(r.data)).catch(() => {});
    api.get(`/events/${eventId}/standings`).then(r => setStandings(r.data || [])).catch(() => {});
    // Buscar última ronda de matches para reportar el match featured
    api.get(`/events/${eventId}/rounds/1/pairings`).then(r => {
      if (r.data?.length) setMatch(r.data[0]); // Mesa 1
    }).catch(() => {});
  }, [eventId]);

  const playerA = match
    ? { alias: match.player_a_alias, life: 20 - (match.games_b ?? 0) * 5 }
    : standings[0]
    ? { alias: standings[0].alias, life: 20 }
    : { alias: 'PLAYER A', life: 20 };

  const playerB = match
    ? { alias: match.player_b_alias, life: 20 - (match.games_a ?? 0) * 5 }
    : standings[1]
    ? { alias: standings[1].alias, life: 20 }
    : { alias: 'PLAYER B', life: 20 };

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden">
      {/* Background aurora muy tenue */}
      <div className="absolute inset-0 opacity-25 pointer-events-none">
        <AuroraShader seed={eventId * 11} colorA="#7c3aed" colorB="#040415" colorC="#06b6d4" />
      </div>

      <Canvas
        shadows
        camera={{ position: [0, 5.5, 9.5], fov: 42 }}
        gl={{ antialias: true, alpha: true }}
        dpr={[1, 2]}
      >
        <Suspense fallback={null}>
          <DuelScene playerA={playerA} playerB={playerB} lifeA={playerA.life} lifeB={playerB.life} />
        </Suspense>
        <OrbitControls
          enablePan={false}
          enableZoom
          autoRotate={auto}
          autoRotateSpeed={0.6}
          minPolarAngle={Math.PI / 4}
          maxPolarAngle={Math.PI / 2.2}
          minDistance={7}
          maxDistance={16}
        />
      </Canvas>

      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 p-6 pointer-events-none z-10 flex items-start justify-between">
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Link to={`/events/${eventId}/live`} className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white pointer-events-auto">
            <ArrowLeft size={12} /> Volver
          </Link>
          <div className="flex items-center gap-3 mt-2">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/40">
              <Cast size={12} className="text-rose-300 animate-pulse" />
              <span className="text-[10px] uppercase tracking-widest text-rose-200 font-bold">FEATURE TABLE</span>
            </div>
            <span className="text-[10px] text-violet-300/70 uppercase tracking-widest">
              Mesa 1 · Ronda {match?.round_number || 'live'}
            </span>
          </div>
          <h1 className="text-3xl font-black bg-gradient-to-r from-white to-violet-300 bg-clip-text text-transparent mt-2 drop-shadow-2xl">
            {event?.name || 'Spectator Stream'}
          </h1>
        </motion.div>

        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="pointer-events-auto">
          <button
            onClick={() => setAuto(a => !a)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-black/40 backdrop-blur border border-white/10 text-xs hover:bg-white/10"
          >
            <Eye size={12} /> {auto ? 'Cámara auto' : 'Cámara libre'}
          </button>
        </motion.div>
      </div>

      {/* Score footer */}
      <div className="absolute bottom-0 left-0 right-0 p-6 pointer-events-none z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md mx-auto rounded-2xl bg-black/60 backdrop-blur-xl border border-violet-500/30 p-4 flex items-center justify-between"
        >
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-widest text-violet-400 font-bold">A</div>
            <div className="text-2xl font-black">{playerA.alias}</div>
          </div>
          <div className="text-center">
            <div className="text-4xl font-black tabular-nums bg-gradient-to-b from-amber-300 to-orange-500 bg-clip-text text-transparent">
              {match?.games_a ?? 0} – {match?.games_b ?? 0}
            </div>
            <div className="text-[9px] uppercase tracking-widest text-slate-500">BEST OF 3</div>
          </div>
          <div className="text-center">
            <div className="text-[10px] uppercase tracking-widest text-amber-400 font-bold">B</div>
            <div className="text-2xl font-black">{playerB.alias}</div>
          </div>
        </motion.div>
        <div className="text-center mt-3 text-[10px] uppercase tracking-widest text-slate-500">
          <Sparkles size={10} className="inline mr-1" /> Spectator Stream · arrastra para girar · scroll para zoom
        </div>
      </div>
    </div>
  );
}
