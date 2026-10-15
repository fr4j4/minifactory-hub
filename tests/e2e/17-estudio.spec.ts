import { test, expect, login, shot } from './helpers';

test.describe('Estudio de laminado (R5)', () => {
  test('ajusta el relleno: re-lamina casi en vivo, muestra deltas contra la base y se puede restablecer', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/archivos'); await page.getByRole('link', { name: 'Barquito decorativo' }).first().click();
    await page.getByRole('link', { name: 'Laminar y cotizar' }).click();
    await page.waitForLoadState('networkidle'); await page.getByTestId('open-studio').click();
    await expect(page.getByTestId('studio')).toBeVisible();
    // la primera corrida (base) termina sola
    await expect(page.getByTestId('studio-status')).toContainText(/Laminado|Sliced/, { timeout: 90_000 });
    const g0 = parseFloat((await page.getByTestId('res-grams').innerText()).replace(',', '.'));
    // buscar el relleno en español y subirlo
    await page.getByTestId('param-search').fill('relleno');
    const input = page.getByTestId('param-sparse_infill_density');
    await input.fill('70%');
    await expect(page.getByTestId('param-row-sparse_infill_density')).toContainText(/Base|base/);
    await expect(page.getByTestId('studio-status')).toContainText(/Laminando|Slicing|Desactualizado|Out of date/);
    await expect(page.getByTestId('studio-status')).toContainText(/Laminado|Sliced/, { timeout: 90_000 });
    const g1 = parseFloat((await page.getByTestId('res-grams').innerText()).replace(/[^\d,.]/g, '').replace(',', '.').slice(0, 5));
    expect(await page.getByTestId('res-grams').innerText()).toMatch(/\+/); // delta visible contra la base
    void g0; void g1;
    await shot(page, 'R5-estudio');
    // restablecer vuelve a la base y marca sin cambios
    await page.getByTestId('param-row-sparse_infill_density').getByRole('button', { name: /Restablecer|Reset/ }).click();
    await page.getByTestId('only-modified').check();
    await expect(page.getByText(/Sin resultados|No results/)).toBeVisible();
  });
  test('valida en línea: una capa fuera de rango avisa sin romper', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/archivos'); await page.getByRole('link', { name: 'Barquito decorativo' }).first().click(); await page.waitForURL(/\/archivos\/[0-9a-f-]{36}/);
    await page.goto(page.url().replace(/\?.*$/, '') + '/estudio');
    await page.getByTestId('studio-auto').uncheck();
    await page.getByTestId('param-search').fill('altura de capa');
    await page.getByTestId('param-layer_height').fill('2');
    await expect(page.getByTestId('param-row-layer_height').getByRole('alert')).toContainText(/rango|range/);
  });
});

test.describe('Estudio · explorar', () => {
  test('barrido del relleno: tabla, gráfico y «usar esta» carga el ajuste', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/archivos'); await page.getByRole('link', { name: 'Barquito decorativo' }).first().click(); await page.waitForURL(/\/archivos\/[0-9a-f-]{36}/);
    await page.goto(page.url().replace(/\?.*$/, '') + '/estudio');
    await expect(page.getByTestId('studio-status')).toContainText(/Laminado|Sliced/, { timeout: 90_000 });
    await page.getByTestId('studio-explore').click();
    await page.getByTestId('preset-material').click();
    await page.getByTestId('explore-run').click();
    await expect(page.getByTestId('explore-table').locator('tbody tr')).toHaveCount(4);
    await expect(page.getByTestId('explore-use').first()).toBeVisible({ timeout: 120_000 });
    await expect(page.getByTestId('explore-scatter')).toBeVisible();
    await page.getByTestId('explore-use').first().click();
    await page.getByTestId('param-search').fill('relleno');
    await expect(page.getByTestId('param-row-sparse_infill_density')).toContainText(/Base|base/); // el ajuste quedó como modificado
  });
});
