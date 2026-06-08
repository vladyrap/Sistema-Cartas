/** Confetti 3D explosion con R3F. Mil partículas instanciadas con física simple. */
import { useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

const COLORS = ['#fbbf24', '#f97316', '#ef4444', '#a78bfa', '#22d3ee', '#10b981', '#ec4899'];

function Pieces({ count = 500 }) {
  const meshRef = useRef();
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const pieces = useMemo(() => {
    return Array.from({ length: count }, () => {
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const speed = 5 + Math.random() * 5;
      return {
        pos: new THREE.Vector3(0, 0, 0),
        vel: new THREE.Vector3(
          Math.sin(phi) * Math.cos(theta) * speed,
          Math.sin(phi) * Math.sin(theta) * speed + 3,
          Math.cos(phi) * speed
        ),
        rot: new THREE.Vector3(Math.random(), Math.random(), Math.random()),
        rotVel: new THREE.Vector3((Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8, (Math.random() - 0.5) * 8),
        color: COLORS[Math.floor(Math.random() * COLORS.length)],
      };
    });
  }, [count]);

  // Set colors once
  useMemo(() => {
    if (!meshRef.current) return;
    const tmp = new THREE.Color();
    pieces.forEach((p, i) => {
      tmp.set(p.color);
      meshRef.current.setColorAt(i, tmp);
    });
    meshRef.current.instanceColor && (meshRef.current.instanceColor.needsUpdate = true);
  }, [pieces]);

  useFrame((_, dt) => {
    const mesh = meshRef.current;
    if (!mesh) return;
    const g = 9.8;
    pieces.forEach((p, i) => {
      p.vel.y -= g * dt;
      p.vel.multiplyScalar(0.985); // drag
      p.pos.addScaledVector(p.vel, dt);
      p.rot.x += p.rotVel.x * dt;
      p.rot.y += p.rotVel.y * dt;
      p.rot.z += p.rotVel.z * dt;
      dummy.position.copy(p.pos);
      dummy.rotation.set(p.rot.x, p.rot.y, p.rot.z);
      dummy.scale.setScalar(0.15);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
    });
    mesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[null, null, count]}>
      <planeGeometry args={[1, 0.4]} />
      <meshStandardMaterial vertexColors side={THREE.DoubleSide} />
    </instancedMesh>
  );
}

export default function Confetti3D({ active }) {
  if (!active) return null;
  return (
    <div className="absolute inset-0 pointer-events-none">
      <Canvas camera={{ position: [0, 5, 14], fov: 50 }} gl={{ alpha: true, antialias: true }}>
        <ambientLight intensity={0.7} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} />
        <Pieces />
      </Canvas>
    </div>
  );
}
