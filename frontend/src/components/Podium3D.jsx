/** Podio 3D para el top 3 al finalizar el torneo. R3F + drei. */
import { Canvas } from '@react-three/fiber';
import { Text, OrbitControls, Float, Stars, ContactShadows } from '@react-three/drei';

function Step({ position, height, color, label, name, points }) {
  return (
    <Float speed={1.2} rotationIntensity={0.1} floatIntensity={0.4}>
      <group position={position}>
        <mesh position={[0, height / 2, 0]} castShadow>
          <boxGeometry args={[1.6, height, 1.6]} />
          <meshStandardMaterial color={color} metalness={0.6} roughness={0.25} emissive={color} emissiveIntensity={0.2} />
        </mesh>
        <Text
          position={[0, height + 0.35, 0]}
          fontSize={0.22}
          color="white"
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.012}
          outlineColor="#0a0a14"
        >
          {name}
        </Text>
        <Text
          position={[0, height + 0.08, 0]}
          fontSize={0.16}
          color={color}
          anchorX="center"
          anchorY="middle"
        >
          {points} MP
        </Text>
        <Text
          position={[0, 0.06, 0.82]}
          fontSize={0.42}
          color="white"
          anchorX="center"
          anchorY="middle"
          fontWeight="bold"
        >
          {label}
        </Text>
      </group>
    </Float>
  );
}

export default function Podium3D({ top3 }) {
  // top3 = [{alias, match_points}, ...]
  const [first, second, third] = [top3[0], top3[1], top3[2]];

  return (
    <div className="w-full h-full">
      <Canvas
        shadows
        camera={{ position: [0, 2.6, 6.5], fov: 45 }}
        gl={{ antialias: true, alpha: true }}
      >
        <color attach="background" args={["#070713"]} />
        <fog attach="fog" args={["#070713", 8, 20]} />
        <ambientLight intensity={0.35} />
        <directionalLight position={[5, 8, 5]} intensity={1.2} castShadow />
        <pointLight position={[-3, 4, 2]} intensity={0.8} color="#a78bfa" />
        <pointLight position={[3, 4, 2]} intensity={0.8} color="#f59e0b" />

        <Stars radius={50} depth={50} count={1500} factor={3} fade speed={1} />

        {second && (
          <Step
            position={[-2.4, 0, 0]}
            height={1.2}
            color="#cbd5e1"
            label="2"
            name={second.alias}
            points={second.match_points}
          />
        )}
        {first && (
          <Step
            position={[0, 0, 0]}
            height={1.8}
            color="#fbbf24"
            label="1"
            name={first.alias}
            points={first.match_points}
          />
        )}
        {third && (
          <Step
            position={[2.4, 0, 0]}
            height={0.85}
            color="#f97316"
            label="3"
            name={third.alias}
            points={third.match_points}
          />
        )}

        <ContactShadows position={[0, 0, 0]} opacity={0.5} scale={10} blur={2.5} far={4} />

        <OrbitControls
          enablePan={false}
          enableZoom={false}
          autoRotate
          autoRotateSpeed={0.5}
          maxPolarAngle={Math.PI / 2.1}
          minPolarAngle={Math.PI / 3}
        />
      </Canvas>
    </div>
  );
}
