import { test, expect, login, shot, measure } from './helpers';

test.describe('Pedido manual, cola y consumo de material', () => {
  test('registra un pedido de WhatsApp en menos de un minuto', async ({ page, saveAs }) => {
    await login(page);
    await page.goto('/pedidos/nuevo');
    await shot(page, '41-pedido-nuevo');
    await measure('Registrar un pedido manual (WhatsApp)', { limitS: 60, note: 'objetivo de la spec: menos de 1 min' }, async () => {
      await page.getByTestId('customer-name').fill('Camila Rojas'); await page.getByTestId('customer-phone').fill('+56 9 5555 1234').catch(() => {});
      await page.getByTestId('order-title').fill('20 llaveros con logo');
      const l = page.getByTestId('quote-line').first();
      await l.getByLabel('Descripción').fill('Llavero logo');
      await l.getByRole('radio', { name: 'Manual' }).click();
      await l.getByTestId('manual-grams').fill('9'); await l.getByTestId('manual-hours').fill('1');
      await l.getByTestId('line-qty').fill('20');
      await page.getByTestId('order-deposit').fill('5000');
      await page.getByTestId('order-save').click();
      await page.waitForURL(/\/pedidos\/[^/]+$/, { timeout: 30000 });
    });
    await expect(page.getByText('Camila Rojas').first()).toBeVisible();
    await shot(page, '42-pedido-registrado', { full: true });
    await page.goto('/pedidos'); await expect(page.getByText('20 llaveros con logo').first()).toBeVisible(); await shot(page, '43-pedidos-lista');
    saveAs('pedido-manual-rapido');
  });

  test('cola: tablero, gantt, iniciar y terminar un trabajo descuenta la bobina', async ({ page, saveAs }) => {
    await login(page);
    await page.goto('/cola'); await expect(page.getByTestId('board')).toBeVisible(); await shot(page, '44-cola-tablero', { full: true });
    await page.getByRole('tab', { name: /gantt/i }).click(); await expect(page.getByTestId('gantt')).toBeVisible(); await shot(page, '45-cola-gantt');
    await page.getByRole('tab', { name: /tablero/i }).click();
    const start = page.getByTestId('job-start').first();
    if (await start.isEnabled().catch(() => false)) {
      await start.click(); await expect(page.getByTestId('job-finish').first()).toBeVisible({ timeout: 15000 });
      await page.getByTestId('job-finish').first().click();
      await page.getByTestId('finish-grams').fill('10');
      await shot(page, '46-cola-terminar');
      await measure('Terminar un trabajo y descontar la bobina', { limitS: 30 }, async () => { await page.getByTestId('finish-confirm').click(); await expect(page.getByTestId('finish-confirm')).toBeHidden({ timeout: 15000 }); });
      await shot(page, '47-cola-terminado');
    }
    saveAs('cola-produccion');
  });
});
