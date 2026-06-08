/** Bracket Replay Cinematic — cámara virtual 3D recorre cada nodo del bracket
 * uno por uno con zoom/fly-to, mostrando el match, advance del ganador,
 * y termina con podio. */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import {
  Float, OrbitControls, Stars, Text, RoundedBox, Environment, ContactShadows,
} from '@react-three/drei';
import * as THREE from 'three';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, Play, Pause, Volume2, VolumeX, Crown } from 'lucide-react';

import { api } from '../lib/api';
import AuroraShader from '../components/AuroraShader';
import Podium3D from '../components/Podium3D';
import { useProceduralMusic } from '../lib/useProceduralMusic';

// Bracket layout en 3D: nivel 0 = final (derecha), nivel N = hojas (izquierda)
const NODE_W = 2.6;
const NODE_H = 1.0;
const COL_GAP = 1.4;
const ROW_GAP = 0.5;

function nodePosition(node, totalLevels) {
  const leafLevel = totalLevels - 1;
  const col = leafLevel - node.level;
  const x = col * (NODE_W + COL_GAP) - ((totalLevels - 1) * (NODE_W + COL_GAP)) / 2;
  const rowsInLevel = 2 ** node.level;
  const totalRows = 2 ** leafLevel;
  const rowSpan = totalRows / rowsInLevel;
  const y = (node.slot * rowSpan + rowSpan / 2 - totalRows / 2) * (NODE_H + ROW_GAP);
  return new THREE.Vector3(x, y, 0);
}

function NodeMesh({ node, position, focused, advanced, onClick }) {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    const t = state.clock.elapsedTime;
    if (focused) ref.current.position.z = Math.sin(t * 1.4) * 0.05 + 0.05;
    else ref.current.position.z = 0;
  });
  const settled = node.winner_id !== null;
  const isFinal = node.level === 0;
  return (
    <group ref={ref} position={position} onClick={onClick}>
      <RoundedBox args={[NODE_W, NODE_H, 0.1]} radius={0.06}>
        <meshPhysicalMaterial
          color={isFinal ? '#3a2c0a' : settled ? '#2a1a4a' : '#0e0e1f'}
          metalness={0.55}
          roughness={0.25}
          emissive={focused ? '#a78bfa' : isFinal ? '#fbbf24' : settled ? '#7c3aed' : '#1e1b4b'}
          emissiveIntensity={focused ? 0.7 : settled ? 0.35 : 0.15}
        />
      </RoundedBox>
      {/* Borde */}
      <mesh position={[0, 0, 0.052]}>
        <ringGeometry args={[Math.min(NODE_W, NODE_H) * 0.55, Math.min(NODE_W, NODE_H) * 0.58, 4]} />
        <meshBasicMaterial
          color={isFinal ? '#fbbf24' : focused ? '#a78bfa' : '#7c3aed'}
          transparent
          opacity={focused ? 0.8 : 0.4}
        />
      </mesh>
      {/* Texto seed_a y seed_b */}
      <Text position={[-1.05, 0.20, 0.06]} fontSize={0.16} color="white" anchorX="left" fontWeight="bold">
        {`#${node.seed_a ?? '?'}`}
      </Text>
      <Text position={[-1.05, -0.20, 0.06]} fontSize={0.16} color="white" anchorX="left" fontWeight="bold">
        {`#${node.seed_b ?? '?'}`}
      </Text>
      {settled && (
        <>
          <Text position={[1.05, 0.20, 0.06]} fontSize={0.20}
                color={node.winner_id === node.player_a_id ? '#10b981' : '#64748b'}
                anchorX="right" fontWeight="bold">
            {node.games_a}
          </Text>
          <Text position={[1.05, -0.20, 0.06]} fontSize={0.20}
                color={node.winner_id === node.player_b_id ? '#10b981' : '#64748b'}
                anchorX="right" fontWeight="bold">
            {node.games_b}
          </Text>
        </>
      )}
      <Text position={[0, NODE_H/2 + 0.12, 0.06]} fontSize={0.08} color="#94a3b8"
            anchorX="center" letterSpacing={0.3} fontWeight="bold">
        {isFinal ? 'FINAL' : node.level === 1 ? 'SEMI' : node.level === 2 ? 'CUARTOS' : 'OCTAVOS'}
      </Text>
    </group>
  );
}

function EdgeLine({ from, to, settled }) {
  const points = useMemo(() => [
    new THREE.Vector3(from.x + NODE_W/2, from.y, 0),
    new THREE.Vector3(from.x + NODE_W/2 + COL_GAP/2, from.y, 0),
    new THREE.Vector3(from.x + NODE_W/2 + COL_GAP/2, to.y, 0),
    new THREE.Vector3(to.x - NODE_W/2, to.y, 0),
  ], [from, to]);
  const geom = useMemo(() => new THREE.BufferGeometry().setFromPoints(points), [points]);
  return (
    <line geometry={geom}>
      <lineBasicMaterial
        color={settled ? '#a78bfa' : 'rgba(148,163,184,0.3)'}
        transparent opacity={settled ? 0.9 : 0.3}
        linewidth={settled ? 2 : 1}
      />
    </line>
  );
}

