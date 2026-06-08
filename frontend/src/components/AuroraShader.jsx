/** Background WebGL fullscreen con shader aurora/galaxy procedural.
 * Sin libs externas — WebGL nativo + GLSL.
 *
 * `seed` permite que cada usuario tenga su variante (color shift, ruido base).
 */
import { useEffect, useRef } from 'react';

const VERT = `
attribute vec2 a_pos;
void main() { gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

const FRAG = `
precision highp float;
uniform vec2 u_res;
uniform float u_time;
uniform float u_seed;
uniform vec3 u_color_a;
uniform vec3 u_color_b;
uniform vec3 u_color_c;

// Simplex-ish noise basado en hash
vec3 mod289(vec3 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec2 mod289(vec2 x) { return x - floor(x * (1.0/289.0)) * 289.0; }
vec3 permute(vec3 x) { return mod289(((x*34.0)+1.0)*x); }
float snoise(vec2 v) {
  const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439);
  vec2 i  = floor(v + dot(v, C.yy));
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

float fbm(vec2 p) {
  float f = 0.0;
  float a = 0.5;
  for (int i = 0; i < 5; i++) {
    f += a * snoise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return f;
}

void main() {
  vec2 uv = (gl_FragCoord.xy - 0.5 * u_res) / u_res.y;
  uv += vec2(u_seed * 0.1, u_seed * 0.07);

  // Movimiento lento + warp con tiempo
  vec2 q = vec2(fbm(uv + vec2(u_time * 0.04, 0.0)),
                fbm(uv + vec2(0.0, u_time * 0.04)));
  vec2 p = uv + 0.6 * q;
  float n = fbm(p * 1.8 + u_time * 0.06);
  float n2 = fbm(p * 4.0 - u_time * 0.03);

  // Mezcla tres colores como nubes de gas
  float t = smoothstep(-0.6, 0.7, n);
  float t2 = smoothstep(0.0, 0.9, n2);
  vec3 col = mix(u_color_a, u_color_b, t);
  col = mix(col, u_color_c, t2 * 0.6);

  // Estrellas pequeñas
  float stars = pow(max(0.0, snoise(uv * 80.0 + u_seed * 5.0)), 32.0) * 1.6;
  col += vec3(stars);

  // Vignette
  float vig = smoothstep(1.4, 0.2, length(uv));
  col *= 0.6 + 0.5 * vig;

  // Glow extra arriba (aurora)
  float glow = smoothstep(0.5, -0.4, uv.y) * (0.4 + 0.4 * sin(u_time * 0.5));
  col += u_color_a * glow * 0.2;

  gl_FragColor = vec4(col, 1.0);
}
`;

function compile(gl, type, src) {
  const sh = gl.createShader(type);
  gl.shaderSource(sh, src); gl.compileShader(sh);
  if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
    console.error(gl.getShaderInfoLog(sh)); gl.deleteShader(sh); return null;
  }
  return sh;
}

// Convierte hex "#7c3aed" → [r,g,b] 0..1
function hex(h) {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(h);
  if (!m) return [0.5, 0.5, 0.5];
  return [parseInt(m[1], 16) / 255, parseInt(m[2], 16) / 255, parseInt(m[3], 16) / 255];
}

export default function AuroraShader({
  seed = 0,
  colorA = '#7c3aed',
  colorB = '#0f0f19',
  colorC = '#22d3ee',
  className = '',
}) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const gl = canvas.getContext('webgl', { antialias: false, premultipliedAlpha: false });
    if (!gl) return;
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    const a_pos = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(a_pos);
    gl.vertexAttribPointer(a_pos, 2, gl.FLOAT, false, 0, 0);

    const u_res = gl.getUniformLocation(prog, 'u_res');
    const u_time = gl.getUniformLocation(prog, 'u_time');
    const u_seed = gl.getUniformLocation(prog, 'u_seed');
    const u_a = gl.getUniformLocation(prog, 'u_color_a');
    const u_b = gl.getUniformLocation(prog, 'u_color_b');
    const u_c = gl.getUniformLocation(prog, 'u_color_c');

    function resize() {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = canvas.clientWidth * dpr;
      const h = canvas.clientHeight * dpr;
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
        gl.viewport(0, 0, w, h);
      }
      gl.uniform2f(u_res, w, h);
    }
    resize();
    window.addEventListener('resize', resize);

    gl.uniform1f(u_seed, seed);
    gl.uniform3f(u_a, ...hex(colorA));
    gl.uniform3f(u_b, ...hex(colorB));
    gl.uniform3f(u_c, ...hex(colorC));

    const t0 = performance.now();
    let frame;
    function loop() {
      resize();
      gl.uniform1f(u_time, (performance.now() - t0) / 1000);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      frame = requestAnimationFrame(loop);
    }
    loop();

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', resize);
      gl.deleteBuffer(buf);
      gl.deleteProgram(prog);
    };
  }, [seed, colorA, colorB, colorC]);

  return <canvas ref={canvasRef} className={`block w-full h-full ${className}`} />;
}
