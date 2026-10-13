import fs from 'node:fs';
import path from 'node:path';
import AxeBuilder from '@axe-core/playwright';
import { test, expect, login, DATA } from './helpers';

const PAGES = ['/', '/pedidos', '/pedidos/nuevo', '/presupuestos', '/presupuestos/nuevo', '/calculadora', '/clientes', '/archivos', '/laminador', '/catalogo', '/ventas/nueva', '/inventario', '/maquinas', '/cola', '/galeria', '/reportes', '/configuracion?tab=tarifas'];

test('accesibilidad (axe): sin violaciones graves ni críticas en las pantallas principales', async ({ page }) => {
  await login(page);
  const out: Array<{ page: string; serious: number; items: Array<{ id: string; impact: string; nodes: number }> }> = [];
  for (const p of PAGES) {
    await page.goto(p); await page.waitForLoadState('networkidle');
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    const bad = r.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
    out.push({ page: p, serious: bad.length, items: r.violations.map((v) => ({ id: v.id, impact: String(v.impact), nodes: v.nodes.length })) });
  }
  fs.mkdirSync(DATA, { recursive: true }); fs.writeFileSync(path.join(DATA, 'a11y.json'), JSON.stringify(out, null, 1));
  expect(out.filter((o) => o.serious > 0).map((o) => `${o.page}: ${o.items.filter((i) => ['serious', 'critical'].includes(i.impact)).map((i) => i.id).join(',')}`)).toEqual([]);
});
