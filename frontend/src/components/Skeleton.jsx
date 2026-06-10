/** Skeleton — placeholders animados con shimmer. Variantes comunes pre-armadas. */
import { motion } from 'framer-motion';

const SHIMMER = {
  initial: { backgroundPosition: '200% 0' },
  animate: { backgroundPosition: '-200% 0' },
  transition: { duration: 1.6, ease: 'linear', repeat: Infinity },
};

function Bar({ className = '', ...rest }) {
  return (
    <motion.div
      {...SHIMMER}
      className={`rounded-md ${className}`}
      style={{
        background:
          'linear-gradient(90deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.12) 50%, rgba(255,255,255,0.04) 100%)',
        backgroundSize: '200% 100%',
      }}
      {...rest}
    />
  );
}

/** Skeleton genérico: <Skeleton className="h-6 w-32" /> */
export default function Skeleton({ className = '' }) {
  return <Bar className={className} />;
}

/** Skeleton de filas para tablas — preset listo para usar. */
export function SkeletonRows({ rows = 6, cols = 5, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-4 py-3 rounded-xl bg-white/[0.02]">
          {Array.from({ length: cols }).map((__, j) => (
            <Bar key={j} className={`h-4 ${j === 0 ? 'w-8' : j === 1 ? 'w-32 flex-1' : 'w-20'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Skeleton de cards — grid de tarjetas. */
export function SkeletonCards({ count = 6, className = '' }) {
  return (
    <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 ${className}`}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="p-4 rounded-2xl bg-white/[0.03] ring-1 ring-white/5 space-y-3">
          <div className="flex items-center gap-3">
            <Bar className="w-10 h-10 rounded-xl" />
            <div className="flex-1 space-y-1.5">
              <Bar className="h-3 w-3/4" />
              <Bar className="h-2 w-1/2" />
            </div>
          </div>
          <Bar className="h-3 w-full" />
          <Bar className="h-3 w-5/6" />
          <div className="flex gap-2 pt-1">
            <Bar className="h-6 w-16 rounded-full" />
            <Bar className="h-6 w-20 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Skeleton de hero/header — útil para perfiles y dashboards. */
export function SkeletonHero({ className = '' }) {
  return (
    <div className={`space-y-4 ${className}`}>
      <Bar className="h-3 w-32" />
      <Bar className="h-10 w-2/3 max-w-md" />
      <Bar className="h-4 w-1/2 max-w-sm" />
    </div>
  );
}
