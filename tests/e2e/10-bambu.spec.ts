import { test, expect, login, shot, measure } from './helpers';
import type { Page } from '@playwright/test';

/** Conector Bambu Lab contra impresoras simuladas (scripts/bambu-sim.ts): P1S imprimiendo con AMS, A1 libre con bobina externa y aviso HMS, X1C sin cámara. */
async function connect(page: Page, name: string, code: string, ports: { mqtt: number; camera?: number; ftp: number }, machine?: string) {
  const card = page.getByTestId('found').locator('li', { hasText: name });
  await card.getByTestId('found-connect').click();
  await page.getByTestId('conn-code').fill(code);
  if (machine) await page.getByTestId('conn-machine').selectOption({ label: machine });
  await page.getByRole('button', { name: 'Puertos avanzados' }).click();
  await page.getByTestId('conn-mqtt').fill(String(ports.mqtt)); if (ports.camera) await page.getByTestId('conn-camera').fill(String(ports.camera)); await page.getByTestId('conn-ftp').fill(String(ports.ftp));
}

test.describe('Conector Bambu Lab', () => {
  test('detecta, conecta, muestra en vivo y controla una P1S', async ({ page, saveAs }) => {
    await login(page);
    await page.goto('/maquinas'); await page.getByTestId('connectors').click(); await page.waitForURL('**/maquinas/conectores');
    await shot(page, 'B01-conectores');
    await measure('Detectar y conectar una impresora Bambu Lab', { limitS: 60, note: 'búsqueda de 6 s + prueba de conexión' }, async () => {
      await page.getByTestId('scan').click();
      await expect(page.getByTestId('found').locator('li')).toHaveCount(3, { timeout: 20_000 });
      await shot(page, 'B02-detectadas');
      // código equivocado: mensaje claro y no se guarda nada
      await connect(page, 'P1S Taller', '11111111', { mqtt: 18883, camera: 18600, ftp: 18990 });
      await page.getByTestId('conn-go').click();
      await expect(page.getByText(/Código de acceso incorrecto/).first()).toBeVisible({ timeout: 20_000 });
      await shot(page, 'B03-codigo-incorrecto');
      await page.getByTestId('conn-code').fill('12345678'); await page.getByTestId('conn-name').fill('P1S Taller');
      await page.getByTestId('conn-go').click();
      await page.waitForURL(/\/maquinas\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    });
    const panel = page.getByTestId('printer-panel');
    await expect(panel.getByTestId('printer-state')).toHaveText('Imprimiendo', { timeout: 20_000 });
    await expect(panel.getByTestId('printer-task')).toContainText('Barquito_decorativo_x4');
    await expect(panel.getByTestId('ams-tray')).toHaveCount(4);
    await expect(panel.getByTestId('ams-tray').nth(0)).toContainText('en uso');
    await expect(panel.getByTestId('ams-tray').nth(3)).toContainText('Vacía');
    // la cámara entrega imagen
    await expect.poll(() => panel.locator('[data-testid=camera] img').evaluate((i: HTMLImageElement) => i.naturalWidth), { timeout: 20_000 }).toBeGreaterThan(100);
    // el avance sube solo (SSE)
    const p0 = Number(await panel.getByTestId('printer-progress').innerText().then((t) => t.replace('%', '')));
    await expect.poll(async () => Number((await panel.getByTestId('printer-progress').innerText()).replace('%', '')), { timeout: 15_000 }).toBeGreaterThan(p0);
    await shot(page, 'B04-panel-en-vivo', { full: true });
    // asociar la bobina del inventario a la bandeja 1 del AMS
    await panel.getByTestId('tray-spool').first().selectOption({ index: 1 });
    await expect(page.getByText('Bobina asociada a la bandeja')).toBeVisible();
    // controles
    await panel.getByTestId('cmd-pause').click(); await expect(panel.getByTestId('printer-state')).toHaveText('En pausa', { timeout: 10_000 });
    await shot(page, 'B05-en-pausa');
    await panel.getByTestId('cmd-resume').click(); await expect(panel.getByTestId('printer-state')).toHaveText('Imprimiendo', { timeout: 10_000 });
    await panel.getByTestId('cmd-speed').selectOption('3'); await expect(panel.getByTestId('cmd-speed')).toHaveValue('3', { timeout: 10_000 });
    await panel.getByTestId('cmd-light').click(); await expect(panel.getByTestId('cmd-light')).toContainText('apagada', { timeout: 10_000 });
    // video en vivo
    await panel.getByTestId('cam-vivo').click(); await page.waitForTimeout(2500);
    await expect.poll(() => panel.locator('[data-testid=camera] img').evaluate((i: HTMLImageElement) => i.naturalWidth), { timeout: 15_000 }).toBeGreaterThan(100);
    await panel.scrollIntoViewIfNeeded(); await shot(page, 'B06-camara-en-vivo');
    // el inicio y la cola muestran el avance real
    await page.goto('/'); await expect(page.getByRole('region', { name: 'Taller en vivo' }).getByTestId('printer-pill').first()).toContainText('capa', { timeout: 15_000 }); await shot(page, 'B07-inicio-en-vivo');
    await page.goto('/cola'); await expect(page.getByTestId('printer-pill').first()).toBeVisible(); await shot(page, 'B08-cola-en-vivo');
    saveAs('bambu-conectar-y-ver');
  });

  test('envía un laminado a la A1 y protege contra el modelo equivocado', async ({ page, saveAs }) => {
    await login(page);
    // laminar el barquito para la A1 (perfil de la máquina «Bambu A1 #1»)
    await page.goto('/archivos'); await page.waitForLoadState('networkidle'); await page.getByRole('link', { name: 'Barquito decorativo' }).first().click(); await page.waitForURL(/\/archivos\/[0-9a-f-]{36}/); await page.waitForLoadState('networkidle'); await page.getByRole('link', { name: 'Laminar y cotizar' }).click();
    await page.getByTestId('slice-machine').selectOption({ label: 'Bambu A1 #1' }); await page.getByTestId('slice-material').selectOption({ index: 0 });
    await page.getByTestId('slice-go').click(); await expect(page.getByTestId('slice-result')).toBeVisible({ timeout: 90_000 });
    // conectar la A1 simulada a la máquina que ya existe en el taller
    await page.goto('/maquinas/conectores'); await page.getByTestId('scan').click(); await expect(page.getByTestId('found').locator('li')).toHaveCount(3, { timeout: 20_000 });
    await connect(page, 'A1 Mesa', '87654321', { mqtt: 19883, camera: 19600, ftp: 19990 }, 'Bambu A1 #1');
    await page.getByTestId('conn-go').click(); await page.waitForURL(/\/maquinas\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const panel = page.getByTestId('printer-panel');
    await expect(panel.getByTestId('printer-state')).toHaveText('Libre', { timeout: 20_000 });
    await expect(panel.getByTestId('printer-hms')).toContainText('0700_2000_0002_0001');
    await expect(panel.getByTestId('ams-tray')).toHaveCount(1); await expect(panel.getByTestId('ams-tray')).toContainText('Externa');
    await shot(page, 'B09-a1-libre-hms', { full: true });
    await measure('Enviar un laminado a la impresora', { limitS: 30 }, async () => {
      await panel.getByTestId('send-open').click(); await shot(page, 'B10-enviar-dialogo');
      await page.getByTestId('send-confirm').click();
      await expect(page.getByText(/Archivo enviado/)).toBeVisible({ timeout: 30_000 });
      await expect(panel.getByTestId('printer-state')).toHaveText(/Preparando|Imprimiendo/, { timeout: 15_000 });
    });
    await expect(panel.getByTestId('printer-state')).toHaveText('Imprimiendo', { timeout: 15_000 });
    await expect(panel.getByTestId('printer-task')).toContainText('MF_');
    await shot(page, 'B11-a1-imprimiendo', { full: true });
    // aviso: empezó a imprimir fuera de la cola
    await page.goto('/notificaciones'); await expect(page.getByText(/empezó a imprimir/).first()).toBeVisible(); await shot(page, 'B12-avisos');
    // protección: el laminado de la A1 no se puede mandar a la P1S
    // la P1S quedó conectada en la prueba anterior; si se corre sola, se conecta aquí
    await page.goto('/maquinas/conectores');
    const linked = page.getByTestId('linked-printer').filter({ hasText: 'P1S Taller' });
    if (await linked.count()) await linked.getByRole('link').first().click();
    else { await page.getByTestId('scan').click(); await expect(page.getByTestId('found').locator('li')).toHaveCount(3, { timeout: 20_000 }); await connect(page, 'P1S Taller', '12345678', { mqtt: 18883, camera: 18600, ftp: 18990 }); await page.getByTestId('conn-go').click(); }
    await page.waitForURL(/\/maquinas\/[0-9a-f-]{36}$/, { timeout: 30_000 });
        // la P1S de demostración imprime en bucle: se espera a que esté imprimiendo para detenerla
    await expect(panel.getByTestId('printer-state')).toHaveText('Imprimiendo', { timeout: 30_000 });
    await panel.getByRole('button', { name: '■ Detener' }).click(); await page.getByRole('button', { name: 'Confirmar' }).click();
    await expect(panel.getByTestId('printer-state')).toHaveText('Falló', { timeout: 10_000 });
    await panel.getByTestId('send-open').click(); await page.getByTestId('send-confirm').click();
    await expect(page.getByText(/se laminó para «Bambu Lab A1» y la impresora es «Bambu Lab P1S»/)).toBeVisible({ timeout: 20_000 });
    await shot(page, 'B13-proteccion-modelo');
    saveAs('bambu-enviar-a-imprimir');
  });

  test.describe('en el celular', () => {
    test.beforeEach(({}, info) => { info.annotations.push({ type: 'mobile', description: '390x844' }); });
    test('panel de la impresora en 390 px', async ({ page }) => {
      await login(page);
      await page.goto('/maquinas/conectores'); await expect(page.getByTestId('linked-printer').first()).toBeVisible(); await shot(page, 'B14-movil-conectores');
      await page.getByTestId('linked-printer').first().getByRole('link').first().click();
      await expect(page.getByTestId('printer-panel')).toBeVisible(); await page.waitForTimeout(2500); await shot(page, 'B15-movil-panel', { full: true });
      const over = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, window.innerWidth) - 390); expect(over).toBeLessThanOrEqual(1);
    });
  });
});
