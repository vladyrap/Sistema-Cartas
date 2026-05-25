/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#07070C',
          surface: '#0F1018',
          elevated: '#15172A',
          border: '#2A2D45',
        },
        elite: {
          violet: '#7C5CFF',
          blue: '#4DA3FF',
          gold: '#F5C16C',
          magenta: '#E8519A',
        },
        rank: {
          iniciado: '#94A3B8',
          aprendiz: '#22D3EE',
          duelista: '#3B82F6',
          retador: '#8B5CF6',
          elite: '#EC4899',
          maestro: '#F59E0B',
          campeon: '#FACC15',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Sora', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'glow-violet': '0 0 30px rgba(124,92,255,0.35)',
        'glow-gold': '0 0 30px rgba(245,193,108,0.45)',
      },
    },
  },
  plugins: [],
};
