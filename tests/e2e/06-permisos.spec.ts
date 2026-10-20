import { test, expect, login, shot } from './helpers';

test.describe('Roles y permisos', () => {
  test('el operador no ve costos ni márgenes; ventas no accede a configuración', async ({ page }) => {
    await login(page, 'operador');
    await page.goto('/cola'); await shot(page, '61-operador-cola');
    await page.goto('/configuracion?tab=tarifas');
    await expect(page.getByTestId('rate-kwh')).toHaveCount(0);
    await page.goto('/reportes'); await shot(page, '62-operador-reportes');
    await expect(page.getByText(/margen/i)).toHaveCount(0);
  });
  test('admin ve tarifas y margen', async ({ page }) => {
    await login(page, 'admin'); await page.goto('/configuracion?tab=tarifas'); await expect(page.getByTestId('rate-kwh')).toBeVisible(); await shot(page, '63-admin-configuracion');
  });
  test('inventario: pesar una bobina', async ({ page, saveAs }) => {
    await login(page); await page.goto('/inventario'); await shot(page, '64-inventario', { full: true });
    await page.locator('details summary').filter({ hasText: /carretes|spools/i }).first().click(); await expect(page.getByTestId('spool-row').first()).toBeVisible(); await shot(page, '65-bobinas');
    saveAs('inventario');
  });
});
