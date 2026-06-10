// @ts-check
/**
 * Smoke E2E — los flows mínimos que deben funcionar para subir a prod.
 *
 * Requiere:
 *   - backend corriendo en :8000 con la DB seedeada (admin@elitecards.cl / admin123)
 *   - frontend corriendo en :5173
 *
 * Correr:  npx playwright test
 */
import { test, expect } from '@playwright/test';

const ADMIN_EMAIL = 'admin@elitecards.cl';
const ADMIN_PASS = 'admin123';

test.describe('Smoke — rutas públicas', () => {
  test('landing carga y muestra hero', async ({ page }) => {
    await page.goto('/');
    // Esperamos que algún H1 visible aparezca (texto exacto puede variar)
    await expect(page.locator('h1').first()).toBeVisible({ timeout: 10_000 });
  });

  test('ruta inexistente muestra 404', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');
    await expect(page.getByText('404')).toBeVisible();
    await expect(page.getByRole('link', { name: /volver al inicio/i })).toBeVisible();
  });

  test('tour guiado carga con steps', async ({ page }) => {
    await page.goto('/tour');
    await expect(page.getByText(/master tour/i).first()).toBeVisible();
    // El step 1 muestra "Bienvenida"
    await expect(page.getByText(/bienvenida/i)).toBeVisible();
  });

  test('ranking público carga', async ({ page }) => {
    await page.goto('/ranking');
    await expect(page.getByText(/ranking competitivo/i)).toBeVisible({ timeout: 10_000 });
  });
});

test.describe('Smoke — auth flow', () => {
  test('login admin → dashboard', async ({ page }) => {
    await page.goto('/login');

    // Inputs por placeholder o type (la página de login puede variar)
    await page.locator('input[type="email"]').fill(ADMIN_EMAIL);
    await page.locator('input[type="password"]').fill(ADMIN_PASS);
    await page.locator('button[type="submit"]').click();

    // Debería redirigir a /dashboard
    await page.waitForURL('**/dashboard', { timeout: 10_000 });
    await expect(page.getByText(/hola/i)).toBeVisible();
  });

  test('login con credenciales inválidas muestra error', async ({ page }) => {
    await page.goto('/login');
    await page.locator('input[type="email"]').fill('nope@elitecards.cl');
    await page.locator('input[type="password"]').fill('wrongpass');
    await page.locator('button[type="submit"]').click();

    // Debe mostrar toast o mensaje. Esperamos que NO redirija.
    await page.waitForTimeout(2000);
    expect(page.url()).toContain('/login');
  });
});

test.describe('Smoke — navbar', () => {
  test('logo lleva al home', async ({ page }) => {
    await page.goto('/ranking');
    await page.getByRole('link', { name: /elitecards/i }).first().click();
    await page.waitForURL('http://localhost:5173/');
  });

  test('navbar links principales son visibles en desktop', async ({ page, viewport }) => {
    test.skip(!!viewport && viewport.width < 1024, 'solo desktop');
    await page.goto('/');
    for (const label of ['Ruta', 'Ranking', 'Eventos', 'Catálogo', 'Gremios']) {
      await expect(page.getByRole('link', { name: label, exact: true })).toBeVisible();
    }
  });
});

test.describe('Smoke — backend health', () => {
  const API = process.env.E2E_API_URL || 'http://127.0.0.1:8000';

  test('/health responde 200', async ({ request }) => {
    const res = await request.get(`${API}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe('ok');
  });

  test('/health/deep tiene checks de DB y scheduler', async ({ request }) => {
    const res = await request.get(`${API}/health/deep`);
    const body = await res.json();
    expect(body.checks).toHaveProperty('db');
    expect(body.checks).toHaveProperty('scheduler');
    expect(body.checks).toHaveProperty('fts');
    expect(body.checks.db.ok).toBeTruthy();
  });
});
