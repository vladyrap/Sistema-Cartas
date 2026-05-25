import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import App from './App';
import { LevelUpProvider } from './lib/useLevelUp';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <LevelUpProvider>
        <App />
        <Toaster position="top-right" toastOptions={{ style: { background: '#15172A', color: '#F5F5FA', border: '1px solid #2A2D45' } }} />
      </LevelUpProvider>
    </BrowserRouter>
  </React.StrictMode>
);
