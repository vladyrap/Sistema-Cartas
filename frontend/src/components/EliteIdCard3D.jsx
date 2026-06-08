/** Credencial Elite ID flotando en 3D — R3F. El alias se deriva del email. */
import { Suspense, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { Text, Float, RoundedBox, Environment } from '@react-three/drei';
import * as THREE from 'three';

function aliasFromEmail(email) {
  if (!email) return 'INVOCADOR';
  const before = email.split('@')[0] || '';
  return (before.replace(/[._-]/g, ' ').toUpperCase() || 'INVOCADOR').slice(0, 18);
}

function CardMesh({ email, mousePos }) {
  const groupRef = useRef();

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.elapsedTime;
    // Levitación + parallax con mouse
    groupRef.current.position.y = Math.sin(t * 0.7) * 0.1;
    groupRef.current.rotation.y = 0.2 + Math.sin(t * 0.4) * 0.06 + mousePos.x * 0.3;
    groupRef.current.rotation.x = -0.1 + mousePos.y * 0.2;
  });

  const alias = aliasFromEmail(email);
  const codeDigits = String(Math.abs(alias.charCodeAt(0) * 137 + alias.length * 7) % 100000).padStart(5, '0');

  return (
    <group ref={groupRef}>
      {/* Cuerpo de la card */}
      <Float speed={1.4} rotationIntensity={0.05} floatIntensity={0.3}>
        <RoundedBox args={[3, 1.85, 0.08]} radius={0.12} smoothness={4}>
          <meshPhysicalMaterial
            color="#1a1a2e"
            metalness={0.7}
            roughness={0.18}
            clearcoat={1}
            clearcoatRoughness={0.1}
            emissive="#3b1d75"
            emissiveIntensity={0.18}
          />
        </RoundedBox>
        {/* Borde luminoso */}
        <mesh position={[0, 0, 0.041]}>
          <ringGeometry args={[1.65, 1.71, 64]} />
          <meshBasicMaterial color="#a78bfa" transparent opacity={0.4} />
        </mesh>
        {/* "ELITE ID" */}
        <Text
          position={[-1.25, 0.65, 0.05]}
          fontSize={0.14}
          color="#a78bfa"
          anchorX="left"
          letterSpacing={0.3}
          outlineWidth={0.005}
          outlineColor="#000"
        >
          ELITE ID
        </Text>
        {/* Alias */}
        <Text
          position={[-1.25, 0.25, 0.05]}
          fontSize={0.32}
          color="white"
          anchorX="left"
          fontWeight="bold"
          outlineWidth={0.008}
          outlineColor="#000"
        >
          {alias}
        </Text>
        {/* Código */}
        <Text
          position={[-1.25, -0.18, 0.05]}
          fontSize={0.16}
          color="#fbbf24"
          anchorX="left"
          letterSpacing={0.15}
        >
          {`EC-${codeDigits}`}
        </Text>
        {/* Badge clase */}
        <Text
          position={[-1.25, -0.55, 0.05]}
          fontSize={0.1}
          color="#94a3b8"
          anchorX="left"
          letterSpacing={0.25}
        >
          DUELISTA · TEMPORADA III
        </Text>
        {/* Holograma chip */}
        <mesh position={[1.1, -0.4, 0.041]}>
          <boxGeometry args={[0.45, 0.32, 0.02]} />
          <meshStandardMaterial
            color="#fbbf24"
            metalness={0.9}
            roughness={0.15}
            emissive="#f97316"
            emissiveIntensity={0.3}
          />
        </mesh>
        {/* Líneas decorativas chip */}
        <mesh position={[1.1, -0.4, 0.05]}>
          <planeGeometry args={[0.36, 0.025]} />
          <meshBasicMaterial color="#1a1a2e" />
        </mesh>
      </Float>
    </group>
  );
}

export default function EliteIdCard3D({ email, mousePos = { x: 0, y: 0 } }) {
  return (
    <Canvas camera={{ position: [0, 0, 4], fov: 35 }} gl={{ alpha: true, antialias: true }}>
      <ambientLight intensity={0.55} />
      <directionalLight position={[3, 4, 5]} intensity={1.2} />
      <pointLight position={[-3, -3, 3]} intensity={0.5} color="#a78bfa" />
      <pointLight position={[3, 3, 2]} intensity={0.4} color="#fbbf24" />
      <Suspense fallback={null}>
        <CardMesh email={email} mousePos={mousePos} />
        <Environment preset="city" />
      </Suspense>
    </Canvas>
  );
}
