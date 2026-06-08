/** Skill Tree de la Ruta del Campeón visualizada como constellation.
 * Niveles 1..30 dispuestos en arco serpenteante con nodos glow.
 * Path actual del jugador resaltado con partículas.
 */
import { motion } from 'framer-motion';

const RANK_THRESHOLDS = [
  { level: 1, name: 'Iniciado',  color: '#64748b' },
  { level: 5, name: 'Aprendiz',  color: '#94a3b8' },
  { level: 10, name: 'Duelista', color: '#a78bfa' },
  { level: 15, name: 'Retador',  color: '#22d3ee' },
  { level: 20, name: 'Élite',    color: '#f59e0b' },
  { level: 25, name: 'Maestro',  color: '#f97316' },
  { level: 30, name: 'Campeón',  color: '#ef4444' },
];

function colorFor(level) {
  let c = RANK_THRESHOLDS[0].color;
  for (const t of RANK_THRESHOLDS) if (level >= t.level) c = t.color;
  return c;
}

export default function SkillTreeRuta({ currentLevel = 1, currentExp = 0 }) {
  const levels = Array.from({ length: 30 }, (_, i) => i + 1);
  // Layout en S: 6 columnas, 5 filas. Serpenteamos.
  const COLS = 6;
  const NODE_GAP_X = 100;
  const NODE_GAP_Y = 100;
  function pos(level) {
    const idx = level - 1;
    const row = Math.floor(idx / COLS);
    const colInRow = idx % COLS;
    const col = row % 2 === 0 ? colInRow : COLS - 1 - colInRow;
    return { x: 60 + col * NODE_GAP_X, y: 60 + row * NODE_GAP_Y };
  }
  const width = 60 * 2 + (COLS - 1) * NODE_GAP_X;
  const height = 60 * 2 + 4 * NODE_GAP_Y;

  return (
    <div className="relative overflow-auto bg-gradient-to-br from-slate-950 via-indigo-950/40 to-slate-950 rounded-2xl border border-white/5 p-3">
      <svg width={width} height={height} className="block mx-auto">
        <defs>
          <radialGradient id="star-glow">
            <stop offset="0%" stopColor="#fff" stopOpacity={0.4} />
            <stop offset="40%" stopColor="#a78bfa" stopOpacity={0.2} />
            <stop offset="100%" stopColor="#a78bfa" stopOpacity={0} />
          </radialGradient>
        </defs>

        {/* Estrellas de fondo (decorativo) */}
        {Array.from({ length: 40 }).map((_, i) => (
          <circle
            key={`bg-${i}`}
            cx={(i * 137) % width}
            cy={(i * 211) % height}
            r={Math.random() * 1.2 + 0.3}
            fill="#cbd5e1"
            opacity={Math.random() * 0.4 + 0.1}
          />
        ))}

        {/* Líneas conectoras entre nodos */}
        {levels.slice(1).map((lv) => {
          const a = pos(lv - 1);
          const b = pos(lv);
          const active = lv <= currentLevel;
          return (
            <motion.line
              key={`line-${lv}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke={active ? colorFor(lv) : 'rgba(148,163,184,0.15)'}
              strokeWidth={active ? 2.5 : 1}
              strokeLinecap="round"
              initial={{ pathLength: 0, opacity: 0 }}
              animate={{ pathLength: 1, opacity: 1 }}
              transition={{ delay: lv * 0.04 }}
            />
          );
        })}

        {/* Nodos */}
        {levels.map((lv) => {
          const p = pos(lv);
          const passed = lv < currentLevel;
          const current = lv === currentLevel;
          const locked = lv > currentLevel;
          const isMilestone = [1, 5, 10, 15, 20, 25, 30].includes(lv);
          const color = colorFor(lv);

          return (
            <motion.g
              key={lv}
              initial={{ scale: 0, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ delay: lv * 0.03, type: 'spring', stiffness: 220, damping: 16 }}
              transform={`translate(${p.x},${p.y})`}
            >
              {/* Glow para current */}
              {current && (
                <>
                  <circle r="28" fill="url(#star-glow)" />
                  <motion.circle
                    r="14"
                    fill="none"
                    stroke={color}
                    strokeWidth="1.5"
                    initial={{ scale: 0.8, opacity: 0.8 }}
                    animate={{ scale: 1.6, opacity: 0 }}
                    transition={{ duration: 2, repeat: Infinity, ease: 'easeOut' }}
                  />
                </>
              )}
              <circle
                r={isMilestone ? 16 : 10}
                fill={passed || current ? color : 'rgba(15,15,25,0.9)'}
                stroke={locked ? 'rgba(148,163,184,0.2)' : color}
                strokeWidth={isMilestone ? 2.5 : 1.5}
                opacity={locked ? 0.5 : 1}
              />
              <text textAnchor="middle" y={4}
                    fontSize={isMilestone ? 11 : 9}
                    fontWeight={isMilestone ? 800 : 600}
                    fill={passed || current ? '#0f0f19' : locked ? 'rgba(148,163,184,0.4)' : color}>
                {lv}
              </text>
              {isMilestone && (
                <text textAnchor="middle" y={32}
                      fontSize={9}
                      fontWeight={700}
                      fill={passed || current ? color : 'rgba(148,163,184,0.5)'}>
                  {RANK_THRESHOLDS.find(t => t.level === lv)?.name?.toUpperCase()}
                </text>
              )}
            </motion.g>
          );
        })}
      </svg>
      <div className="mt-2 text-center text-xs text-slate-400">
        Nivel <span className="font-bold text-violet-300">{currentLevel}</span> · {currentExp.toLocaleString()} EXP total
      </div>
    </div>
  );
}
