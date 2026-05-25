import { Link } from 'react-router-dom';
import { ArrowLeft, Construction } from 'lucide-react';

export default function Stub({ title, description, phase }) {
  return (
    <div className="min-h-screen bg-bg text-white px-6 py-20">
      <div className="max-w-2xl mx-auto text-center">
        <Construction size={32} className="mx-auto text-elite-gold mb-4" />
        <h1 className="font-display text-3xl font-bold">{title}</h1>
        <p className="text-white/60 mt-3">{description}</p>
        {phase && (
          <p className="font-mono text-xs text-white/40 mt-4">Implementación: {phase}</p>
        )}
        <Link
          to="/"
          className="inline-flex items-center gap-2 mt-8 px-5 py-2.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-sm transition"
        >
          <ArrowLeft size={14} /> Volver al inicio
        </Link>
      </div>
    </div>
  );
}
