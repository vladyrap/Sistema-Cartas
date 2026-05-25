import { RANK_COLORS } from '../lib/progression';

export default function RankBadge({ rank, level, size = 'md' }) {
  const colors = RANK_COLORS[rank] || RANK_COLORS.INICIADO;
  const cls = size === 'sm' ? 'text-[10px] px-2 py-0.5' : size === 'lg' ? 'text-sm px-3 py-1.5' : 'text-xs px-2.5 py-1';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-md font-semibold ${cls} ${colors.bg} ${colors.text} ${colors.border} border`}>
      {colors.label}{level != null && <span className="opacity-70">· N{level}</span>}
    </span>
  );
}
