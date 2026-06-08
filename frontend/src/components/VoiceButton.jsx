/** Botón flotante para activar voice commands. Auto-hides si no soportado. */
import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Mic, MicOff } from 'lucide-react';
import toast from 'react-hot-toast';
import { useVoiceCommands } from '../lib/useVoiceCommands';

export default function VoiceButton() {
  const [hidden, setHidden] = useState(false);
  const voice = useVoiceCommands({ feedback: (m) => toast(m, { icon: '🎙️' }) });
  if (!voice.supported || hidden) return null;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.8 }}
      animate={{ opacity: 1, scale: 1 }}
      className="fixed bottom-6 left-6 z-[85]"
    >
      <button
        onClick={() => voice.setEnabled(v => !v)}
        className={`relative w-12 h-12 rounded-full flex items-center justify-center backdrop-blur shadow-2xl transition ${
          voice.enabled
            ? 'bg-gradient-to-br from-rose-500 to-fuchsia-600 text-white shadow-rose-500/40'
            : 'bg-slate-800/80 border border-white/10 text-slate-400 hover:text-white'
        }`}
        title={voice.enabled ? 'Detener voz' : 'Activar comandos por voz'}
      >
        {voice.enabled ? <Mic size={18} /> : <MicOff size={18} />}
        {voice.enabled && (
          <motion.span
            className="absolute inset-0 rounded-full border-2 border-rose-400"
            initial={{ scale: 1, opacity: 0.8 }}
            animate={{ scale: 1.6, opacity: 0 }}
            transition={{ duration: 1.4, repeat: Infinity }}
          />
        )}
      </button>
      <AnimatePresence>
        {voice.enabled && voice.transcript && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute bottom-full mb-2 left-0 px-3 py-2 rounded-lg bg-black/80 backdrop-blur text-xs text-white whitespace-nowrap max-w-[260px] truncate"
          >
            {voice.transcript}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
