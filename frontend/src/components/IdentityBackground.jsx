/** Background único por jugador. Seed derivado del elite_id_code o user_id.
 * Usa el AuroraShader con paleta de colores rotada por hash. */
import { useMemo } from 'react';
import AuroraShader from './AuroraShader';

function hashString(s) {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h);
}

function paletteFor(seed) {
  // Generar 3 hues complementarios desde el seed.
  const baseHue = seed % 360;
  const h2 = (baseHue + 60) % 360;
  const h3 = (baseHue + 180) % 360;
  return {
    colorA: `hsl(${baseHue}, 70%, 55%)`.replace('hsl', '#').slice(0,7), // dummy hex fallback
    // En realidad devolvemos hex porque AuroraShader hace hex parsing.
    aHex: hslToHex(baseHue, 75, 55),
    bHex: '#0b0b14',
    cHex: hslToHex(h3, 70, 55),
  };
}

function hslToHex(h, s, l) {
  s /= 100; l /= 100;
  const k = n => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = n => {
    const c = l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return Math.round(255 * c).toString(16).padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export default function IdentityBackground({ seedKey = 'anon', opacity = 0.35, className = '' }) {
  const { seed, palette } = useMemo(() => {
    const s = hashString(seedKey);
    return { seed: s % 1000, palette: paletteFor(s) };
  }, [seedKey]);

  return (
    <div className={`fixed inset-0 -z-10 ${className}`} style={{ opacity }}>
      <AuroraShader
        seed={seed}
        colorA={palette.aHex}
        colorB={palette.bHex}
        colorC={palette.cHex}
      />
    </div>
  );
}
