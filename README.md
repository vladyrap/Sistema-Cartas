# EliteCards

> Juega. Sube de nivel. Desbloquea beneficios. Conviértete en campeón.

Plataforma TCG moderna con sistema RPG competitivo por temporadas. No es solo una tienda — es una experiencia digital donde cada partida, torneo y reserva forma parte del progreso del jugador en la **Ruta del Campeón**.

## Stack

- **Backend**: FastAPI + SQLAlchemy + PostgreSQL + Redis + Alembic
- **Frontend**: Vite + React 18 + Tailwind CSS 3 + Framer Motion + Lucide React
- **Auth**: JWT (python-jose) + bcrypt
- **Lenguaje**: Python 3.11 (backend) · JavaScript ESM (frontend, no TypeScript)

Mismo stack que `miespejo.cl`. Sin Prisma — los modelos están en SQLAlchemy 2.x con sintaxis declarativa moderna.

## Estructura del repositorio

```
elitecards/
├── README.md                  # este archivo
├── PLANNING.md                # arquitectura general
├── ROADMAP.md                 # fases del MVP y post-MVP
├── DESIGN.md                  # propuesta visual / sistema de diseño
├── docs/                      # documentación adicional
│   └── season-reset.md        # detalle de la regla Maestro→Duelista
├── backend/
│   ├── app/
│   │   ├── core/              # config, db, security
│   │   ├── models/            # SQLAlchemy ORM
│   │   ├── schemas/           # Pydantic v2
│   │   ├── services/          # lógica de negocio (temporadas, EXP, ranking)
│   │   ├── routers/           # endpoints FastAPI
│   │   └── main.py            # entrypoint
│   ├── alembic/               # migraciones
│   ├── scripts/
│   │   └── seed.py            # datos de ejemplo
│   ├── requirements.txt
│   └── .env.example
└── frontend/
    ├── src/
    │   ├── pages/             # rutas (Landing, Dashboard, Ruta, Ranking…)
    │   ├── components/        # tarjetas, badges, barras, modals
    │   ├── lib/               # api client, helpers
    │   ├── App.jsx
    │   └── main.jsx
    ├── package.json
    └── tailwind.config.js
```

## Setup local

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
pip install -r requirements.txt
copy .env.example .env          # editar valores
alembic upgrade head            # crear tablas
python -m scripts.seed          # poblar datos de ejemplo
uvicorn app.main:app --reload   # http://localhost:8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev                     # http://localhost:5173
```

## Entidades clave

| Nombre interno | Concepto |
|---|---|
| **EXP Elite** | Puntos de temporada. Se reinician cada temporada. |
| **Prestigio** | Reputación permanente. No se reinicia. |
| **Elite ID** | Credencial digital del jugador (tipo tarjeta coleccionable). |
| **Elite Access** | Beneficio de preventa Nivel 15+. |
| **Elite Pro** | Catálogo premium Nivel 25+. |
| **Elite Circuit** | Liga competitiva. |
| **Elite Challenges** | Desafíos especiales. |
| **Final Elite** | Cierre competitivo de temporada Nivel 30. |
| **Hall of Fame** | Historial honorífico. |

## Niveles y rangos

| Nivel | Rango |
|---|---|
| 1-4 | Iniciado |
| 5-9 | Aprendiz |
| 10-14 | Duelista |
| 15-19 | Retador |
| 20-24 | Elite |
| 25-29 | Maestro |
| 30 | Campeón |

## Regla de reinicio de temporada

Al crear una nueva temporada:

- Jugadores que alcanzaron **Maestro o Campeón** en la temporada anterior comienzan como **Duelista Nivel 10**.
- Todos los demás comienzan como **Iniciado Nivel 1**.
- La ventaja **NO desbloquea** beneficios avanzados automáticamente. Hay que volver a alcanzar los niveles requeridos.
- Se conservan: medallas, títulos, prestigio, historial, Hall of Fame, Elite ID, rango máximo por temporada.

Ver detalle completo en [`docs/season-reset.md`](docs/season-reset.md).

## Estado actual

Fase 0 — Planning. El código está en `backend/` y `frontend/` como scaffold. La lógica completa del MVP se implementa por fases según [`ROADMAP.md`](ROADMAP.md).
