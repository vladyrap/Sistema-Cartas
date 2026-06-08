/** Shader full-screen audio-reactive — bass modula swirl/scale, mids modulan
 * color shift, treble modula sparkles. */
import { useEffect, useRef } from 'react';

const VERT = `attribute vec2 a_pos; void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_bass;
uniform float u_mid;
uniform float u_treble;
uniform float u_seed;

vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i = floor(v + dot(v, C.yy));
  vec2 x0 = v -   i + dot(i, C.xx);
  vec2 i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0);
  vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1;
  i = mod289(i);
  vec3 p = permute(permute(i.y + vec3(0.0, i1.y, 1.0)) + i.x + vec3(0.0, i1.x, 1.0));
  vec3 m = max(0.5 - vec3(dot(x0, x0), dot(x12.xy, x12.xy), dot(x12.zw, x12.zw)), 0.0);
  m = m*m; m = m*m;
  vec3 x = 2.0 * fract(p * C.www) - 1.0;
  vec3 h = abs(x) - 0.5;
  vec3 ox = floor(x + 0.5);
  vec3 a0 = x - ox;
  m *= 1.79284291400159 - 0.85373472095314 * (a0*a0 + h*h);
  vec3 g;
  g.x  = a0.x  * x0.x  + h.x  * x0.y;
  g.yz = a0.yz * x12.xz + h.yz * x12.yw;
  return 130.0 * dot(m, g);
}

float fbm(vec2 p, float oct) {
  float f = 0.0; float a = 0.5;
  for (int i = 0; i < 5; i++) {
    if (float(i) >= oct) break;
    f += a * snoise(p);
    p *= 2.0; a *= 0.5;
  }
  return f;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  float r = length(uv);

  // Swirl basado en bass — el centro rota más rápido con bass alto
  float angle = atan(uv.y, uv.x);
  angle += (u_bass * 2.5 + 0.4) / (r + 0.3) - u_time * (0.05 + u_bass * 0.4);
  vec2 swirled = vec2(cos(angle), sin(angle)) * r;

  // Scale pulsing con bass
  float scale = 2.0 + u_bass * 4.0;
  vec2 p = swirled * scale + vec2(u_seed * 0.1, u_seed * 0.07);

  float n1 = fbm(p, 4.0 + u_mid * 2.0);
  float n2 = fbm(p * 2.2 + u_time * 0.3, 3.0);

  // Color base shift por mid
  float hueShift = u_mid * 0.6;
  vec3 colA = vec3(0.49 + hueShift * 0.4, 0.20, 0.91);  // violeta → rosa
  vec3 colB = vec3(0.13, 0.71, 0.99);                    // cian
  vec3 colC = vec3(0.99, 0.74, 0.10);                    // ámbar

  vec3 col = mix(colA, colB, smoothstep(-0.5, 0.7, n1));
  col = mix(col, colC, n2 * 0.5 + 0.2 * u_treble);

  // Brillo basado en bass
  col *= 0.7 + u_bass * 1.2;

  // Sparkles agudo treble
  float spark = pow(max(0.0, snoise(uv * (40.0 + u_treble * 60.0))), 24.0);
  col += spark * vec3(1.0) * u_treble * 4.0;

  // Vignette
  col *= 0.55 + 0.55 * smoothstep(1.3, 0.0, r);

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src); gl.compileShader(sh);
  return sh;
}

export default function AudioReactiveShader({ bass = 0, mid = 0, treble = 0, seed = 0, className = '' }) {
  const canvasRef = useRef(null);
  const bassRef = useRef(0);
  const midRef = useRef(0);
  const trebleRef = useRef(0);
  bassRef.current = bass; midRef.current = mid; trebleRef.current = treble;

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

    const u_res = gl.getUniformLocation(prog, 'u_res');
    const u_time = gl.getUniformLocation(prog, 'u_time');
    const u_bass = gl.getUniformLocation(prog, 'u_bass');
    const u_mid = gl.getUniformLocation(prog, 'u_mid');
    const u_treble = gl.getUniformLocation(prog, 'u_treble');
    const u_seed = gl.getUniformLocation(prog, 'u_seed');

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = c.clientWidth * dpr, h = c.clientHeight * dpr;
      if (c.width !== w || c.height !== h) {
        c.width = w; c.height = h; gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(u_res, w, h);
    }
    resize();
    window.addEventListener('resize', resize);
    gl.uniform1f(u_seed, seed);

    const t0 = performance.now();
    let frame;
    function loop() {
      resize();
      gl.uniform1f(u_time, (performance.now() - t0) / 1000);
      gl.uniform1f(u_bass, bassRef.current);
      gl.uniform1f(u_mid, midRef.current);
      gl.uniform1f(u_treble, trebleRef.current);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      frame = requestAnimationFrame(loop);
    }
    loop();
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
    };
  }, [seed]);

  return <canvas ref={canvasRef} className={`block w-full h-full ${className}`} />;
}
