/** Cosmos Hall of Fame: planetario 3D con jugadores como estrellas.
 * - InstancedMesh con tamaños/colores per-instance
 * - Líneas de match entre estrellas (LineSegments)
 * - Cámara orbital + fly-to en click
 * - Click en estrella → fly + overlay info card
 * - Champion path resaltado dorado pulsante
 */
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Html, AdaptiveDpr } from '@react-three/drei';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, Crown, Sparkles, Star, ArrowLeft } from 'lucide-react';
import * as THREE from 'three';
import clsx from 'clsx';

import { api } from '../lib/api';

const SCALE = 12;  // radio de la esfera principal

function hueToRGB(h) {
  // Conversión rápida HSL → RGB con S=0.85 L=0.55
  const c = new THREE.Color();
  c.setHSL(h / 360, 0.85, 0.6);
  return c;
}

function StarField({ stars, championId, onSelect, focusId }) {
  const groupRef = useRef();
  const instancedRef = useRef();
  const championStarRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const positions = useMemo(() => stars.map(s => new THREE.Vector3(s.x * SCALE, s.y * SCALE, s.z * SCALE)), [stars]);

  // Build instanced mesh
  useEffect(() => {
    if (!instancedRef.current) return;
    const mesh = instancedRef.current;
    const color = new THREE.Color();
    stars.forEach((s, i) => {
      const p = positions[i];
      dummy.position.copy(p);
      const size = 0.35 + s.size * 0.55;
      dummy.scale.setScalar(size);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      color.copy(hueToRGB(s.hue));
      color.multiplyScalar(0.6 + s.luminosity * 0.7);
      mesh.setColorAt(i, color);
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [stars, positions, dummy]);

  useFrame((state) => {
    if (groupRef.current) {
      // Rotación suave del enjambre
      groupRef.current.rotation.y += 0.0008;
    }
    // Pulse del campeón
    if (championStarRef.current) {
      const t = state.clock.elapsedTime;
      championStarRef.current.scale.setScalar(1 + Math.sin(t * 2.4) * 0.18);
    }
  });

  const championStar = stars.find(s => s.player_id === championId);
  const championPos = championStar ? positions[stars.indexOf(championStar)] : null;

  return (
    <group ref={groupRef}>
      <instancedMesh
        ref={instancedRef}
        args={[null, null, stars.length]}
        frustumCulled={false}
        onClick={(e) => {
          e.stopPropagation();
          if (e.instanceId != null) onSelect(stars[e.instanceId]);
        }}
        onPointerOver={(e) => { document.body.style.cursor = 'pointer'; }}
        onPointerOut={(e) => { document.body.style.cursor = 'default'; }}
      >
        <sphereGeometry args={[1, 14, 14]} />
        <meshBasicMaterial vertexColors toneMapped={false} />
      </instancedMesh>

      {/* Halo glow del champion */}
      {championPos && (
        <mesh ref={championStarRef} position={championPos}>
          <ringGeometry args={[1.4, 1.8, 32]} />
          <meshBasicMaterial color="#fbbf24" transparent opacity={0.6} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* Star sprites grandes para top-rated (los principales nodos del Hall) */}
      {stars
        .filter(s => s.size > 1.5 || s.championships > 0)
        .map((s, i) => (
          <mesh
            key={`big-${s.player_id}`}
            position={[s.x * SCALE, s.y * SCALE, s.z * SCALE]}
          >
            <sphereGeometry args={[s.size * 0.65, 18, 18]} />
            <meshStandardMaterial
              color={hueToRGB(s.hue)}
              emissive={hueToRGB(s.hue)}
              emissiveIntensity={1.3 + s.luminosity}
              toneMapped={false}
            />
          </mesh>
        ))}

      {/* Focused star label */}
      {focusId != null && (() => {
        const f = stars.find(s => s.player_id === focusId);
        if (!f) return null;
        return (
          <Html
            position={[f.x * SCALE, f.y * SCALE + (0.4 + f.size * 0.5), f.z * SCALE]}
            center
            distanceFactor={10}
            occlude={false}
          >
            <div className="px-2 py-1 rounded-md bg-black/80 backdrop-blur text-[10px] font-bold uppercase tracking-widest text-white whitespace-nowrap">
              {f.alias}
            </div>
          </Html>
        );
      })()}
    </group>
  );
}

function EdgeLines({ stars, edges }) {
  const positions = useMemo(() => {
    const map = new Map(stars.map(s => [s.player_id, s]));
    const arr = [];
    for (const e of edges) {
      const a = map.get(e.a); const b = map.get(e.b);
      if (!a || !b) continue;
      arr.push(a.x * SCALE, a.y * SCALE, a.z * SCALE);
      arr.push(b.x * SCALE, b.y * SCALE, b.z * SCALE);
    }
    return new Float32Array(arr);
  }, [stars, edges]);

  if (!positions.length) return null;

  return (
    <lineSegments>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={positions.length / 3}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color="#7c3aed" transparent opacity={0.18} toneMapped={false} />
    </lineSegments>
  );
}

function CameraFlyTo({ target }) {
  const { camera } = useThree();
  useFrame(() => {
    if (!target) return;
    const desired = new THREE.Vector3(target.x * SCALE, target.y * SCALE, target.z * SCALE);
    const distance = 3.5;
    const dir = desired.clone().normalize().multiplyScalar(SCALE + distance);
    camera.position.lerp(dir, 0.06);
    camera.lookAt(desired);
  });
  return null;
}

function NebulaBg() {
  return (
    <>
      <color attach="background" args={["#04040c"]} />
      <fog attach="fog" args={["#04040c", 25, 60]} />
      <Stars radius={120} depth={70} count={6000} factor={4} fade speed={0.5} />
    </>
  );
}

export default function Cosmos() {
  const [data, setData] = useState({ stars: [], edges: [], champion_id: null });
  const [selected, setSelected] = useState(null);
  const [search, setSearch] = useState('');
  const [hoverId, setHoverId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get('/cosmos').then(r => { setData(r.data); setLoading(false); });
  }, []);

  const flyTarget = selected || data.stars.find(s => s.alias.toLowerCase().includes(search.toLowerCase()) && search.length >= 2);

  return (
    <div className="fixed inset-0 bg-black text-white overflow-hidden">
      <Canvas
        camera={{ position: [0, 0, 30], fov: 50, near: 0.1, far: 200 }}
        dpr={[1, 2]}
        gl={{ antialias: true, powerPreference: 'high-performance' }}
      >
        <AdaptiveDpr pixelated />
        <ambientLight intensity={0.4} />
        <pointLight position={[0, 0, 0]} intensity={2.5} color="#a78bfa" distance={28} />
        <Suspense fallback={null}>
          <NebulaBg />
          {data.stars.length > 0 && (
            <>
              <EdgeLines stars={data.stars} edges={data.edges} />
              <StarField
                stars={data.stars}
                championId={data.champion_id}
                onSelect={setSelected}
                focusId={hoverId || selected?.player_id}
              />
            </>
          )}
          <CameraFlyTo target={flyTarget} />
        </Suspense>
        <OrbitControls
          enableDamping
          dampingFactor={0.06}
          enablePan={false}
          autoRotate={!selected && !search}
          autoRotateSpeed={0.4}
          minDistance={12}
          maxDistance={60}
        />
      </Canvas>

      {/* HUD */}
      <div className="absolute top-0 left-0 right-0 p-6 pointer-events-none z-10 flex items-start justify-between gap-4">
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="pointer-events-auto">
          <Link to="/leaderboard" className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-white mb-3">
            <ArrowLeft size={12} /> Volver
          </Link>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={14} className="text-violet-400" />
            <span className="text-[10px] uppercase tracking-widest text-violet-300 font-bold">Hall of Fame</span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black bg-gradient-to-r from-violet-200 via-white to-fuchsia-200 bg-clip-text text-transparent drop-shadow-2xl">
            COSMOS
          </h1>
          <p className="text-slate-400 text-sm mt-1 max-w-md">
            {data.stars.length} estrellas · {data.edges.length} conexiones forjadas
          </p>
        </motion.div>

        {/* Search */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} className="pointer-events-auto w-64">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar jugador…"
              className="w-full pl-9 pr-9 py-2.5 rounded-xl bg-black/40 backdrop-blur border border-white/10 focus:border-violet-400 outline-none text-sm placeholder:text-slate-500"
            />
            {search && (
              <button onClick={() => setSearch('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded hover:bg-white/10">
                <X size={12} />
              </button>
            )}
          </div>
        </motion.div>
      </div>

      {/* Detail card */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0, x: 60 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: 60 }}
            transition={{ type: 'spring', damping: 22 }}
            className="absolute right-6 bottom-6 z-10 w-80 rounded-2xl bg-black/70 backdrop-blur-xl border p-5 shadow-2xl"
            style={{
              borderColor: `hsla(${selected.hue}, 80%, 60%, 0.5)`,
              boxShadow: `0 0 60px hsla(${selected.hue}, 80%, 50%, 0.25)`,
            }}
          >
            <button onClick={() => setSelected(null)} className="absolute top-3 right-3 p-1 rounded hover:bg-white/10">
              <X size={14} />
            </button>

            <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-bold mb-2"
                 style={{ color: `hsl(${selected.hue}, 80%, 65%)` }}>
              <Star size={11} fill="currentColor" /> Estrella · {selected.player_class}
            </div>
            <h2 className="text-2xl font-black mb-1">{selected.alias}</h2>
            <p className="text-xs font-mono text-slate-500 mb-4">{selected.elite_id_code}</p>

            <div className="grid grid-cols-3 gap-2 mb-4">
              <Stat label="Rating" value={selected.rating ? Math.round(selected.rating) : '—'} accent="violet" />
              <Stat label="Partidas" value={selected.matches} />
              <Stat label="Coronas" value={selected.championships} accent="amber" icon={selected.championships > 0 ? Crown : null} />
            </div>

            <Link
              to={`/players/${selected.player_id}`}
              className="block text-center text-xs py-2 rounded-lg bg-white/5 hover:bg-white/10 text-violet-200 transition"
            >
              Ver perfil →
            </Link>
            {selected.player_id === data.champion_id && (
              <Link
                to={`/players/${selected.player_id}/vision`}
                className="block text-center text-xs py-2 mt-2 rounded-lg bg-gradient-to-r from-amber-500/30 via-orange-500/30 to-rose-500/30 hover:from-amber-500/40 hover:to-rose-500/40 text-amber-100 font-bold transition"
              >
                <Crown size={12} className="inline mr-1" /> Champion's Vision →
              </Link>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Legend */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1 }}
        className="absolute bottom-6 left-6 z-10 flex flex-wrap gap-3 pointer-events-none max-w-md"
      >
        {Object.entries({
          DUELISTA: 0, ESTRATEGA: 220, MENTOR: 45, COLECCIONISTA: 280, TRADER: 140, EXPLORADOR: 180,
        }).map(([cls, hue]) => (
          <div key={cls} className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-slate-400">
            <span className="w-2.5 h-2.5 rounded-full" style={{ background: `hsl(${hue}, 80%, 60%)`, boxShadow: `0 0 8px hsl(${hue}, 80%, 60%)` }} />
            {cls}
          </div>
        ))}
      </motion.div>

      {loading && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400 z-20 pointer-events-none">
          Cargando cosmos…
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, accent = 'slate', icon: Icon }) {
  const color = {
    violet: 'text-violet-300',
    amber: 'text-amber-300',
    slate: 'text-white',
  }[accent];
  return (
    <div className="bg-white/[0.03] rounded-lg p-2 text-center">
      <div className="text-[9px] uppercase text-slate-500">{label}</div>
      <div className={clsx('text-lg font-black tabular-nums flex items-center justify-center gap-1', color)}>
        {Icon && <Icon size={12} />}
        {value}
      </div>
    </div>
  );
}