function CameraFly({ targetPos, zoom = 4 }) {
  const { camera } = useThree();
  const target = useRef(new THREE.Vector3());
  const lookTarget = useRef(new THREE.Vector3());
  useFrame(() => {
    if (!targetPos) return;
    target.current.copy(targetPos).add(new THREE.Vector3(0, 0, zoom));
    camera.position.lerp(target.current, 0.04);
    lookTarget.current.lerp(targetPos, 0.06);
    camera.lookAt(lookTarget.current);
  });
  return null;
}

function BracketScene({ nodes, totalLevels, focusedIdx }) {
  const positions = useMemo(() =>
    nodes.map(n => nodePosition(n, totalLevels)),
    [nodes, totalLevels]
  );
  const targetPos = focusedIdx != null && positions[focusedIdx] ? positions[focusedIdx] : new THREE.Vector3();
  return (
    <>
      <color attach="background" args={['#02020a']} />
      <fog attach="fog" args={['#02020a', 6, 22]} />
      <ambientLight intensity={0.4} />
      <directionalLight position={[3, 3, 6]} intensity={1.2} />
      <pointLight position={[0, 0, 5]} intensity={1.4} color="#a78bfa" />
      <Stars radius={50} depth={50} count={1500} factor={3} fade speed={0.4} />

      {/* Edges */}
      {nodes.map((node, i) => {
        if (node.level === 0) return null;
        const parentSlot = Math.floor(node.slot / 2);
        const parent = nodes.find(n => n.level === node.level - 1 && n.slot === parentSlot);
        if (!parent) return null;
        const pIdx = nodes.indexOf(parent);
        return (
          <EdgeLine
            key={`edge-${node.id}`}
            from={positions[i]}
            to={positions[pIdx]}
            settled={node.winner_id !== null}
          />
        );
      })}

      {/* Nodes */}
      {nodes.map((node, i) => (
        <Float key={node.id} speed={0.5} rotationIntensity={0.02} floatIntensity={0.08}>
          <NodeMesh
            node={node}
            position={positions[i]}
            focused={i === focusedIdx}
            advanced={node.winner_id !== null}
          />
        </Float>
      ))}

      <CameraFly targetPos={targetPos} zoom={4} />

      <ContactShadows position={[0, -2, 0]} opacity={0.4} scale={20} blur={3} far={4} />
      <Environment preset="night" />
    </>
  );
}

