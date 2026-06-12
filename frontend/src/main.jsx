import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import * as Sentry from '@sentry/react';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { LevelUpProvider } from './lib/useLevelUp';
import { bootstrapTheme } from './lib/useTheme';
import { registerServiceWorker } from './lib/registerSW';
import CommandPalette from './components/CommandPalette';
import './index.css';

// Sentry — solo activa si VITE_SENTRY_DSN está seteado en build/env.
// Sin DSN = no-op (no descarga init en runtime).
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN;
if (SENTRY_DSN) {
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: import.meta.env.MODE,
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE || 0),
    integrations: [Sentry.browserTracingIntegration()],
  });
  // Exponer en window para que ErrorBoundary lo use sin import circular
  window.Sentry = Sentry;
}

// Aplica el tema guardado ANTES del primer render (evita flash de violet default)
bootstrapTheme();

// Service Worker para PWA (solo en producción — dev evita cache agresivo)
registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <BrowserRouter>
        <LevelUpProvider>
          <App />
          <CommandPalette />
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: 'rgb(var(--bg-elevated))',
                color: 'rgb(var(--body-text))',
                border: '1px solid rgb(var(--bg-border))',
              },
            }}
          />
        </LevelUpProvider>
      </BrowserRouter>
    </ErrorBoundary>
  </React.StrictMode>
);
