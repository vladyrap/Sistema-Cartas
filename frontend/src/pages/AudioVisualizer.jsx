/** Audio Visualizer — micrófono → FFT → uniforms del shader audio-reactive.
 * Bass modula swirl, mids modulan color, treble modula sparkles.
 * Modo "projector" oculta toda la UI para usar en eventos. */
import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, Mic, MicOff, AlertCircle, Maximize, EyeOff, Eye, Music } from 'lucide-react';

import AudioReactiveShader from '../components/AudioReactiveShader';

export default function AudioVisualizer() {
  const [enabled, setEnabled] = useState(false);
  const [bass, setBass] = useState(0);
  const [mid, setMid] = useState(0);
  const [treble, setTreble] = useState(0);
  const [error, setError] = useState(null);
  const [projector, setProjector] = useState(false);

  const ctxRef = useRef(null);
  const analyserRef = useRef(null);
  const streamRef = useRef(null);
  const dataRef = useRef(null);
  const rafRef = useRef(null);

  // Soporta también audio del sistema vía getDisplayMedia
  async function startMic(useSystem = false) {
    setError(null);
    try {
      const stream = useSystem
        ? await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true })
        : await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      ctxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.78;
      src.connect(analyser);
      analyserRef.current = analyser;
      dataRef.current = new Uint8Array(analyser.frequencyBinCount);
      setEnabled(true);
      loop();
    } catch (e) {
      setError(e.message || 'Sin acceso a audio');
    }
  }

  function stop() {
    cancelAnimationFrame(rafRef.current);
    streamRef.current?.getTracks?.().forEach(t => t.stop());
    try { ctxRef.current?.close(); } catch {}
    streamRef.current = null;
    ctxRef.current = null;
    analyserRef.current = null;
    setEnabled(false);
    setBass(0); setMid(0); setTreble(0);
  }

  function loop() {
    const a = analyserRef.current;
    const d = dataRef.current;
    if (!a || !d) return;
    a.getByteFrequencyData(d);
    // Bins: 0..1023, frequency = bin * sampleRate/fftSize. Para 48kHz fftSize 1024:
    //   bass ~ 0-80Hz → bins 0-3
    //   low-mid ~ 80-500Hz → bins 4-21
    //   high-mid ~ 500-2000Hz → bins 22-85
    //   treble ~ 2k-8kHz → bins 86-340
    let bassSum = 0, midSum = 0, trebleSum = 0;
    for (let i = 1; i < 4; i++) bassSum += d[i];
    for (let i = 4; i < 22; i++) midSum += d[i];
    for (let i = 86; i < 340; i++) trebleSum += d[i];
    const newBass = bassSum / (3 * 255);
    const newMid = midSum / (18 * 255);
    const newTreble = trebleSum / (254 * 255);
    // Smoothing extra
    setBass(b => b * 0.6 + newBass * 0.4);
    setMid(m => m * 0.7 + newMid * 0.3);
    setTreble(t => t * 0.8 + newTreble * 0.2);
    rafRef.current = requestAnimationFrame(loop);
  }

  useEffect(() => () => stop(), []); // eslint-disable-line

  function toggleFullscreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  }

  return (
    <div className="fixed inset-0 bg-black overflow-hidden">
      <div className="absolute inset-0">
        <AudioReactiveShader bass={bass} mid={mid} treble={treble} seed={42} />
      </div>

      {/* HUD */}
      {!projector && (
        <>
          <div className="absolute top-0 left-0 right-0 z-10 p-6 flex items-start justify-between pointer-events-none">
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}>
              <Link to="/dashboard" className="pointer-events-auto inline-flex items-center gap-1.5 text-xs text-white/70 hover:text-white">
                <ArrowLeft size={12} /> Volver
              </Link>
              <div className="flex items-center gap-2 mt-2">
                <Music size={14} className="text-fuchsia-300" />
                <span className="text-[10px] uppercase tracking-[0.4em] text-fuchsia-200 font-bold">
                  AUDIO_REACTIVE.LIVE
                </span>
              </div>
              <h1 className="text-4xl font-black bg-gradient-to-r from-white via-fuchsia-200 to-violet-200 bg-clip-text text-transparent mt-1 drop-shadow-2xl">
                Visualizer
              </h1>
              <p className="text-xs text-white/60 mt-1 max-w-md">
                El shader reacciona al audio del micrófono. Bass torciona, mids cambian color, treble enciende sparkles.
              </p>
            </motion.div>

            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
              className="pointer-events-auto flex gap-2">
              <button onClick={() => setProjector(true)} className="p-2.5 rounded-xl bg-black/40 backdrop-blur border border-white/20 text-white hover:bg-black/60" title="Modo projector (oculta UI)">
                <EyeOff size={14} />
              </button>
              <button onClick={toggleFullscreen} className="p-2.5 rounded-xl bg-black/40 backdrop-blur border border-white/20 text-white hover:bg-black/60">
                <Maximize size={14} />
              </button>
            </motion.div>
          </div>

          {/* Center button or FFT bars */}
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            {!enabled && (
              <motion.div
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                className="pointer-events-auto"
              >
                <div className="bg-black/70 backdrop-blur-xl rounded-3xl border border-white/10 p-8 max-w-md text-center">
                  <Mic size={32} className="mx-auto mb-3 text-fuchsia-400" />
                  <h2 className="text-2xl font-bold mb-2">Activar audio</h2>
                  <p className="text-xs text-white/60 mb-6">
                    Permití acceso al micrófono o capturá la pestaña con audio del sistema.
                  </p>
                  <div className="flex flex-col gap-2">
                    <button onClick={() => startMic(false)}
                            className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-fuchsia-500 to-violet-500 text-white text-sm font-bold uppercase tracking-widest flex items-center justify-center gap-2">
                      <Mic size={14} /> Micrófono
                    </button>
                    <button onClick={() => startMic(true)}
                            className="px-5 py-2 rounded-xl bg-white/5 border border-white/10 text-white text-xs uppercase tracking-widest hover:bg-white/10">
                      Audio del sistema (pestaña)
                    </button>
                  </div>
                  {error && (
                    <div className="mt-4 px-3 py-2 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2">
                      <AlertCircle size={12} /> {error}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </div>

          {/* Bottom: FFT bars + controls */}
          {enabled && (
            <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 pointer-events-auto flex items-end gap-4">
              <div className="bg-black/70 backdrop-blur-xl rounded-2xl border border-fuchsia-500/30 px-4 py-3 flex items-end gap-3">
                <FFTBand label="BASS" value={bass} color="violet" />
                <FFTBand label="MID" value={mid} color="cyan" />
                <FFTBand label="HIGH" value={treble} color="amber" />
              </div>
              <button onClick={stop} className="p-3 rounded-2xl bg-rose-500/30 border border-rose-500/40 text-rose-200 hover:bg-rose-500/50">
                <MicOff size={16} />
              </button>
            </div>
          )}
        </>
      )}

      {/* Projector mode toggle invisible */}
      {projector && (
        <button
          onClick={() => setProjector(false)}
          className="absolute top-4 right-4 z-10 p-2 rounded-lg bg-black/40 backdrop-blur text-white/40 hover:text-white"
        >
          <Eye size={12} />
        </button>
      )}
    </div>
  );
}

function FFTBand({ label, value, color }) {
  const c = {
    violet: 'from-violet-500 to-fuchsia-400',
    cyan: 'from-cyan-500 to-emerald-400',
    amber: 'from-amber-500 to-orange-400',
  }[color];
  const tc = {
    violet: 'text-violet-300',
    cyan: 'text-cyan-300',
    amber: 'text-amber-300',
  }[color];
  return (
    <div className="flex flex-col items-center gap-1">
      <div className={`text-[9px] uppercase tracking-widest font-bold ${tc}`}>{label}</div>
      <div className="w-3 h-16 bg-black/40 rounded-full overflow-hidden flex flex-col justify-end">
        <div
          className={`w-full bg-gradient-to-t ${c} transition-all duration-100`}
          style={{ height: `${Math.min(100, value * 100)}%` }}
        />
      </div>
      <div className={`text-[10px] tabular-nums ${tc} font-bold`}>{Math.round(value * 100)}</div>
    </div>
  );
}
