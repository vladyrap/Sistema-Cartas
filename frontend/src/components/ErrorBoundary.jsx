/** ErrorBoundary global — captura errores React, reporta a Sentry si está activo,
 * y muestra pantalla amigable de recuperación.
 *
 * React 18 no soporta error boundaries en hooks; tiene que ser componente de clase.
 */
import { Component } from 'react';
import { AlertTriangle, Home, RefreshCw } from 'lucide-react';

export default class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null, errorInfo: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, errorInfo) {
    this.setState({ errorInfo });

    // Reportar a Sentry si está disponible (no rompe si no lo está)
    try {
      // Lazy require para no agregar @sentry/react al bundle si no se usa
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const sentry = window.Sentry;
      if (sentry?.captureException) {
        sentry.captureException(error, {
          contexts: { react: { componentStack: errorInfo?.componentStack } },
        });
      }
    } catch {
      // ignore
    }

    // Eco al console para devs
    // eslint-disable-next-line no-console
    console.error('[ErrorBoundary]', error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  handleHome = () => {
    window.location.href = '/';
  };

  render() {
    if (!this.state.error) return this.props.children;

    const isDev = import.meta.env?.DEV;
    const msg = this.state.error?.message || String(this.state.error);

    return (
      <div className="min-h-screen bg-gradient-to-b from-slate-950 via-slate-900 to-rose-950/30 text-white flex items-center justify-center px-6">
        <div className="max-w-xl w-full text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-rose-500/20 ring-1 ring-rose-500/40 text-rose-300 mb-6">
            <AlertTriangle size={32} />
          </div>
          <h1 className="text-3xl sm:text-4xl font-black tracking-tight mb-3">
            Algo se rompió.
          </h1>
          <p className="text-slate-400 mb-8 max-w-md mx-auto">
            La página cayó por un error inesperado. Ya fue reportado al equipo. Probá
            recargar o volver al inicio.
          </p>

          {isDev && (
            <details className="mb-8 text-left bg-black/40 rounded-xl p-4 border border-white/10">
              <summary className="cursor-pointer text-xs font-mono text-rose-300 uppercase tracking-widest">
                Detalle (solo dev)
              </summary>
              <pre className="mt-3 text-xs text-slate-300 whitespace-pre-wrap break-words overflow-auto max-h-64">
                {msg}
                {this.state.errorInfo?.componentStack && (
                  <>{'\n\nComponent stack:'}{this.state.errorInfo.componentStack}</>
                )}
              </pre>
            </details>
          )}

          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <button
              onClick={this.handleReload}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white font-bold text-sm hover:shadow-lg hover:shadow-violet-500/30 transition"
            >
              <RefreshCw size={16} /> Recargar página
            </button>
            <button
              onClick={this.handleHome}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-white/[0.06] border border-white/10 text-white/80 hover:bg-white/10 hover:text-white font-medium text-sm transition"
            >
              <Home size={16} /> Volver al inicio
            </button>
          </div>
        </div>
      </div>
    );
  }
}
