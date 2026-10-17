import { test, expect } from '@playwright/test';
import { login } from './helpers';

/** Un trabajo cancelado se puede volver a lanzar: por línea, o relanzando el trabajo; «Enviar a producción» (todas) solo sin trabajos previos. */
test('pedido: cancelar un trabajo permite lanzar la línea de nuevo, sin duplicar', async ({ page }) => {
  test.setTimeout(150_000);
  await login(page); await page.goto('/pedidos/nuevo');
  await page.getByTestId('customer-name').fill('Relanzar E2E'); await page.getByTestId('order-title').fill('Pedido para relanzar');
  const l = page.getByTestId('quote-line').first();
  await l.getByLabel('Descripción').fill('Pieza relanzable'); await l.getByRole('radio', { name: 'Manual' }).click();
  await l.getByTestId('manual-grams').fill('9'); await l.getByTestId('manual-hours').fill('1'); await l.getByTestId('line-qty').fill('2');
  await page.getByTestId('order-save').click(); await page.waitForURL(/\/pedidos\/(?!nuevo)[^/]+$/, { timeout: 30000 });
  const orderUrl = page.url();

  await expect(page.getByTestId('launch-line')).toBeVisible(); // línea pendiente: se puede lanzar sola
  await page.getByTestId('plan-production').click(); // sin trabajos previos: se pueden lanzar todas
  await expect(page.getByTestId('plan-production')).toBeHidden(); await expect(page.getByTestId('launch-line')).toBeHidden();

  await page.goto('/cola'); // cancelar el trabajo desde la cola
  const card = page.getByTestId('job-card').filter({ hasText: 'Pieza relanzable' });
  await card.getByRole('button', { name: /^Cancelar/ }).click(); await expect(card).toHaveCount(0);

  await page.goto(orderUrl);
  await expect(page.getByTestId('plan-production')).toBeVisible(); // ya no hay trabajos en cola, en curso ni terminados
  await expect(page.getByTestId('launch-line')).toBeVisible(); await expect(page.getByTestId('requeue-job')).toBeVisible();
  await page.getByTestId('launch-line').click(); // lanzar solo esa línea
  await expect(page.getByTestId('launch-line')).toBeHidden(); await expect(page.getByTestId('plan-production')).toBeHidden();
  await page.goto('/cola'); await expect(page.getByTestId('job-card').filter({ hasText: 'Pieza relanzable' })).toHaveCount(1); // un solo trabajo vivo
  await page.goto(orderUrl); await page.getByTestId('requeue-job').click(); // relanzar el cancelado duplicaría la línea: se rechaza
  await page.goto('/cola'); await expect(page.getByTestId('job-card').filter({ hasText: 'Pieza relanzable' })).toHaveCount(1);
  await page.getByTestId('job-card').filter({ hasText: 'Pieza relanzable' }).getByRole('button', { name: /^Cancelar/ }).click(); // deja la cola como estaba
});
