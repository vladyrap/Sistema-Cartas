/** @type {import('tailwindcss').Config} */
// Colores como CSS variables — permite cambiar tema en runtime vía data-theme.
// El frontend lee de :root y de [data-theme="..."] definidos en index.css.
const v = (name) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT:  v('bg'),
          surface:  v('bg-surface'),
          elevated: v('bg-elevated'),
          border:   v('bg-border'),
        },
        elite: {
          violet:  v('elite-violet'),
          blue:    v('elite-blue'),
          gold:    v('elite-gold'),
          magenta: v('elite-magenta'),
        },
        // Rank colors: identidad del juego, NO cambian entre temas.
        rank: {
          iniciado: '#94A3B8',
          aprendiz: '#22D3EE',
          duelista: '#3B82F6',
          retador:  '#8B5CF6',
          elite:    '#EC4899',
          maestro:  '#F59E0B',
          campeon:  '#FACC15',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Sora', 'sans-serif'],
        mono: ['JetBrains Mono', 'ui-monospace', 'monospace'],
      },
      boxShadow: {
        'glow-violet': '0 0 30px rgb(var(--elite-violet) / 0.35)',
        'glow-gold':   '0 0 30px rgb(var(--elite-gold) / 0.45)',
      },
      gridTemplateColumns: {
        '15': 'repeat(15, minmax(0, 1fr))',
      },
    },
  },
  plugins: [],
};
