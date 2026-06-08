/** Hook que usa Web Speech API para narrar texto con voz natural.
 * + cache de narraciones (no narra dos veces lo mismo en 10s). */
import { useCallback, useEffect, useRef, useState } from 'react';

export function useNarrator({ lang = 'es-CL', rate = 1.05, volume = 1.0 } = {}) {
  const [enabled, setEnabled] = useState(false);
  const [voice, setVoice] = useState(null);
  const recentRef = useRef(new Map()); // key → ts

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    function pickVoice() {
      const voices = speechSynthesis.getVoices();
      if (!voices.length) return;
      // Preferir voces es-* y femeninas/expresivas si existen
      const es = voices.filter(v => v.lang?.startsWith('es'));
      const candidates = es.length ? es : voices;
      // Heurística simple: ranking por nombre
      const ranked = candidates.sort((a, b) => {
        const score = v => {
          let s = 0;
          if (v.lang === lang) s += 10;
          if (v.lang.startsWith(lang.slice(0, 2))) s += 5;
          if (/google|natural|enhanced|premium/i.test(v.name)) s += 3;
          if (/female|woman|f/i.test(v.name)) s += 1;
          return s;
        };
        return score(b) - score(a);
      });
      setVoice(ranked[0]);
    }
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
  }, [lang]);

  const speak = useCallback((text) => {
    if (!enabled || !text) return;
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    // Dedupe ventana 10s
    const now = Date.now();
    for (const [k, ts] of recentRef.current) {
      if (now - ts > 10000) recentRef.current.delete(k);
    }
    if (recentRef.current.has(text)) return;
    recentRef.current.set(text, now);

    try {
      const u = new SpeechSynthesisUtterance(text);
      u.lang = lang;
      u.rate = rate;
      u.volume = volume;
      if (voice) u.voice = voice;
      speechSynthesis.speak(u);
    } catch (e) { /* ignore */ }
  }, [enabled, lang, rate, voice, volume]);

  const stop = useCallback(() => {
    try { speechSynthesis.cancel(); } catch {}
  }, []);

  return { enabled, setEnabled, speak, stop, voice };
}
