/** Bracket arborescente SVG. Calcula posiciones de nodos por (level, slot),
 * dibuja líneas conectoras tipo árbol, anima nodos completados con color.
 *
 * Convención del backend: level 0 = final, level N = hojas.
 * Acá lo invertimos visualmente: hojas a la izquierda, final a la derecha.
 */
import { motion } from 'framer-motion';
import clsx from 'clsx';

const NODE_W = 200;
const NODE_H = 64;
const COL_GAP = 80;
const ROW_GAP = 24;

export default function BracketSVG({ tree, onReportClick }) {
  if (!tree?.bracket) {
    return (
      <div className="text-center text-slate-500 py-12 text-sm">
        El bracket aún no se ha creado. El admin lo arma desde top-{tree?.bracket?.size || 8} cuando termine Swiss.
      </div>
    );
  }
  const { nodes, bracket } = tree;
  const totalLevels = Math.log2(bracket.size); // size=8 → 3 niveles
  // Para size=8: leaf level = totalLevels - 1 = 2 (cuartos), level 1 = semis, level 0 = final.
  const leafLevel = totalLevels - 1;
  const leafCount = 2 ** leafLevel; // = bracket.size / 2

  // Posiciones
  function pos(node) {
    // Visualmente: leaf level a la izquierda (col 0), final a la derecha (col leafLevel)
    const col = leafLevel - node.level;
    const x = col * (NODE_W + COL_GAP);
    // Y centrado: a más alto el nivel, más juntos los nodos.
    const rowsInLevel = 2 ** node.level;
    const totalRows = 2 ** leafLevel;
    const rowSpan = totalRows / rowsInLevel;
    const y = (node.slot * rowSpan + rowSpan / 2 - 0.5) * (NODE_H + ROW_GAP);
    return { x, y };
  }

  function parentPos(node) {
    const parentSlot = Math.floor(node.slot / 2);
    return pos({ level: node.level - 1, slot: parentSlot });
  }

  const width = totalLevels * (NODE_W + COL_GAP) - COL_GAP + NODE_W;
  const height = leafCount * (NODE_H + ROW_GAP);

  return (
    <div className="overflow-auto bg-slate-950/40 rounded-2xl border border-white/5 p-6">
      <svg width={width} height={height} className="min-w-full">
        {/* Líneas conectoras */}
        {nodes.filter(n => n.level > 0).length === 0 ? null : nodes.map((node) => {
          if (node.level === 0) return null; // no tiene padre
          const me = pos(node);
          const pa = parentPos(node);
          const settled = node.winner_id !== null;
          // Tres tramos: horizontal saliente, vertical, horizontal entrante.
          const midX = me.x + NODE_W + COL_GAP / 2;
          return (
            <g key={`line-${node.id}`}>
              <motion.path
                d={`M ${me.x + NODE_W} ${me.y + NODE_H / 2}
                    H ${midX}
                    V ${pa.y + NODE_H / 2}
                    H ${pa.x}`}
                fill="none"
                stroke={settled ? '#a78bfa' : 'rgba(148,163,184,0.3)'}
                strokeWidth={settled ? 2.5 : 1.5}
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.6, delay: node.slot * 0.05 }}
              />
            </g>
          );
        })}

        {/* Nodos */}
        {nodes.map((node) => {
          const p = pos(node);
          const hasPlayers = node.player_a_id && node.player_b_id;
          const settled = node.winner_id !== null;
          const winnerIsA = node.winner_id === node.player_a_id;
          const isFinal = node.level === 0;

          return (
            <motion.g
              key={node.id}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: (leafLevel - node.level) * 0.15 + node.slot * 0.04 }}
              transform={`translate(${p.x},${p.y})`}
              className={clsx(hasPlayers && 'cursor-pointer')}
              onClick={() => hasPlayers && !settled && onReportClick?.(node)}
            >
              <rect
                width={NODE_W} height={NODE_H} rx={10}
                className={clsx(
                  'transition-all',
                  isFinal && 'fill-amber-500/10 stroke-amber-400',
                  !isFinal && settled && 'fill-violet-500/10 stroke-violet-400',
                  !isFinal && !settled && hasPlayers && 'fill-slate-800/60 stroke-slate-600 hover:fill-slate-800',
                  !hasPlayers && 'fill-slate-900/40 stroke-slate-700',
                )}
                strokeWidth={settled || isFinal ? 1.5 : 1}
              />
              {/* Player A */}
              <text
                x={12} y={24}
                className={clsx(
                  'font-semibold text-[13px]',
                  winnerIsA && 'fill-emerald-300',
                  !winnerIsA && settled && 'fill-slate-500',
                  !settled && 'fill-slate-200',
                )}
              >
                {node.player_a_id ? `Seed ${node.seed_a ?? '?'}` : '...'}
                {' · '}
                <PlayerName id={node.player_a_id} />
              </text>
              {settled && (
                <text x={NODE_W - 12} y={24} textAnchor="end"
                      className={clsx('font-bold text-[14px] tabular-nums',
                        winnerIsA ? 'fill-emerald-300' : 'fill-slate-500')}>
                  {node.games_a}
                </text>
              )}
              {/* Línea divisoria */}
              <line x1={8} x2={NODE_W - 8} y1={NODE_H / 2} y2={NODE_H / 2}
                    className="stroke-white/5" strokeWidth={1} />
              {/* Player B */}
              <text
                x={12} y={50}
                className={clsx(
                  'font-semibold text-[13px]',
                  !winnerIsA && settled && 'fill-emerald-300',
                  winnerIsA && settled && 'fill-slate-500',
                  !settled && 'fill-slate-200',
                )}
              >
                {node.player_b_id ? `Seed ${node.seed_b ?? '?'}` : '...'}
                {' · '}
                <PlayerName id={node.player_b_id} />
              </text>
              {settled && (
                <text x={NODE_W - 12} y={50} textAnchor="end"
                      className={clsx('font-bold text-[14px] tabular-nums',
                        !winnerIsA ? 'fill-emerald-300' : 'fill-slate-500')}>
                  {node.games_b}
                </text>
              )}
              {/* Label nivel */}
              <text x={NODE_W / 2} y={-6} textAnchor="middle"
                    className="fill-slate-500 text-[9px] uppercase tracking-widest font-semibold">
                {isFinal ? 'FINAL' : node.level === 1 ? 'SEMIFINAL' : node.level === 2 ? 'CUARTOS' : 'OCTAVOS'}
                {' '}#{node.slot + 1}
              </text>
            </motion.g>
          );
        })}
      </svg>
    </div>
  );
}

/** Resuelve player_id → alias via cache prop opcional. Por defecto muestra el id. */
function PlayerName({ id, names }) {
  if (!id) return '';
  const alias = names?.[id];
  return alias || `#${id}`;
}
