/** Speedometer animado del rating Glicko-2.
 * Eje 0..3000 → arco 270deg. Color por tier: bronze<1400, silver<1700, gold<2000, diamond≥2000.
 */
import { motion } from 'framer-motion';

const TIERS = [
  { min: 0,    label: 'Iniciado',  color: '#64748b' },
  { min: 1300, label: 'Aprendiz',  color: '#94a3b8' },
  { min: 1500, label: 'Duelista',  color: '#a78bfa' },
  { min: 1700, label: 'Retador',   color: '#22d3ee' },
  { min: 1900, label: 'Élite',     color: '#f59e0b' },
  { min: 2100, label: 'Maestro',   color: '#f97316' },
  { min: 2300, label: 'Campeón',   color: '#ef4444' },
];

function tierFor(rating) {
  let t = TIERS[0];
  for (const tier of TIERS) {
    if (rating >= tier.min) t = tier;
  }
  return t;
}

const ARC_START = -225; // deg
const ARC_END = 45;     // deg
const ARC_SWEEP = ARC_END - ARC_START; // 270deg

export default function GlickoGauge({ rating = 1500, rd = 200, peak }) {
  const clamped = Math.max(800, Math.min(rating, 2600));
  const pct = (clamped - 800) / (2600 - 800);
  const needleAngle = ARC_START + ARC_SWEEP * pct;
  const tier = tierFor(rating);

  const cx = 100, cy = 100, r = 80;
  function polar(angleDeg, radius = r) {
    const a = (angleDeg * Math.PI) / 180;
    return { x: cx + radius * Math.cos(a), y: cy + radius * Math.sin(a) };
  }

  // Arco completo
  const start = polar(ARC_START);
  const end = polar(ARC_END);
  const arcPath = `M ${start.x} ${start.y} A ${r} ${r} 0 1 1 ${end.x} ${end.y}`;
  // Arco lleno hasta needle
  const fillEnd = polar(needleAngle);
  const fillPath = `M ${start.x} ${start.y} A ${r} ${r} 0 ${pct > 0.5 ? 1 : 0} 1 ${fillEnd.x} ${fillEnd.y}`;

  return (
    <div className="relative inline-block">
      <svg viewBox="0 0 200 180" className="w-full max-w-[280px]">
        <defs>
          <linearGradient id="gauge-fill" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={tier.color} stopOpacity={0.5} />
            <stop offset="100%" stopColor={tier.color} stopOpacity={1} />
          </linearGradient>
          <filter id="gauge-glow">
            <feGaussianBlur stdDeviation="3" />
          </filter>
        </defs>
        {/* Track */}
        <path d={arcPath} fill="none" stroke="rgba(148,163,184,0.15)" strokeWidth="12" strokeLinecap="round" />
        {/* Fill animado */}
        <motion.path
          d={fillPath}
          fill="none"
          stroke="url(#gauge-fill)"
          strokeWidth="12"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.5, ease: 'easeOut' }}
          filter="url(#gauge-glow)"
        />
        {/* Tick marks por tier */}
        {TIERS.slice(1, -1).map((t, i) => {
          const p = (t.min - 800) / (2600 - 800);
          const angle = ARC_START + ARC_SWEEP * p;
          const inner = polar(angle, r - 8);
          const outer = polar(angle, r + 4);
          return (
            <line key={i}
                  x1={inner.x} y1={inner.y} x2={outer.x} y2={outer.y}
                  stroke="rgba(148,163,184,0.4)" strokeWidth="1.5" />
          );
        })}
        {/* Needle */}
        <motion.g
          initial={{ rotate: ARC_START - 90, originX: '100px', originY: '100px' }}
          animate={{ rotate: needleAngle - 90 }}
          transition={{ duration: 1.5, ease: [0.34, 1.56, 0.64, 1] }}
          style={{ transformOrigin: '100px 100px' }}
        >
          <line x1={cx} y1={cy} x2={cx} y2={cy - r + 10}
                stroke={tier.color} strokeWidth="2.5" strokeLinecap="round" />
          <circle cx={cx} cy={cy - r + 10} r="4" fill={tier.color} />
        </motion.g>
        <circle cx={cx} cy={cy} r="8" fill="#0f0f19" stroke={tier.color} strokeWidth="2" />
        {/* Rating value */}
        <text x={cx} y={cy + 45} textAnchor="middle"
              className="fill-white font-black text-[24px] tabular-nums">
          {Math.round(rating)}
        </text>
        <text x={cx} y={cy + 60} textAnchor="middle"
              className="text-[10px] uppercase tracking-widest font-bold"
              style={{ fill: tier.color }}>
          {tier.label}
        </text>
      </svg>
      <div className="text-center text-[10px] text-slate-500 mt-1">
        RD ±{Math.round(rd)} {peak != null && peak > rating && <>· Peak {Math.round(peak)}</>}
      </div>
    </div>
  );
}
