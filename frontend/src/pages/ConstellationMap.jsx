import { Suspense, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Html, Stars } from '@react-three/drei';
import { motion } from 'framer-motion';
import { Globe2, Search, Sparkles } from 'lucide-react';
import Navbar from '../components/Navbar';
import EmptyState from '../components/EmptyState';
import { api } from '../lib/api';

export default function ConstellationMap() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    api.get('/constellation/', { params: { limit: 100, threshold: 0.85 } })
      .then((r) => setData(r.data))
      .catch((e) => setError(e?.response?.data?.detail || 'No se pudo cargar'));
  }, []);

  const filtered = useMemo(() => {
    if (!data) return null;
    const q = search.trim().toLowerCase();
    if (!q) return data;
    const matchedIds = new Set(
      data.nodes.filter((n) => n.alias.toLowerCase().includes(q)).map((n) => n.id)
    );
    return {
      ...data,
      nodes: data.nodes.map((n) => ({ ...n, highlighted: matchedIds.has(n.id) })),
    };
  }, [data, search]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <EmptyState icon={Globe2} title="No disponible" description={error} accent="violet" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-black text-white">
        <Navbar />
        <div className="max-w-4xl mx-auto px-6 py-20 text-center text-slate-400">
          Mapeando constelaciones…
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white relative">
      <Navbar />

      <div className="relative h-[calc(100vh-3.5rem)]">
        {/* HUD */}
        <div className="absolute top-4 left-4 right-4 z-10 flex justify-between items-start gap-4 pointer-events-none">
          <div className="pointer-events-auto bg-black/60 backdrop-blur-xl rounded-2xl border border-violet-500/30 p-4 max-w-xs">
            <div className="inline-flex items-center gap-2 mb-1">
              <Globe2 size={14} className="text-violet-300" />
              <span className="text-[10px] uppercase tracking-[0.5em] text-violet-300 font-bold">
                Constellation
              </span>
            </div>
            <h1 className="text-xl font-black tracking-tight">Mapa de jugadores</h1>
            <p className="text-xs text-slate-400 mt-1">
              {data.nodes.length} estrellas · {data.edges.length} lazos · {data.season_name || ''}
            </p>

            <div className="mt-3 relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar alias…"
                className="w-full pl-7 pr-2 py-1.5 rounded-lg bg-white/[0.05] border border-white/10 text-xs"
              />
            </div>
          </div>

          {hovered && (
            <motion.div
              initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
              className="pointer-events-auto bg-black/70 backdrop-blur-xl rounded-2xl border border-violet-500/30 p-4 min-w-[200px]"
            >
              <div className="text-[10px] uppercase tracking-widest text-violet-300 font-bold">
                {hovered.is_champion ? '👑 Campeón' : 'Estrella'}
              </div>
              <div className="text-lg font-black mt-1">{hovered.alias}</div>
              <div className="text-xs text-slate-400 font-mono">{hovered.elite_id}</div>
              <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                <div>
                  <div className="text-[9px] uppercase text-slate-500 font-bold">Rating</div>
                  <div className="font-black text-violet-300">{hovered.rating}</div>
                </div>
                <div>
                  <div className="text-[9px] uppercase text-slate-500 font-bold">WR</div>
                  <div className="font-black text-emerald-300">{Math.round(hovered.winrate * 100)}%</div>
                </div>
                <div className="col-span-2">
                  <div className="text-[9px] uppercase text-slate-500 font-bold">Archetype</div>
                  <div className="text-amber-300 truncate">{hovered.top_archetype || '?'}</div>
                </div>
              </div>
            </motion.div>
          )}
        </div>

        {/* 3D scene */}
        <Canvas camera={{ position: [0, 0, 280], fov: 60 }} className="bg-gradient-to-br from-slate-950 via-violet-950/40 to-black">
          <ambientLight intensity={0.3} />
          <pointLight position={[100, 100, 100]} intensity={1} color="#a78bfa" />
          <pointLight position={[-100, -100, -100]} intensity={0.5} color="#ec4899" />
          <Stars radius={400} depth={50} count={1500} factor={4} fade speed={0.5} />

          <Suspense fallback={null}>
            <Graph
              data={filtered}
              onHover={setHovered}
            />
          </Suspense>

          <OrbitControls enableDamping dampingFactor={0.06} maxDistance={500} minDistance={80} />
        </Canvas>
      </div>
    </div>
  );
}

function Graph({ data, onHover }) {
  const navigate = useNavigate();
  if (!data) return null;
  return (
    <>
      {data.edges.map((e, i) => {
        const a = data.nodes.find((n) => n.id === e.a);
        const b = data.nodes.find((n) => n.id === e.b);
        if (!a || !b) return null;
        return <Edge key={i} a={a} b={b} weight={e.weight} />;
      })}
      {data.nodes.map((n) => (
        <Star key={n.id} node={n} onHover={onHover} onClick={() => navigate(`/players/${n.id}`)} />
      ))}
    </>
  );
}

function Star({ node, onHover, onClick }) {
  const dim = node.highlighted === false;
  const color = node.is_champion ? '#fbbf24' : node.highlighted ? '#f0abfc' : '#a78bfa';
  const size = node.is_champion ? 4.2 : 1.8 + Math.min(2.5, node.matches / 12);
  return (
    <mesh
      position={[node.x, node.y, node.z]}
      onPointerOver={(e) => { e.stopPropagation(); onHover(node); document.body.style.cursor = 'pointer'; }}
      onPointerOut={() => { onHover(null); document.body.style.cursor = 'default'; }}
      onClick={onClick}
    >
      <sphereGeometry args={[size, 16, 16]} />
      <meshStandardMaterial
        color={color}
        emissive={color}
        emissiveIntensity={dim ? 0.1 : (node.is_champion ? 1.8 : 0.8)}
        opacity={dim ? 0.2 : 1}
        transparent
      />
      {node.is_champion && (
        <Html distanceFactor={120} position={[0, 6, 0]} center>
          <div className="text-amber-300 text-xs font-black uppercase tracking-widest pointer-events-none whitespace-nowrap">
            👑 {node.alias}
          </div>
        </Html>
      )}
    </mesh>
  );
}

function Edge({ a, b, weight }) {
  const points = useMemo(() => [
    [a.x, a.y, a.z],
    [b.x, b.y, b.z],
  ], [a, b]);
  return (
    <line>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={2}
          array={new Float32Array(points.flat())}
          itemSize={3}
        />
      </bufferGeometry>
      <lineBasicMaterial color="#7c3aed" opacity={Math.min(0.5, weight * 0.6)} transparent />
    </line>
  );
}
