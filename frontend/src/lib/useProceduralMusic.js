/** Música procedural con Web Audio API — pad ambient + arpeggio + build-up.
 * Cuatro fases configurables. Sin samples — solo osciladores + filtros.
 *
 * Uso:
 *   const music = useProceduralMusic();
 *   music.start();   // arranca pad ambient
 *   music.setPhase(2); // sube intensidad
 *   music.crescendo(); // big drop
 */
import { useEffect, useRef, useState, useCallback } from 'react';

const SCALE = [0, 3, 5, 7, 10, 12]; // pentatónica menor

function midiToFreq(midi) {
  return 440 * Math.pow(2, (midi - 69) / 12);
}

export function useProceduralMusic() {
  const ctxRef = useRef(null);
  const masterRef = useRef(null);
  const padRef = useRef(null);
  const arpRef = useRef(null);
  const phaseRef = useRef(0);
  const [started, setStarted] = useState(false);
  const arpTimerRef = useRef(null);

  function ensure() {
    if (ctxRef.current) return ctxRef.current;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1200;
    filter.Q.value = 1.0;
    master.connect(filter);
    ctxRef.current = ctx;
    masterRef.current = master;
    return ctx;
  }

  const start = useCallback(() => {
    const ctx = ensure();
    if (!ctx || started) return;
    ctx.resume();
    const master = masterRef.current;

    // Pad chord: D minor (D F A) bajo, con detune
    const padFreqs = [midiToFreq(50), midiToFreq(53), midiToFreq(57), midiToFreq(60)];
    const oscs = [];
    for (const f of padFreqs) {
      for (const detune of [-7, 0, 7]) {
        const o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.value = f;
        o.detune.value = detune;
        const g = ctx.createGain();
        g.gain.value = 0.04;
        const lfo = ctx.createOscillator();
        lfo.frequency.value = 0.2 + Math.random() * 0.3;
        const lfoGain = ctx.createGain();
        lfoGain.gain.value = 0.015;
        lfo.connect(lfoGain).connect(g.gain);
        o.connect(g).connect(master);
        o.start(); lfo.start();
        oscs.push({ o, lfo });
      }
    }
    padRef.current = oscs;

    // Fade in
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.linearRampToValueAtTime(0.45, now + 4);

    // Arpeggio loop
    let step = 0;
    const arpRoot = 62; // D4
    function arp() {
      const c = ctxRef.current;
      if (!c) return;
      const t = c.currentTime;
      const phase = phaseRef.current;
      // Más notas / más graves en fases altas
      const note = arpRoot + SCALE[step % SCALE.length] + (phase >= 2 ? 0 : 12);
      const freq = midiToFreq(note);
      const o = c.createOscillator();
      o.type = phase >= 3 ? 'square' : 'triangle';
      o.frequency.value = freq;
      const g = c.createGain();
      const vol = 0.06 + phase * 0.04;
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(vol, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
      o.connect(g).connect(masterRef.current);
      o.start(t); o.stop(t + 0.5);
      step++;
      const interval = phase >= 3 ? 110 : phase >= 2 ? 180 : phase >= 1 ? 260 : 380;
      arpTimerRef.current = setTimeout(arp, interval);
    }
    arpTimerRef.current = setTimeout(arp, 800);
    arpRef.current = { stop: () => clearTimeout(arpTimerRef.current) };
    setStarted(true);
  }, [started]);

  const setPhase = useCallback((p) => {
    phaseRef.current = Math.max(0, Math.min(4, p));
  }, []);

  const crescendo = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const m = masterRef.current;
    const now = ctx.currentTime;
    // Big swell
    m.gain.cancelScheduledValues(now);
    m.gain.linearRampToValueAtTime(0.7, now + 1.5);
    // Drop sub-bass
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(midiToFreq(38), now);
    o.frequency.exponentialRampToValueAtTime(midiToFreq(26), now + 2.0);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(0.35, now + 1.5);
    g.gain.exponentialRampToValueAtTime(0.001, now + 4);
    o.connect(g).connect(m);
    o.start(now); o.stop(now + 4.5);
    setPhase(4);
  }, [setPhase]);

  const stop = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;
    masterRef.current?.gain.cancelScheduledValues(now);
    masterRef.current?.gain.linearRampToValueAtTime(0, now + 0.5);
    if (arpTimerRef.current) clearTimeout(arpTimerRef.current);
    setTimeout(() => {
      try {
        padRef.current?.forEach(({ o, lfo }) => { o.stop(); lfo.stop(); });
        ctxRef.current?.close();
      } catch {}
      ctxRef.current = null;
      masterRef.current = null;
      padRef.current = null;
      arpRef.current = null;
      setStarted(false);
    }, 600);
  }, []);

  useEffect(() => () => stop(), [stop]);

  return { start, stop, setPhase, crescendo, started };
}
