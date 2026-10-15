import { test, expect, login, shot, touchDrag, touchPinch } from './helpers';

test.describe('Uso en el celular (390×844)', () => {
  test.beforeEach(({}, info) => { info.annotations.push({ type: 'mobile', description: '390x844' }); });

  test('navegación inferior, sin scroll horizontal y objetivos táctiles', async ({ page }) => {
    await login(page);
    for (const [path, name] of [['/', '71-movil-inicio'], ['/pedidos/nuevo', '72-movil-pedido-nuevo'], ['/cola', '73-movil-cola'], ['/inventario', '74-movil-inventario'], ['/catalogo', '75-movil-catalogo']] as const) {
      await page.goto(path); await page.waitForLoadState('networkidle'); await shot(page, name);
      // en móvil el navegador ensancha la ventana para mostrar lo que desborda: se compara contra los 390 px reales
      const over = await page.evaluate(() => Math.max(document.documentElement.scrollWidth, window.innerWidth) - 390);
      expect(over, `scroll horizontal en ${path}`).toBeLessThanOrEqual(1);
    }
    await page.goto('/');
    const small = await page.evaluate(() => [...document.querySelectorAll('nav a, nav button, header button, header a')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && (r.height < 40 || r.width < 40); }).map((e) => (e.textContent || e.getAttribute('aria-label') || '').trim().slice(0, 20)));
    expect(small, 'controles de navegación menores a 40 px').toEqual([]);
  });

  test('visor 3D: girar con un dedo y acercar con pellizco', async ({ page, saveAs }) => {
    await login(page);
    await page.goto('/archivos'); await page.waitForLoadState('networkidle'); await page.getByRole('link', { name: 'Barquito decorativo' }).first().click(); await page.waitForURL(/\/archivos\/[0-9a-f-]{36}/); await page.waitForLoadState('networkidle');
    const host = page.getByTestId('viewer-host'); await expect(host).toBeVisible(); await page.waitForTimeout(1500);
    const b = (await host.boundingBox())!; const c: [number, number] = [b.x + b.width / 2, b.y + b.height / 2];
    await shot(page, '76-movil-visor-inicial');
    await touchDrag(page, [c[0] - 80, c[1]], [c[0] + 80, c[1] - 30]); await page.waitForTimeout(400); await shot(page, '77-movil-visor-girado');
    await touchPinch(page, c, 60, 180); await page.waitForTimeout(400); await shot(page, '78-movil-visor-zoom');
    saveAs('movil-visor-tactil');
  });
});
