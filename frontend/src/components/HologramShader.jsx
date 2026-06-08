/** Plano holográfico shader — scanlines + chromatic shift + edge glow + flicker.
 * Aplica encima de la textura de carta. */
import { Suspense, useMemo, useRef } from 'react';
import { Canvas, useFrame } from '@react-three/fiber';
import { useTexture, Environment } from '@react-three/drei';
import * as THREE from 'three';

const VERT = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPos;
void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vPos = mv.xyz;
  gl_Position = projectionMatrix * mv;
}
`;

const FRAG = `
precision highp float;
uniform sampler2D u_tex;
uniform float u_time;
uniform float u_scan;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vPos;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

void main() {
  // Texture sample base
  vec4 tex = texture2D(u_tex, vUv);

  // Edge fresnel
  vec3 V = normalize(-vPos);
  float fres = 1.0 - clamp(dot(normalize(vNormal), V), 0.0, 1.0);

  // Scanline horizontal grueso descendente
  float scanY = fract(vUv.y * 2.0 - u_time * 0.4);
  float scanBand = smoothstep(0.0, 0.04, scanY) * (1.0 - smoothstep(0.04, 0.1, scanY));

  // Scanlines finas (CRT)
  float lines = sin(vUv.y * 600.0) * 0.5 + 0.5;
  lines = pow(lines, 3.0) * 0.4;

  // Chromatic shift mínimo per-channel
  float shift = 0.0025 + sin(u_time * 0.6) * 0.001;
  float r = texture2D(u_tex, vUv + vec2(shift, 0.0)).r;
  float g = texture2D(u_tex, vUv).g;
  float b = texture2D(u_tex, vUv - vec2(shift, 0.0)).b;
  vec3 chroma = vec3(r, g, b);

  // Noise grain
  float n = hash(vUv * 800.0 + u_time * 0.1) * 0.08;

  // Flicker random
  float flick = 0.95 + 0.05 * sin(u_time * 60.0 + hash(vec2(floor(u_time * 8.0))) * 100.0);

  // Tinte cyan/violet hologram
  vec3 tint = mix(vec3(0.4, 0.8, 1.0), vec3(0.7, 0.4, 1.0), vUv.y);

  // Combinación
  vec3 base = chroma * tint;
  base += scanBand * vec3(0.6, 0.85, 1.0) * 1.5 * u_scan;
  base += lines * vec3(0.2, 0.4, 0.5);
  base += fres * vec3(0.4, 0.8, 1.0) * 1.3;
  base += n;
  base *= flick;

  // Alpha con transparencia parcial + bordes opacos
  float alpha = 0.55 + fres * 0.35 + lines * 0.15;
  gl_FragColor = vec4(base, clamp(alpha, 0.2, 1.0));
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src); gl.compileShader(sh);
  return sh;
}

function HologramPlane({ imageUrl }) {
  const matRef = useRef();
  const meshRef = useRef();
  const tex = useTexture(imageUrl);
  tex.colorSpace = THREE.SRGBColorSpace;

  const uniforms = useMemo(() => ({
    u_tex: { value: tex },
    u_time: { value: 0 },
    u_scan: { value: 1 },
  }), [tex]);

  useFrame((state, dt) => {
    uniforms.u_time.value += dt;
    if (meshRef.current) {
      // Rotación lenta auto + ligera flotación
      meshRef.current.rotation.y += dt * 0.4;
      meshRef.current.position.y = Math.sin(state.clock.elapsedTime * 0.6) * 0.1;
    }
  });

  return (
    <mesh ref={meshRef} castShadow>
      <planeGeometry args={[2.6, 3.6, 32, 32]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        transparent
        side={THREE.DoubleSide}
        depthWrite={false}
      />
    </mesh>
  );
}

function ScanRing() {
  const ref = useRef();
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.z = state.clock.elapsedTime * 0.6;
    ref.current.scale.setScalar(1 + Math.sin(state.clock.elapsedTime * 1.4) * 0.1);
  });
  return (
    <mesh ref={ref} position={[0, 0, -1]}>
      <ringGeometry args={[2.3, 2.45, 64]} />
      <meshBasicMaterial color="#22d3ee" transparent opacity={0.3} side={THREE.DoubleSide} />
    </mesh>
  );
}

function HoloParticles() {
  const ref = useRef();
  const count = 200;
  const positions = useMemo(() => {
    const arr = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 1.5 + Math.random() * 2;
      arr[i * 3] = Math.cos(a) * r;
      arr[i * 3 + 1] = (Math.random() - 0.5) * 4;
      arr[i * 3 + 2] = Math.sin(a) * r;
    }
    return arr;
  }, []);
  useFrame((state) => {
    if (!ref.current) return;
    ref.current.rotation.y += 0.001;
    const pos = ref.current.geometry.attributes.position.array;
    for (let i = 0; i < count; i++) {
      pos[i * 3 + 1] += Math.sin(state.clock.elapsedTime + i) * 0.001;
    }
    ref.current.geometry.attributes.position.needsUpdate = true;
  });
  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" count={count} array={positions} itemSize={3} />
      </bufferGeometry>
      <pointsMaterial color="#67e8f9" size={0.04} transparent opacity={0.7} sizeAttenuation />
    </points>
  );
}

export default function HologramShader({ imageUrl }) {
  if (!imageUrl) return null;
  return (
    <Canvas
      camera={{ position: [0, 0, 5.5], fov: 35 }}
      gl={{ alpha: true, antialias: true }}
      dpr={[1, 2]}
    >
      <color attach="background" args={['#040415']} />
      <ambientLight intensity={0.7} />
      <directionalLight position={[3, 3, 5]} intensity={1.0} />
      <pointLight position={[-3, 0, 3]} intensity={1.5} color="#06b6d4" />
      <pointLight position={[3, 2, 3]} intensity={1.0} color="#a78bfa" />
      <Suspense fallback={null}>
        <HologramPlane imageUrl={imageUrl} />
        <ScanRing />
        <HoloParticles />
        <Environment preset="night" />
      </Suspense>
    </Canvas>
  );
}
