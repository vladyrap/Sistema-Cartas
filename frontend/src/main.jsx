import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { LevelUpProvider } from './lib/useLevelUp';
import { bootstrapTheme } from './lib/useTheme';
import { registerServiceWorker } from './lib/registerSW';
import CommandPalette from './components/CommandPalette';
import VoiceButton from './components/VoiceButton';
import './index.css';

// Aplica el tema guardado ANTES del primer render (evita flash de violet default)
bootstrapTheme();

// Service Worker para PWA (solo en producción — dev evita cache agresivo)
registerServiceWorker();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LevelUpProvider>
        <App />
        <CommandPalette />
        <VoiceButton />
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
  </React.StrictMode>
);
