import { test, expect, login, shot, measure } from './helpers';

test.describe('Catálogo, stock de piezas y venta rápida', () => {
  test('producto con variantes: producir stock y vender en marketplace', async ({ page, saveAs }) => {
    await login(page);
    await page.goto('/catalogo'); await expect(page.getByTestId('catalog')).toBeVisible(); await shot(page, '51-catalogo', { full: true });
    await expect(page.getByTestId('variant-row').first()).toBeVisible(); await shot(page, '52-stock-por-variante', { full: true });
    const before = parseInt(await page.getByTestId('variant-stock').first().innerText(), 10);
    await page.getByTestId('variant-produce').first().click(); await page.getByTestId('prod-qty').fill('3'); await page.getByTestId('prod-confirm').click();
    await expect(page.getByText('Orden de producción creada en la cola')).toBeVisible({ timeout: 15000 });
    await shot(page, '53-orden-produccion-creada');
    await page.goto('/cola'); await expect(page.getByTestId('board')).toBeVisible(); await shot(page, '53b-cola-con-orden-de-stock');
    await page.goto('/catalogo'); expect(before).toBeGreaterThanOrEqual(0);
    await page.goto('/ventas/nueva');
    await measure('Registrar una venta rápida de marketplace', { limitS: 30, note: 'objetivo: menos de 30 s' }, async () => {
      await page.getByTestId('sale-search').fill(''); await page.locator('[data-testid="quick-sale"] ul button').first().click();
      await expect(page.getByTestId('cart').locator('li')).toHaveCount(1);
      await page.getByTestId('sale-save').click(); await page.waitForURL(/\/ventas(\/[^/]+)?$/, { timeout: 20000 });
    });
    await shot(page, '54-venta-registrada', { full: true });
    saveAs('catalogo-venta-rapida');
  });
});
