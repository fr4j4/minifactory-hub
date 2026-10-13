import { test, expect, login, shot, measure } from './helpers';
import type { Page } from '@playwright/test';

/** Modo nube contra la nube simulada (scripts/bambu-cloud-sim.ts): cuenta taller@minifactory.cl con código por correo. */
async function cloudLogin(page: Page, scope = page.getByTestId('cloud-section')) {
  await scope.getByTestId('cloud-email').fill('taller@minifactory.cl'); await scope.getByTestId('cloud-password').fill('bambu1234');
  await scope.getByTestId('cloud-login').click();
  await expect(page.getByTestId('cloud-code-form')).toBeVisible({ timeout: 20_000 });
}
const deviceRow = (page: Page, name: string) => page.getByTestId('cloud-device').filter({ hasText: name });

test.describe('Bambu Cloud', () => {
  test('inicia sesión con código por correo y agrega una impresora en modo nube', async ({ page, saveAs }) => {
    await login(page); await page.goto('/maquinas/conectores');
    await expect(page.getByTestId('cloud-login-form')).toBeVisible(); await shot(page, 'C01-nube-login');
    await measure('Iniciar sesión en Bambu Cloud y agregar una impresora', { limitS: 90 }, async () => {
      await cloudLogin(page); await shot(page, 'C02-nube-codigo');
      await page.getByTestId('cloud-code').fill('111111'); await page.getByTestId('cloud-verify').click();
      await expect(page.getByText('Código incorrecto.').first()).toBeVisible();
      await page.getByTestId('cloud-code').fill('246810'); await page.getByTestId('cloud-verify').click();
      await expect(page.getByTestId('cloud-account')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('cloud-devices').click();
      await expect(page.getByTestId('cloud-device')).toHaveCount(4, { timeout: 20_000 });
      await shot(page, 'C03-nube-impresoras');
      await deviceRow(page, 'P1P Bodega').getByTestId('cloud-add').click(); await shot(page, 'C04-nube-agregar');
      await page.getByTestId('cloud-add-confirm').click(); await page.waitForURL(/\/maquinas\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    });
    const panel = page.getByTestId('printer-panel');
    await expect(panel.getByTestId('mode-cloud')).toBeVisible();
    await expect(panel.getByTestId('printer-state')).toHaveText('Imprimiendo', { timeout: 25_000 });
    await expect(panel.getByTestId('printer-task')).toContainText('Soporte_camara');
    await expect(panel.getByTestId('ams-tray')).toContainText('PETG');
    await expect(panel.getByTestId('cmd-pause')).toHaveCount(0); await expect(panel.getByTestId('send-open')).toHaveCount(0);
    await expect(panel.getByTestId('cloud-readonly')).toBeVisible();
    // la ficha de la máquina se alinea con lo que informa la impresora
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Imprimiendo', { timeout: 15_000 });
    await expect.poll(() => panel.locator('[data-testid=camera] img').evaluate((i: HTMLImageElement) => i.naturalWidth), { timeout: 20_000 }).toBeGreaterThan(100);
    await expect(panel.getByTestId('cloud-cover-note')).toBeVisible();
    await shot(page, 'C05-nube-panel', { full: true });
    await page.goto('/'); await expect(page.getByRole('region', { name: 'Taller en vivo' })).toContainText('P1P Bodega'); await shot(page, 'C06-nube-inicio');
    saveAs('bambu-nube-agregar');
  });

  test('conecta por LAN con el código que entrega la nube', async ({ page, saveAs }) => {
    await login(page); await page.goto('/maquinas/conectores');
    await page.getByTestId('scan').click(); await expect(page.getByTestId('found').locator('li')).toHaveCount(3, { timeout: 20_000 });
    await page.getByTestId('cloud-devices').click(); await expect(page.getByTestId('cloud-device')).toHaveCount(4, { timeout: 20_000 });
    await expect(deviceRow(page, 'X1C Oficina')).toContainText('en tu red (127.0.0.1)');
    await deviceRow(page, 'X1C Oficina').getByTestId('cloud-lan').click();
    await expect(page.getByTestId('cloud-lan-note')).toBeVisible(); await expect(page.getByTestId('conn-code')).toHaveCount(0);
    await page.getByRole('button', { name: 'Puertos avanzados' }).click(); await page.getByTestId('conn-mqtt').fill('20883'); await page.getByTestId('conn-ftp').fill('20990');
    await shot(page, 'C07-lan-desde-nube');
    await page.getByTestId('conn-go').click(); await page.waitForURL(/\/maquinas\/[0-9a-f-]{36}$/, { timeout: 30_000 });
    const panel = page.getByTestId('printer-panel');
    await expect(panel.getByTestId('printer-state')).toHaveText('Libre', { timeout: 20_000 }); await expect(panel.getByTestId('mode-cloud')).toHaveCount(0);
    await shot(page, 'C08-x1c-por-lan');
    saveAs('bambu-lan-desde-nube');
  });

  test('si el token expira avisa y se vuelve a iniciar sesión', async ({ page, request }) => {
    await login(page);
    await request.post('http://127.0.0.1:18080/__sim/expire');
    await expect.poll(async () => { await page.goto('/notificaciones'); return page.getByText('Bambu Cloud: vuelve a iniciar sesión').count(); }, { timeout: 60_000, intervals: [3000] }).toBeGreaterThan(0);
    await shot(page, 'C09-nube-expirada-aviso');
    await page.goto('/maquinas/conectores'); await expect(page.getByTestId('cloud-status')).toHaveText('Sesión expirada'); await shot(page, 'C10-nube-expirada');
    await page.getByTestId('cloud-relogin').click(); const dlg = page.getByRole('dialog');
    await dlg.getByTestId('cloud-password').fill('bambu1234'); await dlg.getByTestId('cloud-login').click();
    await page.getByTestId('cloud-code').fill('246810'); await page.getByTestId('cloud-verify').click();
    await expect(page.getByTestId('cloud-status')).toHaveText(/Activa|Conectada/, { timeout: 20_000 });
    await page.getByTestId('linked-printer').filter({ hasText: 'P1P Bodega' }).getByRole('link').first().click();
    await expect(page.getByTestId('printer-panel').getByTestId('printer-state')).toHaveText(/Imprimiendo|Terminada/, { timeout: 25_000 });
  });
});
