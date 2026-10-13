import type { Page } from '@playwright/test';
import { test, expect, login, shot } from './helpers';

/** Abre «¿Por qué este precio?» (es un <details>: si ya está abierto, un clic lo cerraría). */
async function openWhy(page: Page) { const w = page.getByTestId('why-price'); if ((await w.getAttribute('open')) === null) await w.locator('summary').click(); }

test.describe('Calculadora v2', () => {
  test('calculadora rápida: niveles, IVA opcional, explicación y estimación sin archivo', async ({ page }) => {
    await login(page);
    await page.goto('/calculadora');
    // el primer uso muestra la guía; se puede cerrar
    await expect(page.getByTestId('calc-guide')).toBeVisible();
    await page.getByRole('button', { name: 'Cerrar' }).click();
    await expect(page.getByTestId('level-basico')).toHaveAttribute('aria-checked', 'true');
    // Básico: sin máquina ni perfil visibles
    await expect(page.getByTestId('line-machine')).toHaveCount(0);
    await page.getByTestId('line-desc').fill('Soporte de cámara');
    await page.getByTestId('mode-manual').click();
    await page.getByTestId('manual-grams').fill('50'); await page.getByTestId('manual-hours').fill('4');
    await expect(page.getByTestId('quick-total')).toContainText('$');
    const net = await page.getByTestId('quick-total').innerText();
    // «¿Por qué este precio?» existe en todos los niveles
    await openWhy(page);
    await expect(page.getByTestId('why-sentence')).toContainText(/margen|mínimo|material/i);
    await shot(page, 'C20-calculadora-basico');
    // el IVA es opcional y no cambia el precio neto
    await page.getByTestId('apply-tax').first().check();
    await expect(page.getByTestId('quick-net')).toContainText('IVA');
    expect(await page.getByTestId('quick-total').innerText()).not.toBe(net);
    await page.getByTestId('apply-tax').first().uncheck();
    expect(await page.getByTestId('quick-total').innerText()).toBe(net);
    // Detallado: aparecen máquina, perfil, banda y desglose
    await page.getByTestId('level-detallado').click();
    await expect(page.getByTestId('line-machine')).toBeVisible(); await expect(page.getByTestId('line-profile')).toBeVisible(); await expect(page.getByTestId('price-band')).toBeVisible();
    await openWhy(page);
    await expect(page.getByTestId('why-table')).toBeVisible();
    // cambiar de perfil cambia el precio y muestra la diferencia
    await page.getByTestId('line-profile').selectOption('func');
    await expect(page.getByTestId('profile-diff')).toContainText('Funcional');
    expect(await page.getByTestId('quick-total').innerText()).not.toBe(net);
    await page.getByTestId('line-profile').selectOption('');
    await shot(page, 'C21-calculadora-detallado', { full: true });
    // Experto: tabla por cantidades, sensibilidad, precio inverso y escenarios
    await page.getByTestId('level-experto').click();
    await expect(page.getByTestId('qty-table')).toBeVisible(); await expect(page.getByTestId('sens-list')).toBeVisible(); await expect(page.getByTestId('scenarios')).toBeVisible();
    await page.getByTestId('inverse-input').fill('1000');
    await expect(page.getByTestId('inverse-result')).toContainText(/costo|margen/i);
    await openWhy(page);
    await expect(page.getByTestId('why-formula')).toBeVisible();
    await shot(page, 'C22-calculadora-experto', { full: true });
    await page.getByTestId('level-basico').click();
    // «No sé»: estimar con medidas da un precio con rango
    await page.getByTestId('mode-estimate').click();
    await page.getByTestId('est-l').fill('100'); await page.getByTestId('est-w').fill('60'); await page.getByTestId('est-h').fill('40');
    await page.getByTestId('est-apply').click();
    await expect(page.getByTestId('line-range')).toContainText('Entre');
    await expect(page.getByTestId('line-origin')).toContainText(/estimad/i);
    await shot(page, 'C23-calculadora-estimar');
    // guarda en el historial y lo reabre
    await page.getByTestId('calc-save-history').click();
    await expect(page.getByTestId('calc-history')).toBeVisible();
  });

  test('configuración: modo Estándar y Avanzado, vista previa, asistente y guardado', async ({ page }) => {
    await login(page);
    await page.goto('/configuracion?tab=tarifas');
    await expect(page.getByTestId('cfg-standard')).toBeVisible();
    await shot(page, 'C24-config-estandar', { full: true });
    const before = await page.getByTestId('prev-medium').innerText();
    await page.getByTestId('cfg-margin').fill('55');
    await expect(page.getByTestId('cfg-margin-value')).toContainText('55');
    await expect(page.getByTestId('prev-medium')).not.toHaveText(before);
    await expect(page.getByTestId('preview-breakeven')).toContainText('equilibrio');
    // Avanzado
    await page.getByTestId('cfg-mode-avanzado').click();
    await expect(page.getByTestId('cfg-advanced')).toBeVisible();
    await page.getByTestId('cfg-tab-fixed').click();
    await page.getByTestId('fixed-add').click();
    await page.getByTestId('fixed-amount-2').fill('50000');
    await expect(page.getByTestId('breakeven')).toContainText('equilibrio');
    await page.getByTestId('cfg-tab-profiles').click();
    await expect(page.getByTestId('profiles-manager')).toBeVisible();
    await page.getByTestId('profile-new').click();
    await page.getByTestId('profile-name').fill('Mi perfil de ferias');
    await page.getByTestId('cfg-tab-refs').click();
    await page.getByTestId('bm-add').click();
    await shot(page, 'C25-config-avanzado', { full: true });
    await page.getByTestId('rates-save').click();
    await expect(page.getByText('Tarifas guardadas')).toBeVisible();
    // el historial registra el cambio y permite restaurar
    await page.getByTestId('cfg-tab-history').click();
    await expect(page.getByTestId('rates-history')).toBeVisible();
    // asistente de puesta en marcha
    await page.getByTestId('open-wizard').click();
    await expect(page.getByTestId('calc-wizard')).toBeVisible();
    for (let i = 0; i < 5; i++) await page.getByTestId('wiz-next').click();
    await expect(page.getByTestId('wiz-summary')).toContainText('debe rendir al menos');
    await shot(page, 'C26-asistente');
    await page.getByTestId('wiz-finish').click();
    await expect(page.getByText('Calculadora configurada')).toBeVisible();
  });

  test('presupuesto: casilla de IVA, perfil y totales en neto', async ({ page }) => {
    await login(page);
    await page.goto('/presupuestos/nuevo');
    await page.getByTestId('add-line').click();
    const l = page.getByTestId('quote-line').first();
    await l.getByTestId('line-desc').fill('Pieza con IVA opcional');
    await l.getByTestId('mode-manual').click();
    await l.getByTestId('manual-grams').fill('40'); await l.getByTestId('manual-hours').fill('3');
    await expect(page.getByTestId('apply-tax')).not.toBeChecked();
    const neto = await page.getByTestId('sum-total').innerText();
    await page.getByTestId('apply-tax').check();
    await expect(page.getByTestId('sum-tax')).toContainText('$');
    expect(await page.getByTestId('sum-total').innerText()).not.toBe(neto);
    await expect(page.getByTestId('sum-net')).toContainText(neto.replace(/\s/g, ' ').trim().slice(0, 4));
    await page.getByTestId('quote-profile').selectOption('mayor');
    await shot(page, 'C27-presupuesto-iva');
  });
});