export default function BracketReplayCinematic() {
  const { id } = useParams();
  const eventId = Number(id);
  const [event, setEvent] = useState(null);
  const [tree, setTree] = useState(null);
  const [focused, setFocused] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [finished, setFinished] = useState(false);
  const [muted, setMuted] = useState(false);
  const music = useProceduralMusic();
  const timerRef = useRef(null);

  useEffect(() => {
    api.get(`/events/${eventId}`).then(r => setEvent(r.data)).catch(() => {});
    api.get(`/events/${eventId}/bracket`).then(r => setTree(r.data)).catch(() => {});
  }, [eventId]);

  const nodes = tree?.nodes || [];
  const totalLevels = tree?.bracket ? Math.log2(tree.bracket.size) : 0;

  // Orden de recorrido: hojas primero, luego niveles superiores
  const cinematicOrder = useMemo(() => {
    return [...nodes].sort((a, b) => {
      if (a.level !== b.level) return b.level - a.level;
      return a.slot - b.slot;
    });
  }, [nodes]);

  const orderedIdx = focused < cinematicOrder.length
    ? nodes.indexOf(cinematicOrder[focused])
    : null;

  // Top 3 final
  const topPlayers = useMemo(() => {
    if (!nodes.length) return [];
    const final = nodes.find(n => n.level === 0);
    const semis = nodes.filter(n => n.level === 1);
    if (!final) return [];
    const champion = final.winner_id;
    const second = final.winner_id === final.player_a_id ? final.player_b_id : final.player_a_id;
    const semiLosers = semis
      .filter(s => s.winner_id != null)
      .map(s => s.winner_id === s.player_a_id ? s.player_b_id : s.player_a_id);
    return [
      { player_id: champion, alias: `Player ${champion}`, match_points: 21 },
      { player_id: second, alias: `Player ${second}`, match_points: 18 },
      { player_id: semiLosers[0], alias: `Player ${semiLosers[0]}`, match_points: 15 },
    ].filter(p => p.player_id);
  }, [nodes]);

  function start() {
    if (!muted) music.start();
    setPlaying(true);
    setFocused(0);
    setFinished(false);
    music.setPhase(1);
    advance();
  }

  function advance() {
    timerRef.current = setTimeout(() => {
      setFocused(f => {
        const next = f + 1;
        if (next >= cinematicOrder.length) {
          setPlaying(false);
          setFinished(true);
          music.setPhase(3);
          music.crescendo();
          return f;
        }
        // Phase scaling
        const pct = next / cinematicOrder.length;
        music.setPhase(pct < 0.4 ? 1 : pct < 0.8 ? 2 : 3);
        advance();
        return next;
      });
    }, 3000);
  }

  function stop() {
    if (timerRef.current) clearTimeout(timerRef.current);
    music.stop();
    setPlaying(false);
    setFocused(0);
    setFinished(false);
  }

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  if (!tree || !tree.bracket) {
    return (
      <div className="fixed inset-0 bg-black text-violet-300 font-mono flex items-center justify-center">
        <div className="text-center">
          <p className="text-xs uppercase tracking-[0.4em]">Sin bracket para este evento</p>
          <Link to={`/events/${eventId}`} className="mt-4 inline-block text-violet-400 hover:text-white text-xs">
            ← Volver al evento
          </Link>
        </div>
      </div>
    );
  }

  const focusedNode = cinematicOrder[focused];

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden">
      <div className="absolute inset-0 opacity-20 pointer-events-none">
        <AuroraShader seed={eventId * 7} colorA="#7c3aed" colorB="#02020a" colorC="#22d3ee" />
      </div>

      {!finished && (
        <Canvas
          shadows
          camera={{ position: [0, 0, 14], fov: 45 }}
          gl={{ antialias: true, alpha: true }}
          dpr={[1, 2]}
        >
          <Suspense fallback={null}>
            <BracketScene nodes={nodes} totalLevels={totalLevels} focusedIdx={playing ? orderedIdx : null} />
          </Suspense>
          {!playing && (
            <OrbitControls
              enablePan={false}
              maxDistance={30}
              minDistance={6}
            />
          )}
        </Canvas>
      )}

      {finished && topPlayers.length >= 3 && (
        <div className="absolute inset-0">
          <Podium3D top3={topPlayers} />
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 1 }}
            className="absolute top-12 left-0 right-0 text-center"
          >
            <Crown size={48} className="text-amber-300 mx-auto drop-shadow-[0_0_40px_rgba(251,191,36,0.8)]" />
            <h1 className="text-5xl font-black mt-4 bg-gradient-to-b from-yellow-100 via-amber-300 to-orange-500 bg-clip-text text-transparent">
              CHAMPIONSHIP
            </h1>
          </motion.div>
        </div>
      )}

      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 p-6 pointer-events-none z-20 flex items-start justify-between">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
          <Link to={`/events/${eventId}/live`} className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white pointer-events-auto">
            <ArrowLeft size={12} /> Volver al live
          </Link>
          <h1 className="text-2xl font-black mt-2 bg-gradient-to-r from-white to-violet-300 bg-clip-text text-transparent">
            {event?.name}
          </h1>
          <div className="text-[10px] uppercase tracking-widest text-violet-400/70 mt-1">
            Bracket Replay · {tree.bracket.size} jugadores
          </div>
        </motion.div>

        {playing && focusedNode && !finished && (
          <motion.div
            key={focused}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="pointer-events-auto"
          >
            <div className="px-4 py-2 rounded-xl bg-violet-500/15 border border-violet-500/40 backdrop-blur">
              <div className="text-[10px] uppercase tracking-widest text-violet-300 font-bold">
                {focusedNode.level === 0 ? 'GRAN FINAL' :
                 focusedNode.level === 1 ? 'SEMIFINAL' :
                 focusedNode.level === 2 ? 'CUARTOS DE FINAL' : 'OCTAVOS'}
              </div>
              <div className="text-sm font-bold mt-0.5">
                Match {focused + 1} de {cinematicOrder.length}
              </div>
            </div>
          </motion.div>
        )}
      </div>

      {/* Controls */}
      <div className="absolute bottom-6 inset-x-0 flex justify-center pointer-events-none z-30">
        <div className="pointer-events-auto flex items-center gap-2 bg-black/70 backdrop-blur-xl border border-violet-500/30 rounded-2xl px-3 py-2">
          {!playing && !finished && (
            <button onClick={start} className="px-5 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-bold uppercase tracking-widest text-xs hover:shadow-lg transition flex items-center gap-2">
              <Play size={14} /> Iniciar cinematic
            </button>
          )}
          {(playing || finished) && (
            <>
              <button onClick={stop} className="p-2 hover:bg-white/10 rounded-lg">
                <Pause size={14} />
              </button>
              <button onClick={() => {
                setMuted(m => {
                  if (!m) music.stop(); else music.start();
                  return !m;
                });
              }} className="p-2 hover:bg-white/10 rounded-lg">
                {muted ? <VolumeX size={14} /> : <Volume2 size={14} className="text-emerald-400" />}
              </button>
              <div className="px-3 text-xs tabular-nums text-violet-300">
                {focused + 1}/{cinematicOrder.length}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
