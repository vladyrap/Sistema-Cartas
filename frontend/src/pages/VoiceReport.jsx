import { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mic, MicOff, RotateCw, Check, X, AlertCircle, Volume2,
} from 'lucide-react';
import toast from 'react-hot-toast';
import Navbar from '../components/Navbar';
import AuthGuard from '../components/AuthGuard';
import { api } from '../lib/api';

export default function VoiceReport() {
  return (
    <AuthGuard feature="Voice Match Reporter" returnUrl="/voice-report" accent="cyan">
      <VoiceReportContent />
    </AuthGuard>
  );
}

function VoiceReportContent() {
  const [recording, setRecording] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [interim, setInterim] = useState('');
  const [parsed, setParsed] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef(null);

  useEffect(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }
    const r = new SR();
    r.continuous = true;
    r.interimResults = true;
    r.lang = 'es-CL';
    r.onresult = (e) => {
      let finalT = '';
      let interimT = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalT += t + ' ';
        else interimT += t;
      }
      if (finalT) setTranscript((prev) => prev + finalT);
      setInterim(interimT);
    };
    r.onerror = (e) => {
      console.error('SpeechRecognition error', e);
      setRecording(false);
    };
    r.onend = () => setRecording(false);
    recognitionRef.current = r;
    return () => { try { r.stop(); } catch {} };
  }, []);

  const start = () => {
    if (!recognitionRef.current) return;
    setTranscript('');
    setInterim('');
    setParsed(null);
    try {
      recognitionRef.current.start();
      setRecording(true);
    } catch (err) {
      toast.error('No se pudo iniciar el micrófono');
    }
  };

  const stop = () => {
    if (!recognitionRef.current) return;
    try { recognitionRef.current.stop(); } catch {}
    setRecording(false);
  };

  const parse = async () => {
    if (!transcript.trim()) return;
    setParsing(true);
    try {
      const { data } = await api.post('/voice/parse-match', { transcript: transcript.trim() });
      setParsed(data);
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Falló');
    } finally {
      setParsing(false);
    }
  };

  if (!supported) {
    return (
      <div className="min-h-screen bg-slate-950 text-white">
        <Navbar />
        <div className="max-w-2xl mx-auto px-6 py-20 text-center">
          <AlertCircle size={48} className="mx-auto mb-4 text-amber-400" />
          <h1 className="text-2xl font-black mb-2">Navegador no soporta voz</h1>
          <p className="text-slate-400">Web Speech API no disponible. Probá en Chrome/Edge desktop.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-cyan-950/20 to-slate-950 text-white">
      <Navbar />

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 mb-2">
            <Mic size={14} className="text-cyan-300" />
            <span className="text-[10px] uppercase tracking-[0.5em] text-cyan-300 font-bold">
              Voice Match Reporter
            </span>
          </div>
          <h1 className="text-4xl sm:text-5xl font-black tracking-tighter">
            Habla. La IA reporta.
          </h1>
          <p className="text-slate-400 mt-3 max-w-xl mx-auto">
            Modo manos libres para el juez. Decí <em>"Lightning ganó la ronda 3 contra Bolt, 2-1"</em> y Claude estructura el resultado.
          </p>
        </div>

        {/* Mic button */}
        <div className="text-center mb-6">
          <motion.button
            onClick={recording ? stop : start}
            animate={recording ? { scale: [1, 1.05, 1] } : { scale: 1 }}
            transition={recording ? { duration: 1, repeat: Infinity } : {}}
            className={`relative inline-flex items-center justify-center w-28 h-28 rounded-full text-white font-bold shadow-2xl transition ${
              recording
                ? 'bg-gradient-to-br from-rose-500 to-red-700 shadow-rose-500/40'
                : 'bg-gradient-to-br from-cyan-500 to-blue-700 shadow-cyan-500/30'
            }`}
          >
            {recording ? <MicOff size={40} /> : <Mic size={40} />}
            {recording && (
              <motion.span
                className="absolute inset-0 rounded-full ring-4 ring-rose-400/60"
                animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeOut' }}
              />
            )}
          </motion.button>
          <p className="text-xs text-slate-500 mt-3">
            {recording ? 'Escuchando… click para detener' : 'Click para empezar a grabar'}
          </p>
        </div>

        {/* Transcript */}
        <div className="rounded-2xl bg-white/[0.04] ring-1 ring-white/10 p-4 mb-4 min-h-[120px]">
          <div className="text-[10px] uppercase tracking-widest text-cyan-300 font-bold mb-2 flex items-center gap-1.5">
            <Volume2 size={11} /> Transcripción
          </div>
          <p className="text-base text-slate-100">
            {transcript || <span className="text-slate-600 italic">El texto reconocido aparecerá acá…</span>}
            {interim && <span className="text-slate-500 italic"> {interim}</span>}
          </p>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => { setTranscript(''); setParsed(null); }}
            className="px-4 py-2 rounded-lg bg-white/[0.05] hover:bg-white/10 text-sm transition"
          >
            Limpiar
          </button>
          <textarea
            value={transcript}
            onChange={(e) => setTranscript(e.target.value)}
            placeholder="…o tipea acá manualmente"
            rows={2}
            className="flex-1 px-3 py-2 rounded-lg bg-white/[0.05] border border-white/10 text-sm resize-none"
          />
          <button
            onClick={parse}
            disabled={parsing || !transcript.trim()}
            className="px-5 py-2 rounded-lg bg-gradient-to-r from-cyan-500 to-blue-500 text-white font-bold text-sm disabled:opacity-50 inline-flex items-center gap-2"
          >
            {parsing ? <><RotateCw size={14} className="animate-spin" /></> : <><Check size={14} /> Parsear</>}
          </button>
        </div>

        {/* Result */}
        <AnimatePresence>
          {parsed && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-2xl p-5 ${
                parsed.confidence >= 0.7
                  ? 'bg-emerald-500/10 ring-1 ring-emerald-500/40'
                  : parsed.confidence >= 0.4
                  ? 'bg-amber-500/10 ring-1 ring-amber-500/40'
                  : 'bg-rose-500/10 ring-1 ring-rose-500/40'
              }`}
            >
              <div className="flex items-center gap-2 mb-3">
                <Check size={16} className="text-emerald-300" />
                <span className="text-[10px] uppercase tracking-widest font-bold">
                  Resultado parseado · Confianza {Math.round(parsed.confidence * 100)}%
                </span>
              </div>

              {parsed.is_draw ? (
                <p className="text-2xl font-black">
                  Empate · {parsed.games_winner}–{parsed.games_loser}
                </p>
              ) : (
                <p className="text-2xl font-black">
                  <span className="text-emerald-300">{parsed.winner || '?'}</span>
                  {' '}vence a{' '}
                  <span className="text-rose-300">{parsed.loser || '?'}</span>
                  {' '}<span className="font-mono">{parsed.games_winner}–{parsed.games_loser}</span>
                </p>
              )}

              {parsed.round_number && (
                <div className="mt-1 text-sm text-slate-400">Ronda {parsed.round_number}</div>
              )}

              {parsed.warning && (
                <div className="mt-3 text-xs text-amber-200 bg-amber-500/10 ring-1 ring-amber-500/30 rounded p-2">
                  ⚠ {parsed.warning}
                </div>
              )}

              {parsed.is_mock && (
                <p className="mt-3 text-[10px] uppercase tracking-widest text-amber-300/70 font-bold text-center">
                  Modo mock — configurá ANTHROPIC_API_KEY para parse real con Claude
                </p>
              )}

              <p className="mt-4 text-xs text-slate-500">
                ⓘ Este parse es solo preview. Para reportar el match en realidad, copiá los datos a la pantalla de Live Tournament del evento.
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
