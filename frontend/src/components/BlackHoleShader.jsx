/** Agujero negro WebGL — disco de acreción con Doppler shift + lensing simulado.
 * Sin libs externas, raw shader. */
import { useEffect, useRef } from 'react';

const VERT = `attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_intensity;

float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), u.x),
             mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), u.x), u.y);
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y);
  float r = length(uv);
  float a = atan(uv.y, uv.x);

  // Event horizon
  float horizon = 0.14;
  float photonRing = smoothstep(0.18, 0.16, r) - smoothstep(horizon + 0.005, horizon, r);

  // Accretion disk — anillo de partículas calientes
  float diskInner = 0.18;
  float diskOuter = 0.55;
  float ring = smoothstep(diskInner, diskInner + 0.04, r) * (1.0 - smoothstep(diskOuter - 0.1, diskOuter, r));

  // Velocidad angular: cerca del horizonte rota MUY rápido (Doppler)
  float omega = 1.0 / max(0.15, r);
  float spiral = a * 2.5 + omega * u_time * 0.6 + noise(vec2(r * 14.0, a * 5.0)) * 1.4;
  float stream = sin(spiral) * 0.5 + 0.5;
  stream = pow(stream, 2.0);

  float diskBrightness = ring * stream;

  // Doppler shift: lado que viene hacia nosotros (uv.x > 0 invertido) → más azul/blanco
  float doppler = cos(a);
  vec3 hotColor = mix(vec3(1.0, 0.4, 0.05), vec3(1.0, 0.95, 0.85), max(0.0, doppler) * 0.8);
  vec3 coldColor = mix(vec3(0.7, 0.25, 0.6), vec3(0.4, 0.2, 0.5), max(0.0, -doppler) * 0.6);
  vec3 diskColor = mix(coldColor, hotColor, max(0.0, doppler) * 0.5 + 0.5);
  diskColor *= (1.4 + sin(u_time * 1.4 + a * 8.0) * 0.2);

  // Gravitational lensing: hot rim
  vec3 photon = vec3(1.0, 0.7, 0.3) * photonRing * 3.0;

  // Event horizon es negro absoluto
  float horizonMask = smoothstep(horizon, horizon - 0.01, r);

  vec3 col = diskColor * diskBrightness + photon;
  col *= (1.0 - horizonMask);
  col *= u_intensity;

  // Stars background mezcladas
  float stars = pow(noise(uv * 80.0 + u_time * 0.02), 22.0) * 0.6;
  if (r > 0.6) col += vec3(stars);

  // Vignette
  col *= 0.7 + 0.5 * smoothstep(1.3, 0.0, r);

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src); gl.compileShader(sh);
  return sh;
}

export default function BlackHoleShader({ intensity = 1.0, className = '' }) {
  const canvasRef = useRef(null);
  const intensityRef = useRef(intensity);
  intensityRef.current = intensity;

  useEffect(() => {
    const c = canvasRef.current;
    const gl = c.getContext('webgl', { antialias: false });
    if (!gl) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog); gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,1,-1,-1,1,1,1]), gl.STATIC_DRAW);
    const a = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uTime = gl.getUniformLocation(prog, 'u_time');
    const uInt = gl.getUniformLocation(prog, 'u_intensity');

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.clientWidth * dpr, h = c.clientHeight * dpr;
      if (c.width !== w || c.height !== h) {
        c.width = w; c.height = h; gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(uRes, w, h);
    }
    resize();
    window.addEventListener('resize', resize);

    const t0 = performance.now();
    let frame;
    function loop() {
      resize();
      gl.uniform1f(uTime, (performance.now() - t0) / 1000);
      gl.uniform1f(uInt, intensityRef.current);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      frame = requestAnimationFrame(loop);
    }
    loop();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas ref={canvasRef} className={`block w-full h-full ${className}`} />;
}
