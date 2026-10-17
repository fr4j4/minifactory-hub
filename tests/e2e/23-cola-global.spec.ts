import { test, expect } from '@playwright/test';
import { login } from './helpers';

/** Cola única: se ordena arrastrando, se asigna arrastrando a una máquina (o con el selector) y se puede desasignar. */
test('cola global: crear, ordenar, asignar, cambiar de máquina y desasignar', async ({ page }) => {
  test.setTimeout(120_000);
  await login(page); await page.goto('/cola');
  for (const n of ['Alfa', 'Beta', 'Gamma']) {
    await page.getByTestId('new-job').click(); await page.getByLabel('Título').fill(n);
    await page.getByRole('button', { name: 'Crear' }).click(); await expect(page.getByText(n).first()).toBeVisible();
  }
  const cards = page.getByTestId('board').locator('section[aria-label="En cola"] [data-testid=job-card]');
  await expect(cards).toHaveCount(3); await expect(page.getByText('Trabajo creado')).toHaveCount(0, { timeout: 20000 }); // los avisos tapan las tarjetas
  const job = (n: string) => cards.filter({ hasText: n });

  await job('Gamma').dragTo(job('Alfa')); // reordenar: Gamma pasa delante de Alfa
  await expect(cards.first()).toContainText('Gamma');

  const machine = page.getByTestId('board').locator('section').nth(1); const name = (await machine.getAttribute('aria-label'))!;
  await job('Beta').dragTo(machine); // asignar arrastrando a una máquina
  await expect(job('Beta').getByText(name, { exact: true }).first()).toBeVisible();
  await expect(machine.getByText(/Beta/)).toBeVisible(); // y aparece entre los próximos de esa máquina

  await job('Beta').getByRole('combobox').selectOption({ index: 2 }); // cambiar de máquina con el selector
  await expect(job('Beta').getByRole('combobox')).not.toHaveValue('');
  await job('Beta').getByRole('combobox').selectOption(''); // desasignar
  await expect(job('Beta').getByRole('combobox')).toHaveValue('');

  await job('Beta').getByRole('button', { name: /Subir/ }).click(); // subir en la cola
  await expect(cards.last()).toContainText('Alfa');

  await page.getByRole('tab', { name: /gantt/i }).click(); await expect(page.getByTestId('gantt')).toBeVisible();
  await page.getByRole('tab', { name: /tablero/i }).click();
  for (let i = 0; i < 3; i++) { await cards.first().getByRole('button', { name: /^Cancelar/ }).click(); await expect(cards).toHaveCount(2 - i); } // deja la cola como estaba
});
