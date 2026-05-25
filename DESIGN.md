# EliteCards — Sistema de diseño

> Carta coleccionable + RPG + esports + tecnología premium.

## Mood

Dark mode oscuro, profundidad, bordes brillantes tipo "carta legendaria", gradientes neón, sensación de **avance, rareza y mérito**. Inspiración: Hearthstone Battlegrounds, Riot esports portals, Genshin Impact UI, Apple cards premium.

## Paleta

```
Fondo principal      #07070C  (negro profundo, sin azul)
Superficie 1         #0F1018  (cards base)
Superficie 2         #15172A  (cards elevadas)
Borde sutil          #2A2D45
Borde brillante      gradient: #6366F1 → #A855F7

Texto primario       #F5F5FA
Texto secundario     #B1B3C8
Texto muted          #6B6E85

Accent primario      #7C5CFF   (Violeta Elite)
Accent secundario    #4DA3FF   (Azul Circuit)
Accent dorado        #F5C16C   (Maestro / premiación)
Accent rosa-magenta  #E8519A   (notificaciones, peligro suave)
Accent verde         #4ADE80   (éxito, completado)
Accent rojo          #EF4444   (eliminado, peligro fuerte)
```

### Colores por rango

| Rango | Color principal | Glow |
|---|---|---|
| Iniciado | `#94A3B8` | gris-azulado tenue |
| Aprendiz | `#22D3EE` | cyan |
| Duelista | `#3B82F6` | azul |
| Retador | `#8B5CF6` | violeta |
| Elite | `#EC4899` | magenta |
| Maestro | `#F59E0B` | ámbar |
| Campeón | gradient `#FACC15 → #F97316 → #DC2626` | dorado-fuego |

## Tipografía

- **Headings**: `Sora` (700/800) — geométrica, moderna, premium.
- **Body**: `Inter` (400/500/600) — neutra y legible.
- **Numbers / EXP / Nivel**: `JetBrains Mono` (600) — sensación HUD/cifra digital.
- **Acentos cinematográficos** (frases hero tipo "Conviértete en campeón"): `Sora 800` con tracking apretado.

Google Fonts:
```html
<link href="https://fonts.googleapis.com/css2?family=Sora:wght@400;600;700;800&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@500;600;700&display=swap" rel="stylesheet">
```

## Sistema visual

### Elite ID (credencial)

Tarjeta vertical, 5:7, estilo carta TCG premium:

- Fondo gradient diagonal según clase del jugador
- Holograma sutil (animado en hover)
- Avatar circular con border degradado
- Alias en Sora 700
- Rango actual + nivel
- Prestigio histórico abajo en mono
- Número de jugador "EC-2026-001234"
- QR placeholder esquina inferior
- Borde brillante animado en hover (efecto "carta rara")

### Rank Badge

Círculo con icono SVG + nombre del rango debajo. Tamaños: `sm` (32px), `md` (48px), `lg` (96px), `xl` (160px).
Color del borde y glow según rango. Hover: leve flotación y intensifica glow.

### Class Badge

Pill con icono (espadas, cofre, libro, profesor, intercambio, brújula) + nombre.
Color de acento distinto por clase.

### Exp Bar

Barra horizontal de progreso con gradiente del rango actual al rango siguiente.
Animación de relleno cuando se gana EXP (Framer Motion).
Etiqueta: "Nivel 14 · 1.430 / 2.100 EXP — 670 para Retador".

### Ruta del Campeón (timeline)

Mapa vertical o curva en zig-zag de nivel 1 a 30, con:
- Nodos circulares cada nivel, color según rango.
- Nodo del nivel actual con animación pulse.
- Nodos futuros en gris con candado.
- Iconos de beneficios en niveles 5, 10, 15, 20, 25, 30.
- Hover en cualquier nodo: tooltip con "Qué desbloqueas".

### Card de jugador (ranking)

Fila tipo HUD esports:
```
#3   [avatar]  PlayerAlias              [Rango]  Nivel 23   12.340 EXP    [Clase Pill]
```

Hover: leve elevación + glow del color del rango.
Top 3: borde dorado/plateado/bronce.

### Card de evento

Diseño tipo poster esports: imagen / patrón geométrico del juego, fecha grande en JetBrains Mono, nombre del torneo en Sora, cupos en pill (`12/16`), botón "Inscribirme" rectangular con gradient violet→blue.

### Card de producto

- Imagen 4:3 o 1:1.
- Si requiere nivel: badge esquina superior derecha con candado + "Nivel 15+".
- Si es Elite Pro: cinta diagonal dorada "PRO".
- Si es preventa: contador regresivo.
- Stock indicador (barra delgada).
- Botón "Reservar" o "No disponible" según validación.

### Animaciones (Framer Motion)

- Entrada de páginas: fade up 16px en 350ms ease-out.
- Cards hover: `scale(1.02)` + glow.
- Subida de nivel (notificación global): card central con particle burst, gradient explosion, sonido opcional (post-MVP).
- Loaders: skeleton con shimmer diagonal.
- Transiciones entre tabs: slide horizontal.

## Componentes Tailwind base

Clases utility para reutilizar:

