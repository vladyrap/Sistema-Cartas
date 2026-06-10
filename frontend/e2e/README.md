# E2E Tests — Playwright

Pruebas end-to-end de los flows críticos para subir a producción.

## Setup (una vez)

```bash
cd frontend
npm install                              # ya incluye @playwright/test
npx playwright install chromium          # descarga el browser (~150MB)
```

## Correr

Requiere backend (`:8000`) y frontend (`:5173`) corriendo con la DB seedeada.

```bash
# Todos los tests
npx playwright test

# Solo uno
npx playwright test smoke.spec.js -g "login admin"

# UI mode (interactivo, recomendado para debug)
npx playwright test --ui

# Headed (ver el browser)
npx playwright test --headed
```

## Variables

```bash
E2E_BASE_URL=http://localhost:5173   # frontend (default)
E2E_API_URL=http://127.0.0.1:8000    # backend  (default)
```

## En CI

El `.github/workflows/ci.yml` actual NO corre Playwright porque requiere
descargar browsers (~150MB) y suma ~3 min. Si querés agregarlo:

```yaml
  e2e:
    name: E2E (Playwright)
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: frontend
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: "20", cache: npm, cache-dependency-path: frontend/package-lock.json }
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      # Levantar backend en bg + frontend, esperar /health, correr tests
      - run: |
          cd ../backend && pip install -r requirements.txt && python -m scripts.seed &
          sleep 10
          npm run dev &
          sleep 5
          npx playwright test
        env:
          DATABASE_URL: sqlite:///./ci.db
          JWT_SECRET: ci-test-secret-with-more-than-32-characters-of-entropy
```

## Reportes

Tras correr los tests, abrir:

```bash
npx playwright show-report
```
