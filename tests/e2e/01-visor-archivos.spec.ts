import path from 'node:path';
import { expect, login, measure, SAMPLES, shot, test } from './helpers';

test.describe('Archivos 3D: subida, análisis y visor', () => {
  test('sube un STL, lo ve en 3D, lo mide y sabe si cabe', async ({ page, saveAs }) => {
    await login(page); await page.goto('/archivos'); await shot(page, '01-biblioteca');
    // subida por la interfaz (por partes) y análisis automático en segundo plano
    await measure('Subir un STL y ver su análisis', { limitS: 30, note: 'incluye subida por partes, análisis y miniatura' }, async () => {
      await page.waitForLoadState('networkidle'); await page.getByTestId('model-uploader').locator('input[type=file]').setInputFiles(path.join(SAMPLES, 'engranaje.stl'));
      await expect(page.getByText('Listo ✓')).toBeVisible();
      await page.reload(); await page.getByRole('link', { name: 'engranaje', exact: false }).first().click();
      await expect(page.getByTestId('analysis')).toContainText('54 × 54 × 8 mm', { timeout: 30000 });
    });
    await expect(page.getByTestId('analysis')).toContainText('Sí'); await expect(page.getByTestId('viewer-canvas')).toBeVisible(); await expect(page.getByTestId('fit-badge')).toContainText('Cabe');
    await page.waitForTimeout(800); await shot(page, '02-visor-solido', { full: true });
    for (const v of ['frente', 'arriba', 'lado', 'iso']) { await page.getByTestId(`view-${v}`).click(); await page.waitForTimeout(250); }
    for (const m of ['alambrico', 'rayosx', 'normales']) { await page.getByTestId(`mode-${m}`).click(); await page.waitForTimeout(350); if (m === 'alambrico') await shot(page, '03-visor-alambrico'); if (m === 'normales') await shot(page, '04-visor-normales'); }
    await page.getByTestId('mode-solido').click();
    // medir distancia entre dos puntos
    await page.getByTestId('tool-measure').click(); const box = (await page.getByTestId('viewer-canvas').boundingBox())!;
    await page.mouse.click(box.x + box.width * 0.42, box.y + box.height * 0.5); await page.mouse.click(box.x + box.width * 0.6, box.y + box.height * 0.55);
    await expect(page.getByTestId('measure-readout')).toContainText('mm'); await shot(page, '05-visor-medicion');
    // plano de corte y voladizos
    await page.getByTestId('section-toggle').check(); await page.getByTestId('section-slider').fill('55'); await page.waitForTimeout(400); await shot(page, '06-visor-seccion'); await page.getByTestId('section-toggle').uncheck();
    await page.getByTestId('overhang-toggle').check(); await page.waitForTimeout(300);
    // escala y rotación de prueba actualizan las dimensiones
    await page.getByTestId('scale-slider').fill('200'); await expect(page.getByTestId('dims')).toContainText('108,0 ×'); await page.getByTestId('scale-slider').fill('100');
    await page.getByTestId('rot-x').click(); await expect(page.getByTestId('dims')).toContainText('54,0'); await page.getByRole('button', { name: 'Restablecer' }).click();
    // ¿cabe? cambia con la máquina
    const opts = await page.getByTestId('machine-select').locator('option').allTextContents(); await page.getByTestId('machine-select').selectOption({ index: opts.findIndex((o) => o.includes('Ender')) });
    await expect(page.getByTestId('fit-badge')).toContainText('Ender'); await page.getByTestId('scale-slider').fill('300'); await expect(page.getByTestId('fit-badge')).toContainText('Cabe'); await shot(page, '07-visor-escala'); await page.getByTestId('scale-slider').fill('100');
    // captura del visor descargable
    const dl = page.waitForEvent('download'); await page.getByTestId('capture').click(); expect((await dl).suggestedFilename()).toMatch(/\.png$/);
    saveAs('visor-3d-analisis');
  });

  test('pieza demasiado grande: avisa que no cabe y lo prueba girando', async ({ page }) => {
    await login(page); await page.goto('/archivos'); await page.getByRole('link', { name: 'Placa grande 300 mm' }).first().click();
    await expect(page.getByTestId('fit-badge')).toContainText('No cabe en Bambu', { timeout: 30000 }); await expect(page.getByTestId('analysis')).toContainText('300 × 120 × 40 mm'); await shot(page, '08-pieza-grande');
    await page.getByTestId('scale-slider').fill('80'); await expect(page.getByTestId('fit-badge')).toContainText('Cabe'); // 240 mm ya entra en 256
  });

  test('G-code y 3MF laminados: metadatos y vista previa por capas', async ({ page, saveAs }) => {
    await login(page); await page.goto('/archivos');
    await page.waitForLoadState('networkidle'); await page.getByTestId('model-uploader').locator('input[type=file]').setInputFiles([path.join(SAMPLES, 'barquito-a1.gcode'), path.join(SAMPLES, 'llavero-a1.3mf')]);
    await expect(page.getByText('Listo ✓').first()).toBeVisible({ timeout: 60000 }); await page.waitForTimeout(3000); await page.reload();
    await page.getByRole('link', { name: 'barquito-a1' }).first().click();
    await expect(page.getByTestId('sliced-meta')).toContainText('OrcaSlicer 2.4.2', { timeout: 40000 }); await expect(page.getByTestId('sliced-meta')).toContainText('0:32 h'); await expect(page.getByTestId('sliced-meta')).toContainText('7,4');
    await expect(page.getByTestId('gcode-canvas')).toBeVisible(); await expect(page.getByTestId('gcode-layer-readout')).toContainText('Capa 164 / 164', { timeout: 30000 });
    await page.getByTestId('gcode-layer-slider').fill('60'); await expect(page.getByTestId('gcode-layer-readout')).toContainText('Capa 61'); await page.waitForTimeout(400); await shot(page, '09-gcode-capas', { full: true });
    await page.getByTestId('gcode-layer-slider').fill('0'); await page.getByTestId('gcode-play').click(); await page.waitForTimeout(2500); await shot(page, '10-gcode-animacion');
    // 3MF laminado: lee tiempo y gramos sin laminar de nuevo
    await page.goto('/archivos'); await page.getByRole('link', { name: 'llavero-a1' }).first().click();
    await expect(page.getByTestId('sliced-meta')).toContainText('Bambu', { timeout: 40000 }); await expect(page.getByTestId('analysis')).toBeVisible(); await shot(page, '11-3mf-laminado', { full: true });
    saveAs('gcode-3mf-capas');
  });
});
