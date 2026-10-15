import { test, expect, type Page } from '@playwright/test';

const SCREENS: Array<[string, string]> = [
  ['inicio', '/'], ['pedidos', '/pedidos'], ['presupuestos', '/presupuestos'], ['clientes', '/clientes'], ['calculadora', '/calculadora'],
  ['archivos', '/archivos'], ['laminador', '/laminador'], ['cola', '/cola'], ['maquinas', '/maquinas'], ['inventario', '/inventario'], ['catalogo', '/catalogo'],
  ['ventas', '/ventas'], ['reportes', '/reportes'], ['configuracion', '/configuracion'], ['calidades', '/configuracion?tab=calidades'],
];

async function login(page: Page) {
  await page.goto('/login'); await page.getByLabel('Correo').fill('admin@minifactory.cl'); await page.getByLabel('Contraseña').fill('admin1234'); await page.getByRole('button', { name: 'Ingresar' }).click(); await page.waitForURL('**/', { timeout: 30_000 });
}
/** Lo que cambia entre corridas (fechas, horas, cifras de uso reciente) se tapa para no dar falsas alarmas. */
const mask = (page: Page) => [page.locator('time'), page.locator('[data-testid="kpis"]'), page.locator('.num'), page.locator('.tabular')];

test.describe('regresión visual', () => {
  test.beforeEach(async ({ page }) => { await login(page); });
  for (const [name, url] of SCREENS) {
    test(`pantalla ${name}`, async ({ page }) => {
      await page.goto(url); await page.waitForLoadState('networkidle'); await page.addStyleTag({ content: '*{caret-color:transparent!important} ::-webkit-scrollbar{display:none}' });
      await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: false, mask: mask(page) });
    });
  }
  test('pantalla inicio en oscuro y en celular', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' }); await page.goto('/'); await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('inicio-oscuro.png', { mask: mask(page) });
    await page.setViewportSize({ width: 390, height: 844 }); await page.emulateMedia({ colorScheme: 'light' }); await page.goto('/'); await page.waitForLoadState('networkidle');
    await expect(page).toHaveScreenshot('inicio-celular.png', { mask: mask(page) });
  });
});
