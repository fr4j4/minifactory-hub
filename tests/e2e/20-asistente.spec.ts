import fs from 'node:fs';
import path from 'node:path';
import { execSync, spawn, type ChildProcess } from 'node:child_process';
import { test, expect } from '@playwright/test';

/** El asistente necesita una base SIN cuentas: se levanta una segunda instancia en otro puerto con datos propios. */
const PORT = 3290; const DIR = path.resolve('data/e2e-setup');
let srv: ChildProcess; let token = '';
const env = { ...process.env, PGLITE_DIR: path.join(DIR, 'pgdata'), STORAGE_DIR: path.join(DIR, 'storage'), DATA_DIR: DIR, SESSION_SECRET: 'e2e', ADMIN_PASSWORD: '' };
delete (env as any).ADMIN_EMAIL;

test.beforeAll(async () => {
  fs.rmSync(DIR, { recursive: true, force: true }); fs.mkdirSync(DIR, { recursive: true });
  const out = execSync('npx tsx scripts/seed.ts --bootstrap-only', { env, encoding: 'utf8' });
  token = out.match(/código: ([A-Z0-9]{12})/)?.[1] ?? ''; expect(token).toHaveLength(12);
  srv = spawn('npx', ['next', 'start', '-p', String(PORT)], { env: { ...env, NODE_ENV: 'production' }, stdio: 'ignore', detached: true });
  for (let i = 0; i < 60; i++) { try { const r = await fetch(`http://localhost:${PORT}/login`, { redirect: 'manual' }); if (r.status) break; } catch { /* aún no */ } await new Promise((r) => setTimeout(r, 1000)); }
});
test.afterAll(() => { try { if (srv?.pid) process.kill(-srv.pid, 'SIGKILL'); } catch { /* ya terminó */ } });

test.describe('Asistente inicial (N10)', () => {
  test('código de un solo uso → cuenta → modo completo → cargar ejemplos → terminar → reabrir', async ({ page }) => {
    const U = `http://localhost:${PORT}`;
    await page.goto(U + '/login'); await expect(page).toHaveURL(/bienvenida/); await page.waitForLoadState('networkidle');
    await page.locator('input.input').fill('CODIGOERRONEO'); await page.getByRole('button', { name: /Verificar/ }).click();
    await expect(page.getByRole('alert').filter({ hasText: /incorrecto/ })).toBeVisible();
    await page.locator('input.input').fill(''); await page.locator('input.input').fill(token); await expect(page.locator('input.input')).toHaveValue(token); await page.getByRole('button', { name: /Verificar/ }).click(); await expect(page.getByRole('heading', { name: 'Idioma y región' })).toBeVisible();
    await page.getByRole('button', { name: /Continuar/ }).click();
    await page.getByRole('textbox').first().fill('Ana Taller'); await page.locator('input[type=email]').fill('ana@taller.cl'); await page.locator('input[type=password]').fill('una-clave-muy-larga-1');
    await page.getByRole('button', { name: /Continuar/ }).click();
    await page.getByRole('textbox').first().fill('Taller de Ana'); await page.getByRole('button', { name: /Crear taller/ }).click();
    await expect(page.getByTestId('setup-mode')).toBeVisible();
    await page.getByTestId('mode-full').click();
    await expect(page.getByTestId('load-demo')).toBeVisible();
    await page.getByTestId('load-demo').click(); await expect(page.getByTestId('load-demo')).toBeDisabled({ timeout: 60_000 });
    await page.getByRole('button', { name: /Terminar/ }).click(); await expect(page).toHaveURL(U + '/');
    await expect(page.getByText(/Taller de Ana|Buenos|Buenas|Hello|Good/).first()).toBeVisible();
    // el token ya no sirve y el asistente no vuelve solo
    await page.goto(U + '/bienvenida'); await expect(page).toHaveURL(U + '/');
    // reabrir desde Configuración → Sistema
    await page.goto(U + '/configuracion?tab=sistema'); await page.waitForLoadState('networkidle');
    await page.getByTestId('reopen-setup').click(); await expect(page).toHaveURL(/bienvenida/);
  });
  test('reabierto: entra con su cuenta y termina de nuevo', async ({ page }) => {
    const U = `http://localhost:${PORT}`;
    await page.goto(U + '/login'); await page.waitForLoadState('networkidle');
    await page.getByLabel(/Correo/).fill('ana@taller.cl'); await page.getByLabel(/Contraseña/).fill('una-clave-muy-larga-1'); await page.getByRole('button', { name: 'Ingresar' }).click();
    await expect(page).toHaveURL(/bienvenida/); // quedó reabierto
    await expect(page.getByRole('heading', { name: 'Puesta en marcha' })).toBeVisible(); // reabrir conserva el modo completo
    await page.getByRole('button', { name: /Terminar/ }).click(); await expect(page).toHaveURL(U + '/');
  });
});
