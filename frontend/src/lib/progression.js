// Helpers cliente: replica las funciones puras del backend para mostrar UI sin roundtrip.

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 100;

export const EXP_GROWTH = 1.06;
export const EXP_BASE = 100;

export const RANK_BANDS = [
  [1,  15,  'INICIADO'],
  [16, 30,  'APRENDIZ'],
  [31, 45,  'DUELISTA'],
  [46, 60,  'RETADOR'],
  [61, 75,  'ELITE'],
  [76, 90,  'MAESTRO'],
  [91, 100, 'CAMPEON'],
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
  1:   'Elite ID activa',
  10:  'Torneos casuales y eventos básicos',
  20:  'Misiones semanales',
  30:  'Sorteos de temporada',
  45:  'Preventa Nivel 1 (Elite Access básico)',
  60:  'Elite Access completo',
  75:  'Catálogo Elite Pro',
  90:  'Final Elite y prioridad máxima',
  100: 'Leyenda del Gremio',
};

export function rankFromLevel(level) {
  for (const [lo, hi, rank] of RANK_BANDS) {
    if (level >= lo && level <= hi) return rank;
  }
  return 'INICIADO';
}

export function expRequiredForLevel(target) {
  if (target <= MIN_LEVEL) return 0;
  return Math.round(EXP_BASE * Math.pow(EXP_GROWTH, target - 2));
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
