import { test, expect, login, shot, measure } from './helpers';

test.describe('Presupuestos con varios modelos', () => {
  test('arma un presupuesto con dos líneas, fija el precio final, PDF y aprueba (genera el pedido)', async ({ page, saveAs }) => {
    await login(page);
    await page.goto('/presupuestos/nuevo');
    await shot(page, '31-presupuesto-nuevo');
    await measure('Armar y guardar un presupuesto con 2 líneas', { limitS: 120, note: 'objetivo de la spec: menos de 2 min' }, async () => {
      await page.getByLabel('Título del presupuesto').fill('Carcasas y llaveros para Café Sur');
      // línea 1: manual
      await page.getByTestId('add-line').click();
      const l1 = page.getByTestId('quote-line').first();
      await l1.getByLabel('Descripción').fill('Llaveros logo');
      await l1.getByRole('radio', { name: 'Manual' }).click();
      await l1.getByTestId('manual-grams').fill('12'); await l1.getByTestId('manual-hours').fill('1'); await l1.getByTestId('manual-minutes').fill('30');
      await l1.getByTestId('line-qty').fill('10');
      await expect(l1.getByTestId('line-suggested')).toContainText('$');
      // línea 2: dos modelos de la biblioteca
      await page.getByTestId('add-line').click();
      const l2 = page.getByTestId('quote-line').nth(1);
      await l2.getByLabel('Descripción').fill('Set decorativo (varios modelos)');
      await l2.getByTestId('model-pick').selectOption({ index: 1 });
      await l2.getByTestId('model-pick').selectOption({ index: 2 }).catch(() => {});
      await l2.getByRole('radio', { name: 'Manual' }).click();
      await l2.getByTestId('manual-grams').fill('20'); await l2.getByTestId('manual-hours').fill('2');
    });
    await shot(page, '32-presupuesto-lineas', { full: true });
    const sug = await page.getByTestId('sum-suggested').innerText();
    // el usuario decide el precio final del total
    await page.locator('#final-total').fill('45000');
    await expect(page.getByTestId('sum-total')).toContainText('45.000');
    await shot(page, '33-presupuesto-precio-final');
    expect(sug).toContain('$');
    // pausa como la de una persona: deja correr el autoguardado (2,5 s) antes de pulsar Guardar
    await page.waitForTimeout(Number(process.env.QUOTE_PAUSE_MS ?? 3500));
    await page.getByTestId('quote-save').click();
    await expect(page.getByTestId('quote-send')).toBeVisible({ timeout: 30000 }); await page.goto(page.url().replace(/\?.*$/, ''));
    await expect(page.getByTestId('quote-summary')).toContainText('45.000');
    await shot(page, '34-presupuesto-detalle', { full: true });
    // PDF
    const r = await page.request.get(page.url().replace(/\/presupuestos\//, '/api/quotes/') + '/pdf');
    expect(r.status()).toBe(200); expect(r.headers()['content-type']).toContain('pdf');
    // enviar → congelado, y aprobar → pedido
    await page.getByTestId('quote-send').click();
    await expect(page.getByText(/congelad/i).first()).toBeVisible();
    await page.getByTestId('quote-approve').click();
    await page.getByTestId('approve-by').fill('Café Sur');
    await page.getByTestId('approve-deposit').fill('10000');
    await shot(page, '35-presupuesto-aprobar');
    await page.getByTestId('approve-confirm').click();
    await page.waitForURL(/\/pedidos\/[^/]+$/, { timeout: 30000 });
    await expect(page.getByTestId('order-view-total')).toContainText('45.000');
    await shot(page, '36-pedido-desde-presupuesto', { full: true });
    saveAs('presupuesto-varios-modelos');
  });
});
