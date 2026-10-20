import { expect, login, measure, shot, test } from './helpers';

test.describe('Laminador en el servidor (OrcaSlicer)', () => {
  test('lamina una pieza, ve las capas y descarga el G-code', async ({ page, saveAs }) => {
    await login(page); await page.goto('/archivos'); await page.waitForLoadState('networkidle'); await page.goto((await page.getByRole('link', { name: 'Barquito decorativo' }).first().getAttribute('href'))!); await page.waitForLoadState('networkidle');
    await page.goto((await page.getByRole('link', { name: 'Laminar y cotizar' }).getAttribute('href'))!); await shot(page, '20-laminar-panel');
    await measure('Laminar una pieza y ver tiempo, gramos y precio', { limitS: 30, note: 'objetivo de la spec: menos de 30 s' }, async () => {
      await page.getByTestId('slice-go').click(); await expect(page.getByTestId('slice-result')).toBeVisible({ timeout: 60000 });
    });
    await expect(page.getByTestId('res-time')).toContainText(/\d+:\d\d h/); expect(parseFloat((await page.getByTestId('res-grams').innerText()).replace(',', '.'))).toBeGreaterThan(1); await expect(page.getByTestId('res-price')).toContainText('$');
    const t1 = await page.getByTestId('res-time').innerText(); const [h1, m1] = t1.replace(' h', '').split(':').map(Number); const min1 = h1 * 60 + m1;
    await shot(page, '21-laminar-resultado');
    await page.getByTestId('enqueue-run').click(); await expect(page.getByText('Agregado a la cola de impresión')).toBeVisible();
    await page.getByTestId('show-layers').click(); await expect(page.getByTestId('gcode-layer-readout')).toContainText('/ 164', { timeout: 30000 }); await page.getByTestId('gcode-layer-slider').fill('90'); await page.waitForTimeout(500); await shot(page, '22-laminar-capas', { full: true });
    const dl = page.waitForEvent('download'); await page.getByTestId('dl-gcode').click(); expect((await dl).suggestedFilename()).toMatch(/\.gcode$/);
    // 4 copias en una placa: no cuesta 4 veces el tiempo (calentamiento y purga compartidos)
    await page.getByTestId('slice-copies').fill('4'); await page.getByTestId('slice-go').click(); await expect(page.getByTestId('res-time')).not.toHaveText(t1, { timeout: 60000 });
    const t4 = await page.getByTestId('res-time').innerText(); const [h, m] = t4.replace(' h', '').split(':').map(Number); expect(h * 60 + m).toBeLessThan(min1 * 4); await shot(page, '23-laminar-4-copias');
    // pieza que no cabe: mensaje claro
    await page.goto('/archivos'); await page.waitForLoadState('networkidle'); await page.waitForLoadState('networkidle'); await page.goto((await page.getByRole('link', { name: 'Placa grande 300 mm' }).first().getAttribute('href'))!); await page.goto((await page.getByRole('link', { name: 'Laminar y cotizar' }).getAttribute('href'))!);
    await page.getByTestId('slice-machine').selectOption({ index: 1 }); await page.getByTestId('slice-go').click(); await expect(page.getByTestId('slice-error')).toContainText('no cabe', { timeout: 60000 }); await shot(page, '24-laminar-no-cabe');
    saveAs('laminador-resultado-capas');
  });

  test('perfiles: duplicar, cambiar relleno y velocidades, usar la nueva versión y volver atrás', async ({ page, saveAs }) => {
    await login(page); await page.goto('/laminador'); await page.waitForLoadState('networkidle'); await shot(page, '25-perfiles', { full: true });
    await page.getByRole('row', { name: /A1 · 0,20 Standard/ }).getByRole('button', { name: 'Duplicar' }).click();
    await expect(page.getByTestId('dup-name')).toHaveValue('A1 · 0,20 Standard (copia)'); await page.getByTestId('dup-confirm').click(); await expect(page.getByRole('link', { name: 'A1 · 0,20 Standard (copia)' })).toBeVisible();
    await page.getByRole('link', { name: 'A1 · 0,20 Standard (copia)' }).click(); await expect(page.getByTestId('param-sparse_infill_density')).toBeVisible();
    await page.getByTestId('param-sparse_infill_density').fill('50%'); await page.getByTestId('param-sparse_infill_pattern').selectOption('gyroid'); await page.getByTestId('param-outer_wall_speed').fill('60'); await shot(page, '26-editor-perfil');
    await page.getByTestId('profile-save').click(); await expect(page.getByTestId('profile-versions')).toContainText('v2'); await expect(page.getByTestId('profile-versions')).toContainText('Actual');
    // el siguiente laminado usa la versión nueva: más gramos que con el 15% de fábrica
    await page.goto('/archivos'); await page.waitForLoadState('networkidle'); await page.goto((await page.getByRole('link', { name: 'Barquito decorativo' }).first().getAttribute('href'))!); await page.waitForLoadState('networkidle'); await page.goto((await page.getByRole('link', { name: 'Laminar y cotizar' }).getAttribute('href'))!);
    await page.getByTestId('slice-process').selectOption({ label: 'A1 · 0,20 Standard (copia)' }); await page.getByTestId('slice-go').click(); await expect(page.getByTestId('slice-result')).toBeVisible({ timeout: 60000 });
    const g = parseFloat((await page.getByTestId('res-grams').innerText()).replace(',', '.')); expect(g).toBeGreaterThan(8.5);
    // volver a la v1
    await page.goto('/laminador'); await page.waitForLoadState('networkidle'); await page.getByRole('link', { name: 'A1 · 0,20 Standard (copia)' }).click(); await page.getByRole('button', { name: 'Volver' }).click(); await expect(page.getByTestId('profile-versions')).toContainText('v3');
    saveAs('laminador-perfiles');
  });

  test('comparador: tres combinaciones lado a lado', async ({ page, saveAs }) => {
    await login(page); await page.goto('/laminador?tab=comparar'); await page.waitForLoadState('networkidle'); await page.getByTestId('cmp-file').selectOption({ label: 'Barquito decorativo' });
    await measure('Comparar 3 combinaciones de laminado', { limitS: 60 }, async () => { await page.getByTestId('cmp-go').click(); await expect(page.getByTestId('cmp-row')).toHaveCount(3); await expect(page.getByTestId('cmp-results')).not.toContainText('Laminando…', { timeout: 90000 }); });
    await shot(page, '27-comparador', { full: true }); await expect(page.getByTestId('cmp-results').locator('tbody tr').first()).toContainText('$');
    saveAs('laminador-comparador');
  });
});
