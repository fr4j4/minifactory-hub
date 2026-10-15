import fs from 'node:fs';
import { strToU8, zipSync } from 'fflate';
import { test, expect, login, shot, measure } from './helpers';

test.describe('Configurar el laminado sin JSON', () => {
  test('máquina nueva → asistente → filamento personalizado → importar de Bambu Studio → laminar', async ({ page, saveAs }) => {
    await login(page);
    // una P1S recién agregada al taller, sin perfiles
    await page.goto('/maquinas/nueva'); await page.getByTestId('machine-name').fill('P1S Nueva'); await page.getByLabel('Marca').fill('Bambu Lab'); await page.getByLabel('Modelo').fill('P1S');
    await page.getByTestId('machine-save').click(); await page.waitForURL(/\/maquinas\/[0-9a-f-]{36}$/);
    await page.goto('/laminador'); await expect(page.getByTestId('setup-banner')).toBeVisible(); await shot(page, 'L01-laminador-falta-configurar');
    await page.getByTestId('setup-open').click(); await page.waitForURL('**/laminador/configurar');
    const row = page.getByTestId('setup-machine').filter({ hasText: 'P1S Nueva' });
    await expect(row.getByTestId('setup-machine-base')).toHaveText('Bambu Lab P1S 0.4 (boquilla)');
    await expect(row.getByTestId('setup-process')).toHaveValue('0.20mm Standard @BBL X1C');
    await shot(page, 'L02-asistente', { full: true });
    await measure('Configurar una impresora nueva para laminar', { limitS: 20 }, async () => {
      await row.getByTestId('setup-machine-save').click(); await expect(row).toContainText('Lista:', { timeout: 15_000 });
    });
    // filamento personalizado, agregado también al inventario
    await page.getByTestId('setup-summary').getByTestId('custom-filament').click();
    await page.getByTestId('cf-name').fill('Sunlu PETG Negro'); await page.getByTestId('cf-brand').fill('Sunlu'); await page.getByTestId('cf-type').selectOption('PETG');
    await expect(page.getByTestId('cf-nozzle_temperature')).toHaveAttribute('placeholder', /\d+/);
    await page.getByTestId('cf-nozzle_temperature').fill('245'); await page.getByTestId('cf-filament_density').fill('1,40'); await page.getByTestId('cf-filament_cost').fill('15990');
    await page.getByTestId('cf-color').fill('Negro');
    await shot(page, 'L03-filamento-personalizado');
    await page.getByTestId('cf-save').click(); await expect(page.getByText('Filamento creado y agregado al inventario')).toBeVisible();
    await expect(page.getByTestId('setup-material').filter({ has: page.getByTestId('setup-material-label').getByText('Sunlu PETG Negro', { exact: true }) })).toContainText('Perfil: Sunlu PETG Negro');
    // importar un proyecto .3mf y un paquete de filamentos de Bambu Studio
    await page.getByTestId('setup-summary').getByTestId('import-presets').click();
    const bundle = zipSync({ 'Mi PLA rápido.json': strToU8(JSON.stringify({ name: 'Mi PLA rápido', inherits: 'Bambu PLA Basic @BBL A1', from: 'User', filament_settings_id: ['Mi PLA rápido'], filament_max_volumetric_speed: ['24'], nozzle_temperature: ['225'] })) });
    await page.getByTestId('import-files').setInputFiles([{ name: 'llavero-a1.3mf', mimeType: 'model/3mf', buffer: fs.readFileSync('samples/llavero-a1.3mf') }, { name: 'mis-filamentos.bbsflmt', mimeType: 'application/zip', buffer: Buffer.from(bundle) }]);
    const prev = page.getByTestId('import-preview'); await expect(prev.locator('tbody tr')).toHaveCount(4, { timeout: 20_000 });
    await expect(prev).toContainText('Mi PLA rápido'); await expect(prev).toContainText('igual al de fábrica');
    await shot(page, 'L04-importar-vista-previa');
    await page.getByTestId('import-confirm').click(); await expect(page.getByText(/Importados: \d+ nuevos/)).toBeVisible();
    // editor: otros parámetros sin JSON y exportar para Bambu Studio
    await page.goto('/laminador'); await page.getByRole('link', { name: 'Mi PLA rápido' }).click();
    await page.getByTestId('param-search').fill('retraction_length'); await page.getByTestId('param-add').first().click();
    await expect(page.getByTestId('extra-params').locator('li')).toHaveCount(1); await expect(page.getByTestId('param-nozzle_temperature')).toHaveValue('225'); await shot(page, 'L05-editor-parametros', { full: true });
    const dl = page.waitForEvent('download'); await page.getByTestId('profile-export').click(); const file = await dl;
    const json = JSON.parse(fs.readFileSync((await file.path())!, 'utf8')); expect(json).toMatchObject({ name: 'Mi PLA rápido', inherits: 'Bambu PLA Basic @BBL A1', type: 'filament', nozzle_temperature: ['225'] });
    // laminar en la P1S nueva con el PETG personalizado
    await page.goto('/archivos'); await page.waitForLoadState('networkidle'); await page.goto((await page.getByRole('link', { name: 'Barquito decorativo' }).first().getAttribute('href'))!); await page.waitForLoadState('networkidle'); await page.goto((await page.getByRole('link', { name: 'Laminar y cotizar' }).getAttribute('href'))!);
    await page.getByTestId('slice-machine').selectOption({ label: 'P1S Nueva' }); await page.getByTestId('slice-material').selectOption({ label: 'Sunlu PETG Negro' });
    await page.getByTestId('slice-go').click(); await expect(page.getByTestId('slice-result')).toBeVisible({ timeout: 120_000 });
    await shot(page, 'L06-laminado-con-filamento-personalizado');
    saveAs('laminado-configurar-sin-json');
  });
});
