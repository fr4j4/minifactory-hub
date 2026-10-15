import path from 'node:path';
import { test, expect, login, SAMPLES, uploadAcceptingDuplicates } from './helpers';

test.describe('Estudio (P5)', () => {
  test('proyecto multicolor: un material por extrusor, laminado y agregado a la cola; filtro «Mis perfiles»', async ({ page }) => {
    await login(page); await page.goto('/archivos'); await page.waitForLoadState('networkidle');
    await uploadAcceptingDuplicates(page, path.join(SAMPLES, 'multicolor-2-extrusores.3mf'));
    await page.waitForTimeout(3000); await page.reload(); await page.waitForLoadState('networkidle');
    await page.goto((await page.getByRole('link', { name: 'multicolor-2-extrusores' }).first().getAttribute('href'))!); await page.waitForLoadState('networkidle');
    await page.goto((await page.getByRole('link', { name: 'Laminar y cotizar' }).getAttribute('href'))!); await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('slice-extra-extruders')).toBeVisible({ timeout: 40_000 });
    await page.getByTestId('slice-go').click(); await expect(page.getByTestId('slice-result')).toBeVisible({ timeout: 90_000 });
    await page.getByTestId('enqueue-run').click(); await expect(page.getByText('Agregado a la cola de impresión')).toBeVisible();
    // «Mis perfiles»: solo personalizados e importados
    await page.goto('/laminador?own=1'); await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('own-filter')).toBeVisible();
    // Configuración: pestañas agrupadas
    await page.goto('/configuracion'); await expect(page.getByTestId('grouped-tabs')).toBeVisible();
  });
});
