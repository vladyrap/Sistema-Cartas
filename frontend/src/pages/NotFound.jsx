import { Link } from 'react-router-dom';
import { Compass, Home, Map, Sparkles } from 'lucide-react';

export default function NotFound() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-violet-950/30 text-white flex items-center justify-center px-6 relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(124,58,237,0.25),transparent_60%)] pointer-events-none" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_75%_20%,rgba(244,114,182,0.18),transparent_55%)] pointer-events-none" />

      <div className="relative max-w-2xl w-full text-center">
        <div className="flex items-center justify-center gap-2 mb-4">
          <Sparkles size={14} className="text-violet-400" />
          <span className="text-[10px] uppercase tracking-[0.5em] text-violet-300 font-bold">
            EliteCards
          </span>
        </div>

        <h1 className="text-[120px] sm:text-[180px] font-black tracking-tighter bg-gradient-to-r from-white via-violet-100 to-fuchsia-200 bg-clip-text text-transparent leading-none drop-shadow-2xl">
          404
        </h1>

        <h2 className="text-2xl sm:text-3xl font-black tracking-tight mt-2 mb-4">
          Esta página no existe.
        </h2>
        <p className="text-slate-400 mb-10 max-w-md mx-auto">
          La URL no coincide con ninguna ruta de la plataforma. Probá volver al
          inicio o explorar las funcionalidades en el Tour.
        </p>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Link
            to="/"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-bold text-sm hover:shadow-lg hover:shadow-violet-500/30 transition"
          >
            <Home size={16} /> Volver al inicio
          </Link>
          <Link
            to="/tour"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-white/80 hover:bg-white/10 hover:text-white font-medium text-sm transition"
          >
            <Map size={16} /> Tour guiado
          </Link>
          <Link
            to="/ranking"
            className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-white/80 hover:bg-white/10 hover:text-white font-medium text-sm transition"
          >
            <Compass size={16} /> Ranking
          </Link>
        </div>
      </div>
    </div>
  );
}
