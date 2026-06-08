/** Renderiza los cursores de otros peers + reactions flotantes.
 * Convierte el (x, y) normalizado 0-100 → coords absolutas en viewport.
 */
import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export default function PresenceLayer({ peers, reactions, onMouseMove }) {
  const layerRef = useRef(null);

  useEffect(() => {
    function onMove(e) {
      const rect = layerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = ((e.clientX - rect.left) / rect.width) * 100;
      const y = ((e.clientY - rect.top) / rect.height) * 100;
      onMouseMove?.(Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y)));
    }
    window.addEventListener('mousemove', onMove);
    return () => window.removeEventListener('mousemove', onMove);
  }, [onMouseMove]);

  return (
    <div ref={layerRef} className="fixed inset-0 pointer-events-none z-[80]">
      {/* Cursores de peers */}
      {Object.entries(peers).map(([pid, p]) => (
        <motion.div
          key={pid}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1, left: `${p.x}%`, top: `${p.y}%` }}
          exit={{ opacity: 0 }}
          transition={{ ease: 'linear', duration: 0.08 }}
          className="absolute"
          style={{ transform: 'translate(-2px, -2px)' }}
        >
          <svg width="22" height="22" viewBox="0 0 22 22" style={{ filter: `drop-shadow(0 2px 6px hsla(${p.hue}, 70%, 50%, 0.6))` }}>
            <path
              d="M3 2 L3 18 L7 14 L10 21 L13 20 L10 13 L17 13 Z"
              fill={`hsl(${p.hue}, 90%, 60%)`}
              stroke="white"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </svg>
          <div
            className="ml-3 mt-1 px-1.5 py-0.5 rounded text-[10px] font-bold text-white shadow"
            style={{ background: `hsl(${p.hue}, 75%, 45%)` }}
          >
            {p.alias}
          </div>
        </motion.div>
      ))}

      {/* Reactions flotantes */}
      <AnimatePresence>
        {reactions.map((r) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, scale: 0, y: 0 }}
            animate={{ opacity: 1, scale: [0, 1.6, 1.2], y: -120 }}
            exit={{ opacity: 0, scale: 0.6 }}
            transition={{ duration: 2.2, ease: [0.2, 0.65, 0.3, 0.9] }}
            className="absolute text-4xl select-none"
            style={{ left: `${r.x}%`, top: `${r.y}%` }}
          >
            {r.emoji}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
