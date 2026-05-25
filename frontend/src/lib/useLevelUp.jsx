import { createContext, useCallback, useContext, useRef, useState } from 'react';
import LevelUpModal from '../components/LevelUpModal';
import { api } from './api';
import { auth } from './auth';
import { rankFromLevel, BENEFITS_BY_LEVEL } from './progression';

const LevelUpContext = createContext(null);
const STORAGE_KEY = 'ec_last_level';

export function LevelUpProvider({ children }) {
  const [info, setInfo] = useState(null);
  const lastSeenRef = useRef(null);

  const checkLevelUp = useCallback(async () => {
    if (!auth.isAuthed()) return;
    try {
      const { data } = await api.get('/players/me');
      const newLevel = data?.progress?.level;
      if (!newLevel) return;

      const stored = parseInt(localStorage.getItem(STORAGE_KEY) || '0');
      const prev = stored || newLevel;

      if (newLevel > prev) {
        const newRank = rankFromLevel(newLevel);
        const newBenefits = Object.entries(BENEFITS_BY_LEVEL)
          .filter(([lv]) => Number(lv) > prev && Number(lv) <= newLevel)
          .map(([lv, label]) => ({ level: Number(lv), label }));
        setInfo({ fromLevel: prev, toLevel: newLevel, newRank, newBenefits });
      }
      localStorage.setItem(STORAGE_KEY, String(newLevel));
      lastSeenRef.current = newLevel;
    } catch { /* silent */ }
  }, []);

  // Setear baseline al login fresh (cuando no hay storage)
  const setBaseline = useCallback((level) => {
    if (level) localStorage.setItem(STORAGE_KEY, String(level));
  }, []);

  return (
    <LevelUpContext.Provider value={{ checkLevelUp, setBaseline }}>
      {children}
      <LevelUpModal open={!!info} info={info} onClose={() => setInfo(null)} />
    </LevelUpContext.Provider>
  );
}

export function useLevelUp() {
  const ctx = useContext(LevelUpContext);
  if (!ctx) throw new Error('useLevelUp debe usarse dentro de <LevelUpProvider>');
  return ctx;
}
