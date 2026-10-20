import AxeBuilder from '@axe-core/playwright';
import { test, expect, login } from './helpers';

const PALETTES = ['capa', 'grafito', 'oceano', 'bosque', 'violeta', 'contraste'] as const;

test.describe('Paletas y tema (R6 / N9b)', () => {
  test('elige paleta y modo desde el menú; se recuerda en el navegador y se aplica antes del primer pintado', async ({ page }) => {
    await login(page, 'admin');
    await page.getByRole('button', { name: /Cuenta|Account/ }).or(page.locator('summary[aria-label]').last()).click();
    await page.getByTestId('palette-oceano').click(); await page.getByTestId('theme-dark').click();
    await expect(page.locator('html')).toHaveAttribute('data-palette', 'oceano'); await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    // sin parpadeo: el atributo ya está al terminar de parsear el documento, antes de hidratar
    await page.reload({ waitUntil: 'commit' });
    await page.waitForFunction(() => document.documentElement.getAttribute('data-palette') === 'oceano' && document.documentElement.getAttribute('data-theme') === 'dark');
    // el fondo realmente cambió (variable CSS del tema oscuro de Océano)
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(11, 22, 32)');
    // volver a la paleta del taller
    await page.getByRole('button', { name: /Cuenta|Account/ }).or(page.locator('summary[aria-label]').last()).click();
    await page.getByTestId('palette-shop').click(); await page.getByTestId('theme-system').click();
    await expect(page.locator('html')).not.toHaveAttribute('data-palette', /.+/); await expect(page.locator('html')).not.toHaveAttribute('data-theme', /.+/);
  });

  test('matriz: cada paleta en claro y oscuro, sin violaciones graves de contraste ni scroll horizontal (360 y 1280 px)', async ({ page }) => {
    test.setTimeout(900_000); // 2 anchos x 12 combinaciones x 5 rutas con axe
    await login(page, 'admin');
    const bad: string[] = [];
    for (const width of [360, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      for (const pal of PALETTES) for (const theme of ['light', 'dark'] as const) {
        await page.addInitScript(([p, m]) => { localStorage.setItem('mf_palette', p); localStorage.setItem('mf_theme', m); }, [pal, theme]);
        for (const path of ['/', '/archivos', '/pedidos', '/cola', '/maquinas']) {
          await page.goto(path); await page.waitForLoadState('networkidle');
          const r = await new AxeBuilder({ page }).withTags(['wcag2aa']).options({ runOnly: ['color-contrast'] }).analyze();
          if (r.violations.length) bad.push(`${width}px ${pal}/${theme} ${path}: ${r.violations[0].nodes.length} nodos`);
          const over = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
          if (over) bad.push(`${width}px ${pal}/${theme} ${path}: scroll horizontal`);
        }
      }
    }
    expect(bad).toEqual([]);
  });
});
