/** AuthGuard — wrapper para páginas que requieren login. Muestra EmptyState
 * con CTA al login en lugar de "Cargando..." infinito cuando no hay sesión.
 */
import { LogIn } from 'lucide-react';
import Navbar from './Navbar';
import EmptyState from './EmptyState';
import { auth } from '../lib/auth';

/**
 * Uso:
 *   const guarded = useAuthGuarded({ feature: 'el Spinner', returnUrl: '/spinner' });
 *   if (guarded) return guarded;
 *   // ... resto del componente
 */
export function useAuthGuarded({ feature = 'esta función', returnUrl, accent = 'violet' } = {}) {
  if (auth.isAuthed()) return null;
  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-violet-950/30 text-white">
      <Navbar />
      <EmptyState
        icon={LogIn}
        title="Iniciá sesión"
        description={`Necesitas estar logueado para usar ${feature}.`}
        action={{ label: 'Iniciar sesión', to: `/login${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}` }}
        accent={accent}
      />
    </div>
  );
}

/** Versión componente declarativa. */
export default function AuthGuard({ feature, returnUrl, accent = 'violet', children }) {
  if (!auth.isAuthed()) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-violet-950/30 text-white">
        <Navbar />
        <EmptyState
          icon={LogIn}
          title="Iniciá sesión"
          description={`Necesitas estar logueado para usar ${feature || 'esta función'}.`}
          action={{ label: 'Iniciar sesión', to: `/login${returnUrl ? `?returnUrl=${encodeURIComponent(returnUrl)}` : ''}` }}
          accent={accent}
        />
      </div>
    );
  }
  return children;
}
