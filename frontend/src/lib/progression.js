// Helpers cliente: replica las funciones puras del backend para mostrar UI sin roundtrip.

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 30;

export const RANK_BANDS = [
  [1, 4, 'INICIADO'],
  [5, 9, 'APRENDIZ'],
  [10, 14, 'DUELISTA'],
  [15, 19, 'RETADOR'],
  [20, 24, 'ELITE'],
  [25, 29, 'MAESTRO'],
  [30, 30, 'CAMPEON'],
];

export const RANK_COLORS = {
  INICIADO: { text: 'text-rank-iniciado', bg: 'bg-rank-iniciado/10', border: 'border-rank-iniciado/30', label: 'Iniciado' },
  APRENDIZ: { text: 'text-rank-aprendiz', bg: 'bg-rank-aprendiz/10', border: 'border-rank-aprendiz/30', label: 'Aprendiz' },
  DUELISTA: { text: 'text-rank-duelista', bg: 'bg-rank-duelista/10', border: 'border-rank-duelista/30', label: 'Duelista' },
  RETADOR: { text: 'text-rank-retador', bg: 'bg-rank-retador/10', border: 'border-rank-retador/30', label: 'Retador' },
  ELITE: { text: 'text-rank-elite', bg: 'bg-rank-elite/10', border: 'border-rank-elite/30', label: 'Elite' },
  MAESTRO: { text: 'text-rank-maestro', bg: 'bg-rank-maestro/10', border: 'border-rank-maestro/30', label: 'Maestro' },
  CAMPEON: { text: 'text-rank-campeon', bg: 'bg-rank-campeon/10', border: 'border-rank-campeon/30', label: 'Campeón' },
};

export const BENEFITS_BY_LEVEL = {
  1: 'Elite ID activa',
  5: 'Misiones semanales',
  10: 'Sorteos de temporada',
  15: 'Preventa Nivel 1 (Elite Access básico)',
  20: 'Elite Access completo',
  25: 'Catálogo Elite Pro',
  30: 'Final Elite y prioridad máxima',
};

export function rankFromLevel(level) {
  for (const [lo, hi, rank] of RANK_BANDS) {
    if (level >= lo && level <= hi) return rank;
  }
  return 'INICIADO';
}

export function expRequiredForLevel(target) {
  if (target <= MIN_LEVEL) return 0;
  return Math.round(100 * Math.pow(1.15, target - 2));
}

export function progressToNext(level, expInLevel) {
  if (level >= MAX_LEVEL) {
    return { percent: 100, remaining: 0, required: null, nextLevel: null };
  }
  const required = expRequiredForLevel(level + 1);
  const remaining = Math.max(0, required - expInLevel);
  const percent = Math.min(100, (expInLevel / required) * 100);
  return { percent: Math.round(percent * 10) / 10, remaining, required, nextLevel: level + 1 };
}

export function unlockedBenefits(level) {
  return Object.entries(BENEFITS_BY_LEVEL)
    .map(([lv, label]) => ({ level: Number(lv), label, unlocked: level >= Number(lv) }))
    .sort((a, b) => a.level - b.level);
}
