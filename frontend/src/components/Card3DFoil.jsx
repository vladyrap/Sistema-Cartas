/** Carta 3D con shader foil (Fresnel + iridescence). React Three Fiber + drei.
 * Hover sigue el mouse. Flip 3D al click. Partículas opcionales. */
import { Suspense, useMemo, useRef, useState } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Environment, useTexture, Float } from '@react-three/drei';
import * as THREE from 'three';

// Shader iridescence foil — patrón inspirado en MTG foils.
const FOIL_VERT = `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;
void main() {
  vUv = uv;
  vNormal = normalize(normalMatrix * normal);
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const FOIL_FRAG = `
precision highp float;
uniform sampler2D u_tex;
uniform float u_time;
uniform float u_foil;       // 0 → no foil, 1 → full foil
uniform vec3 u_cam;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vWorldPos;

vec3 hue(float h) {
  vec3 c = abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0;
  return clamp(c, 0.0, 1.0);
}

void main() {
  vec4 tex = texture2D(u_tex, vUv);
  vec3 N = normalize(vNormal);
  vec3 V = normalize(u_cam - vWorldPos);
  float NdotV = clamp(dot(N, V), 0.0, 1.0);
  float fresnel = pow(1.0 - NdotV, 2.5);

  // Iridiscencia: hue varía con el ángulo + UVs + tiempo
  float band = fract(vUv.x * 2.6 + vUv.y * 1.7 + u_time * 0.1 + (1.0 - NdotV) * 1.2);
  vec3 iridescence = hue(band) * (0.65 + 0.35 * sin(u_time + vUv.y * 8.0));
  float sparkle = pow(fract(vUv.x * 67.0 + vUv.y * 71.0 + u_time * 2.0), 96.0) * 2.0;

  vec3 base = tex.rgb;
  vec3 foilCol = base * 0.7 + iridescence * 0.6 + vec3(sparkle);
  vec3 finalCol = mix(base, foilCol, u_foil * (0.5 + fresnel * 0.6));

  gl_FragColor = vec4(finalCol, tex.a);
}
`;

function CardMesh({ imageUrl, foil, flipped }) {
  const meshRef = useRef();
  const matRef = useRef();
  const targetRot = useRef({ x: 0, y: 0 });
  const { camera, pointer } = useThree();

  // Texture
  const tex = useTexture(imageUrl);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearMipMapLinearFilter;
  tex.anisotropy = 8;

  const uniforms = useMemo(() => ({
    u_tex: { value: tex },
    u_time: { value: 0 },
    u_foil: { value: foil ? 1 : 0 },
    u_cam: { value: new THREE.Vector3() },
  }), [tex, foil]);

  useFrame((state, dt) => {
    if (!meshRef.current) return;
    uniforms.u_time.value += dt;
    uniforms.u_cam.value.copy(camera.position);
    uniforms.u_foil.value = foil ? 1 : 0;

    // Mouse follow
    targetRot.current.y = pointer.x * 0.6 + (flipped ? Math.PI : 0);
    targetRot.current.x = -pointer.y * 0.4;
    meshRef.current.rotation.x += (targetRot.current.x - meshRef.current.rotation.x) * 0.08;
    meshRef.current.rotation.y += (targetRot.current.y - meshRef.current.rotation.y) * 0.08;
  });

  return (
    <mesh ref={meshRef} castShadow receiveShadow>
      <planeGeometry args={[2.5, 3.5, 32, 32]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={FOIL_VERT}
        fragmentShader={FOIL_FRAG}
        uniforms={uniforms}
        side={THREE.DoubleSide}
        transparent
      />
    </mesh>
  );
}

export default function Card3DFoil({ imageUrl, foil = true, height = 400 }) {
  const [flipped, setFlipped] = useState(false);
  if (!imageUrl) {
    return (
      <div style={{ height }} className="rounded-2xl bg-slate-900/60 border border-white/10 flex items-center justify-center text-sm text-slate-500">
        Sin imagen
      </div>
    );
  }

  return (
    <div
      style={{ height }}
      className="relative cursor-pointer select-none"
      onClick={() => setFlipped(f => !f)}
    >
      <Canvas
        shadows
        camera={{ position: [0, 0, 5], fov: 38 }}
        gl={{ antialias: true, alpha: true, preserveDrawingBuffer: false }}
        dpr={[1, 2]}
      >
        <ambientLight intensity={0.5} />
        <directionalLight position={[3, 5, 4]} intensity={1.4} castShadow />
        <pointLight position={[-3, -3, 3]} intensity={0.6} color="#a78bfa" />
        <pointLight position={[3, 3, 3]} intensity={0.4} color="#f59e0b" />
        <Suspense fallback={null}>
          <Float speed={1.5} rotationIntensity={0.15} floatIntensity={0.25}>
            <CardMesh imageUrl={imageUrl} foil={foil} flipped={flipped} />
          </Float>
          <Environment preset="city" />
        </Suspense>
      </Canvas>
      {foil && (
        <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-gradient-to-r from-violet-500 via-fuchsia-500 to-amber-400 text-[10px] font-black tracking-widest uppercase shadow-lg">
          FOIL
        </div>
      )}
    </div>
  );
}
