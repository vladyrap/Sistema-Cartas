/** Badge LIVE pulsante con estado WS — verde/amarillo/rojo. */
import clsx from 'clsx';

export default function LiveBadge({ status }) {
  const cfg = {
    open:       { dot: 'bg-emerald-500', text: 'text-emerald-300', label: 'LIVE',         glow: 'shadow-emerald-500/60' },
    connecting: { dot: 'bg-amber-500',   text: 'text-amber-300',   label: 'CONECTANDO',   glow: 'shadow-amber-500/60' },
    closed:     { dot: 'bg-rose-500',    text: 'text-rose-300',    label: 'RECONECTANDO', glow: 'shadow-rose-500/60' },
    error:      { dot: 'bg-rose-500',    text: 'text-rose-300',    label: 'ERROR',        glow: 'shadow-rose-500/60' },
  }[status] || { dot: 'bg-slate-500', text: 'text-slate-400', label: '—', glow: '' };

  return (
    <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-black/30 border border-white/10">
      <span className={clsx('w-2 h-2 rounded-full animate-pulse shadow-lg', cfg.dot, cfg.glow)} />
      <span className={clsx('text-[10px] font-bold tracking-widest uppercase', cfg.text)}>
        {cfg.label}
      </span>
    </div>
  );
}
