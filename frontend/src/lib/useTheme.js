import { useEffect, useState } from 'react';

export const THEMES = [
  {
    id: 'violet',
    name: 'Violet Cósmico',
    description: 'El look por defecto — violeta + azul espacial',
    swatch: ['#7C5CFF', '#4DA3FF', '#F5C16C'],
  },
  {
    id: 'neon',
    name: 'Neon Cyber',
    description: 'Cyan y hot pink sobre azul oscuro. Sintetiza synthwave.',
    swatch: ['#FF33CC', '#00E5FF', '#FFE65A'],
  },
  {
    id: 'gold',
    name: 'Royal Gold',
    description: 'Vintage TCG: café, dorado y bronce.',
    swatch: ['#F0B45A', '#FFD778', '#C86E32'],
  },
  {
    id: 'forest',
    name: 'Bosque Esmeralda',
    description: 'Verde esmeralda + teal. Calmo y natural.',
    swatch: ['#50D282', '#3CC8C8', '#82C85A'],
  },
  {
    id: 'crimson',
    name: 'Crimson Forge',
    description: 'Rojos profundos y ámbar — intensidad de torneo.',
    swatch: ['#E64150', '#FF963C', '#F05082'],
  },
];

const STORAGE_KEY = 'elitecards.theme';
const DEFAULT_THEME = 'violet';

function applyTheme(themeId) {
  document.documentElement.setAttribute('data-theme', themeId);
}

export function useTheme() {
  const [theme, setTheme] = useState(() => {
    if (typeof window === 'undefined') return DEFAULT_THEME;
    return localStorage.getItem(STORAGE_KEY) || DEFAULT_THEME;
  });

  useEffect(() => {
    applyTheme(theme);
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  // Sync entre tabs
  useEffect(() => {
    function onStorage(e) {
      if (e.key === STORAGE_KEY && e.newValue && e.newValue !== theme) {
        setTheme(e.newValue);
      }
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [theme]);

  return { theme, setTheme };
}

// Para llamar antes de que React monte (evita flash de tema default)
export function bootstrapTheme() {
  if (typeof window === 'undefined') return;
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) applyTheme(saved);
}
