import AxeBuilder from '@axe-core/playwright';
import { test, expect, login, shot } from './helpers';

async function openSlicePanel(page: import('@playwright/test').Page) {
  await page.goto('/archivos'); await page.waitForLoadState('networkidle'); await page.getByRole('link', { name: 'Barquito decorativo' }).first().click(); await page.waitForURL(/\/archivos\/[0-9a-f-]{36}/); await page.waitForLoadState('networkidle');
  await page.getByRole('link', { name: 'Laminar y cotizar' }).click(); await expect(page.getByTestId('slice-panel')).toBeVisible();
}

test.describe('Asesor de perfiles con IA (Fase 1)', () => {
  test('con la IA apagada no hay ningún control de IA en el laminador', async ({ page }) => {
    await login(page); await openSlicePanel(page);
    await expect(page.getByTestId('advisor-open')).toHaveCount(0);
  });

  test('configurar IA → proponer → laminar de verdad → comparar → guardar como nueva versión', async ({ page, saveAs }) => {
    await login(page);
    await page.goto('/configuracion?tab=ia'); await page.waitForLoadState('networkidle');
    await page.getByTestId('ai-provider').selectOption('genericOpenai'); await page.getByTestId('ai-base-url').fill('http://127.0.0.1:18090/v1');
    await page.getByTestId('ai-enabled').check(); await page.getByTestId('ai-feat-profile.advisor').check(); await page.getByTestId('ai-feat-slicer.explain').check();
    await page.getByTestId('ai-save').click(); await expect(page.getByText('Configuración de IA guardada')).toBeVisible();

    await openSlicePanel(page);
    await page.getByTestId('advisor-open').click(); await expect(page.getByTestId('advisor-panel')).toBeVisible();
    await page.getByTestId('advisor-goal-rapido').click(); await shot(page, 'IA10-asesor-formulario');
    await page.getByTestId('advisor-propose').click();
    await expect(page.getByTestId('advisor-result')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('advisor-cand-conservador')).toBeVisible(); await expect(page.getByTestId('advisor-cand-equilibrado')).toBeVisible();
    // el parámetro no permitido que "propuso" el modelo no aparece
    await expect(page.getByTestId('advisor-result')).not.toContainText('machine_start_gcode'); await expect(page.getByTestId('advisor-cand-equilibrado').getByTestId('advisor-rejected')).toContainText('1 cambio');
    await shot(page, 'IA11-asesor-propuesta', { full: true });
    const ax = await new AxeBuilder({ page }).include('[data-testid="advisor-panel"]').withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(ax.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);

    await page.getByTestId('advisor-evaluate').click();
    await expect(page.getByTestId('advisor-measured-equilibrado')).toBeVisible({ timeout: 180000 }); await expect(page.getByTestId('advisor-measured-conservador')).toBeVisible({ timeout: 180000 });
    await expect(page.getByTestId('advisor-best')).toBeVisible({ timeout: 30000 });
    await expect(page.getByTestId('advisor-cand-equilibrado').getByTestId('advisor-best')).toBeVisible(); // la capa de 0,28 gana para «más rápido»
    await shot(page, 'IA12-asesor-comparacion', { full: true });

    await page.getByTestId('advisor-apply-equilibrado').click(); await expect(page.getByText(/se guardó 1 perfil/)).toBeVisible();
    await page.goto('/laminador'); await page.waitForLoadState('networkidle'); await page.getByRole('link', { name: 'A1 · 0,20 Standard', exact: true }).first().click(); await page.waitForURL(/\/laminador\/perfiles\//); await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('profile-versions')).toContainText('Sugerido por IA'); await expect(page.getByTestId('perf-empty')).toBeVisible();
    await shot(page, 'IA13-perfil-con-version-ia', { full: true });
    saveAs('asesor-perfiles-ia');
  });

  test('el operador no ve el asesor por objetivo (solo admin por defecto)', async ({ page }) => {
    await login(page, 'operador'); await openSlicePanel(page);
    await expect(page.getByTestId('advisor-open')).toHaveCount(0);
  });
});