```js
// Card base
'rounded-2xl bg-[#0F1018] border border-[#2A2D45] backdrop-blur-sm'

// Card elevada
'rounded-2xl bg-gradient-to-br from-[#15172A] to-[#0F1018] border border-violet-500/20'

// Botón primario
'inline-flex items-center justify-center px-6 py-3 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600 text-white font-medium hover:shadow-lg hover:shadow-violet-500/40 transition'

// Botón ghost
'inline-flex items-center justify-center px-6 py-3 rounded-xl border border-white/10 text-white/80 hover:bg-white/5 hover:text-white transition'

// Badge rango (ejemplo Duelista)
'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-semibold bg-blue-500/10 text-blue-300 border border-blue-500/30'

// Glow halo (decorativo, absolute)
'absolute -inset-px rounded-2xl bg-gradient-to-r from-violet-500/40 via-blue-500/30 to-fuchsia-500/40 blur-xl opacity-0 group-hover:opacity-100 transition'
```

## Estados visuales por rango (placeholder para Tailwind config)

Se agregan al `tailwind.config.js`:

```js
theme: {
  extend: {
    colors: {
      bg: { DEFAULT: '#07070C', surface: '#0F1018', elevated: '#15172A', border: '#2A2D45' },
      elite: { violet: '#7C5CFF', blue: '#4DA3FF', gold: '#F5C16C', magenta: '#E8519A' },
      rank: {
        iniciado: '#94A3B8',
        aprendiz: '#22D3EE',
        duelista: '#3B82F6',
        retador: '#8B5CF6',
        elite:   '#EC4899',
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
      'glow-gold':   '0 0 30px rgba(245,193,108,0.45)',
    },
  },
}
```

## Páginas — sketches en texto

### Landing

```
┌──────────────────────────────────────────────────────────┐
│  EliteCards logo                Nav    [Crear Elite ID]  │
│                                                          │
│         JUEGA. SUBE DE NIVEL.                            │
│         DESBLOQUEA BENEFICIOS.                           │
│         CONVIÉRTETE EN CAMPEÓN.                          │
│                                                          │
│   La plataforma TCG donde tu progreso vale.              │
│   [Crear mi Elite ID]   [Ver próximos eventos]           │
│                                                          │
│   ─────── Ruta del Campeón ───────                       │
│   [timeline visual nivel 1 → 30]                         │
│                                                          │
│   ─────── EXP Elite ───────                              │
│   [grid de cómo ganar EXP]                               │
│                                                          │
│   ─────── Próximos torneos ───────                       │
│   [3 cards de eventos]                                   │
│                                                          │
│   ─────── Catálogo Pro ───────                           │
│   [4 productos premium con candado]                      │
│                                                          │
│   ─────── Hall of Fame ───────                           │
│   [Campeones de temporadas pasadas]                      │
│                                                          │
│   Footer (contacto, redes, legal)                        │
└──────────────────────────────────────────────────────────┘
```

### Dashboard jugador

```
┌──────────────────────────────────────────────────────────┐
│  [Nav]                                  [Avatar + Alias] │
│  ┌─────────────────┐ ┌────────────────────────────────┐  │
│  │                 │ │  Bienvenido, Vladimir          │  │
│  │   Elite ID      │ │  Nivel 14 · DUELISTA           │  │
│  │   (carta)       │ │  [████████████░░░░] 1430/2100  │  │
│  │                 │ │  670 EXP para RETADOR          │  │
│  │                 │ │                                │  │
│  │                 │ │  Prestigio: 1.250  ·  #4 rk    │  │
│  └─────────────────┘ └────────────────────────────────┘  │
│                                                          │
│  ┌─ Misiones activas ──┐  ┌─ Beneficios desbloqueados ┐  │
│  │ ✓ Inscríbete a 1    │  │ ✓ Elite ID activa         │  │
│  │ ⏳ Gana 3 rondas    │  │ ✓ Misiones semanales      │  │
│  │ ⏳ Top 8 torneo     │  │ ✓ Sorteos de temporada    │  │
│  └─────────────────────┘  │ 🔒 Preventa Nivel 15      │  │
│                           └────────────────────────────┘  │
│  ┌─ Próximos eventos ──────────────────────────────────┐ │
│  │ [card] [card] [card]                                │ │
│  └─────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
```

### Ruta del Campeón

Vista única dedicada al timeline 1→30 en grande, con tooltip por nivel, animación pulse en nivel actual, candados en niveles futuros, y panel lateral con todos los beneficios listados.

## Accesibilidad

- Contraste mínimo AA en todos los textos sobre fondo oscuro.
- Estados de focus visibles (`ring-2 ring-violet-500/50 ring-offset-bg`).
- Animaciones respetan `prefers-reduced-motion`.
- Todos los íconos decorativos tienen `aria-hidden`. Los semánticos llevan `aria-label`.

## Decisiones aún abiertas

- ¿Música ambiente en landing? (probable post-MVP).
- ¿Modo "carta foil"? (efecto holográfico animado en Elite ID — sería un wow factor pero requiere tiempo).
- Logo / mascota / nombre tipográfico definitivo de "EliteCards" (placeholder en MVP).
