/** Glitch RGB shift overlay activable. Mimic CRT/datamosh effect.
 * `intensity` 0-1, `bursts` boolean para flashes aleatorios. */
import { useEffect, useState } from 'react';

export default function GlitchOverlay({ active, intensity = 1, children }) {
  const [shift, setShift] = useState({ r: 0, g: 0, b: 0 });

  useEffect(() => {
    if (!active) {
      setShift({ r: 0, g: 0, b: 0 });
      return;
    }
    const id = setInterval(() => {
      const burst = Math.random() < 0.18;
      const k = burst ? 14 * intensity : 3 * intensity;
      setShift({
        r: (Math.random() - 0.5) * k,
        g: (Math.random() - 0.5) * k * 0.6,
        b: (Math.random() - 0.5) * k,
      });
    }, 70);
    return () => clearInterval(id);
  }, [active, intensity]);

  if (!active) return children || null;

  return (
    <div className="relative">
      <div
        className="absolute inset-0 mix-blend-screen pointer-events-none z-50"
        style={{
          filter: `drop-shadow(${shift.r}px 0 0 #ff003c) drop-shadow(${shift.g}px ${shift.b}px 0 #00ffea)`,
        }}
      />
      {/* Scanlines */}
      <div
        className="absolute inset-0 pointer-events-none z-40 opacity-15"
        style={{
          backgroundImage: 'repeating-linear-gradient(0deg, rgba(255,255,255,0.05) 0px, rgba(255,255,255,0.05) 1px, transparent 1px, transparent 3px)',
        }}
      />
      {children}
    </div>
  );
}
