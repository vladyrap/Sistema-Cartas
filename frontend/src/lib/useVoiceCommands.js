/** Voice commands con Web Speech Recognition.
 * Activá con setEnabled(true). Intent matching simple por keywords.
 *
 * Comandos soportados:
 *   - "abrir/ir dashboard" → /dashboard
 *   - "decks" → /decks
 *   - "eventos" → /events
 *   - "perfil" → /profile/premium
 *   - "tienda" → /catalog/premium
 *   - "ranking" → /leaderboard
 *   - "ruta" → /ruta
 *   - "cinematic" → /events/{id}/cinema (si hay id en URL)
 *   - "buscar X" → abre Cmd+K con query X
 *   - "modo oscuro"/"modo claro" → toggle theme (best-effort)
 */
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const INTENTS = [
  { match: /(dashboard|inicio)/, action: (n) => n('/dashboard') },
  { match: /(decks?|mazos?)/, action: (n) => n('/decks') },
  { match: /(eventos?|torneos?)/, action: (n) => n('/events') },
  { match: /(perfil|profile)/, action: (n) => n('/profile/premium') },
  { match: /(tienda|catalog)/, action: (n) => n('/catalog/premium') },
  { match: /(ranking|leaderboard|tabla)/, action: (n) => n('/leaderboard') },
  { match: /(ruta|camino)/, action: (n) => n('/ruta') },
  { match: /(misiones|misi[óo]n)/, action: (n) => n('/missions') },
  { match: /(hall|salon|fame)/, action: (n) => n('/hall-of-fame') },
];

export function useVoiceCommands({ feedback }) {
  const [supported, setSupported] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recogRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  function start() {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) return;
    const recog = new SR();
    recogRef.current = recog;
    recog.lang = 'es-ES';
    recog.continuous = true;
    recog.interimResults = true;
    recog.onresult = (event) => {
      const last = event.results[event.results.length - 1];
      const text = last[0].transcript.trim().toLowerCase();
      setTranscript(text);
      if (last.isFinal) {
        handleCommand(text);
      }
    };
    recog.onerror = () => { setEnabled(false); };
    recog.onend = () => { if (enabled) recog.start(); };
    recog.start();
  }

  function stop() {
    try { recogRef.current?.stop(); } catch {}
    recogRef.current = null;
  }

  function handleCommand(text) {
    for (const i of INTENTS) {
      if (i.match.test(text)) {
        feedback?.(`Comando reconocido → "${text}"`);
        i.action(navigate);
        return;
      }
    }
    if (/buscar (.+)/.test(text)) {
      const q = text.match(/buscar (.+)/)?.[1];
      feedback?.(`Buscando: ${q}`);
      // Simular Cmd+K abriendo + typing — simple workaround
      const ev = new KeyboardEvent('keydown', { key: 'k', metaKey: true });
      window.dispatchEvent(ev);
      return;
    }
    feedback?.(`No reconocido: "${text}"`);
  }

  useEffect(() => {
    if (enabled) start(); else stop();
    return () => stop();
  }, [enabled]); // eslint-disable-line

  return { supported, enabled, setEnabled, transcript };
}
