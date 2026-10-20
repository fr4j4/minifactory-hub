import AxeBuilder from '@axe-core/playwright';
import { test, expect, login } from './helpers';

const PAGES = ['/', '/pedidos', '/pedidos/nuevo', '/presupuestos', '/presupuestos/nuevo', '/calculadora', '/clientes', '/archivos', '/laminador', '/catalogo', '/ventas', '/ventas/nueva', '/inventario', '/inventario/alta-rapida', '/maquinas', '/cola', '/galeria', '/reportes', '/notificaciones', '/configuracion', '/configuracion?tab=documentos', '/configuracion?tab=proveedores', '/configuracion?tab=sistema', '/configuracion/perfil'];

/** Regresión estructural (WP-6.3): en tres anchos y en claro/oscuro, ninguna pantalla desborda en horizontal, tiene errores graves de accesibilidad ni se rompe. */
test('pantallas principales: sin desborde horizontal, sin errores y sin violaciones graves (360 / 768 / 1280)', async ({ page }) => {
  test.setTimeout(600_000);
  await login(page, 'admin');
  const bad: string[] = [];
  for (const width of [360, 768, 1280]) {
    await page.setViewportSize({ width, height: 800 });
    for (const scheme of ['light', 'dark'] as const) {
      await page.emulateMedia({ colorScheme: scheme });
      for (const p of PAGES) {
        if (scheme === 'dark' && width !== 360) continue; // el oscuro se revisa en el ancho más exigente
        const res = await page.goto(p); await page.waitForLoadState('networkidle');
        const tag = `${width}px ${scheme} ${p}`;
        if (!res || res.status() >= 400) { bad.push(`${tag}: HTTP ${res?.status()}`); continue; }
        if (await page.getByText(/Algo salió mal|Something went wrong/).count()) { bad.push(`${tag}: pantalla de error`); continue; }
        if (await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)) bad.push(`${tag}: desborde horizontal`);
        const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
        for (const v of r.violations.filter((x) => x.impact === 'serious' || x.impact === 'critical')) bad.push(`${tag}: ${v.id} (${v.nodes.length})`);
      }
    }
  }
  expect(bad).toEqual([]);
});
