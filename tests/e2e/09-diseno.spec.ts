import { test, expect, shot } from './helpers';

test.describe('Diseño «capa a capa»', () => {
  test('recorrido: ingreso animado, taller en vivo, menú Nuevo, cola y visor (claro y oscuro)', async ({ page, saveAs }) => {
    await page.goto('/login'); await page.waitForTimeout(4200); await shot(page, '90-diseno-login');
    await page.getByLabel('Correo').fill('admin@minifactory.cl'); await page.getByLabel('Contraseña').fill('admin1234'); await page.getByRole('button', { name: 'Ingresar' }).click(); await page.waitForURL('**/');
    await expect(page.getByRole('region', { name: 'Taller en vivo' })).toBeVisible(); await page.waitForTimeout(600); await shot(page, '91-diseno-inicio');
    await page.getByRole('button', { name: 'Nuevo' }).click(); await page.waitForTimeout(500); await shot(page, '92-diseno-menu-nuevo'); await page.keyboard.press('Escape');
    await page.keyboard.press('Control+k'); await page.keyboard.type('barq'); await page.waitForTimeout(900); await shot(page, '93-diseno-busqueda'); await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Cola' }).first().click(); await page.waitForURL('**/cola'); await page.waitForTimeout(700); await shot(page, '94-diseno-cola');
    await page.getByRole('link', { name: 'Archivos 3D' }).first().click(); await page.getByRole('link', { name: 'Barquito decorativo' }).first().click(); await page.waitForTimeout(2200); await shot(page, '95-diseno-visor');
    await page.emulateMedia({ colorScheme: 'dark' }); await page.waitForTimeout(400); await page.reload(); await page.waitForTimeout(2200); await shot(page, '96-diseno-visor-oscuro');
    await page.goto('/'); await page.waitForTimeout(800); await shot(page, '97-diseno-inicio-oscuro');
    await page.goto('/pedidos'); await page.waitForTimeout(800); await shot(page, '98-diseno-pedidos-oscuro');
    saveAs('rediseno-recorrido');
  });
});
test.describe('Diseño en el celular', () => {
  test.beforeEach(({}, info) => { info.annotations.push({ type: 'mobile', description: '390x844' }); });
  test('barra inferior y acciones rápidas', async ({ page }) => {
    await page.goto('/login'); await page.getByLabel('Correo').fill('admin@minifactory.cl'); await page.getByLabel('Contraseña').fill('admin1234'); await page.getByRole('button', { name: 'Ingresar' }).click(); await page.waitForURL('**/');
    await page.waitForTimeout(700); await shot(page, '99a-diseno-movil-inicio');
    await page.getByRole('button', { name: 'Acciones rápidas' }).click(); await page.waitForTimeout(500); await shot(page, '99b-diseno-movil-acciones');
  });
});
