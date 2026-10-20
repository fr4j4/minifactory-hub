import { test, expect, login, shot } from './helpers';

test.describe('Perfiles por boquilla', () => {
  test('máquina con dos boquillas: plantillas 0,2, cambio de boquilla, copia personalizada y avisos', async ({ page, saveAs }) => {
    await login(page);
    // la guía explica para qué sirve cada perfil
    await page.goto('/laminador'); await page.waitForLoadState('networkidle'); await page.getByTestId('profiles-guide').locator('summary').click(); await expect(page.getByTestId('profiles-guide')).toContainText('Perfil de impresora (tipo de máquina)'); await shot(page, 'P01-guia-perfiles', { full: true });

    // plantillas de calidad para boquilla 0,2 (múltiplos de la boquilla)
    await page.getByTestId('new-profile-process').click(); await expect(page.getByTestId('template-form')).toBeVisible();
    await page.getByTestId('tpl-nozzle').getByTestId('nozzle-0.2').click();
    await expect(page.getByTestId('template-form')).toContainText('capa 0,06 mm'); await expect(page.getByTestId('template-form')).toContainText('capa 0,1 mm');
    await page.getByTestId('tpl-resistente').check(); await shot(page, 'P02-plantillas-boquilla-02');
    await page.getByTestId('tpl-create').click(); await expect(page.getByText(/4 calidades creadas para boquilla 0,2/)).toBeVisible();
    await page.goto('/laminador?nozzle=0.2'); await page.waitForLoadState('networkidle'); await expect(page.getByRole('link', { name: /0\.2 · Fino 0\.06/ })).toBeVisible(); await expect(page.getByRole('link', { name: 'A1 · 0,20 Standard' })).toHaveCount(0); await shot(page, 'P03-filtro-boquilla', { full: true });

    // editor de una calidad 0,4: paredes en múltiplos y aviso de capa fuera de rango
    await page.goto('/laminador'); await page.waitForLoadState('networkidle'); await page.getByRole('link', { name: 'A1 · 0,20 Standard', exact: true }).click();
    await expect(page.getByTestId('nozzle-helper')).toContainText('boquilla 0,4 mm'); await page.getByTestId('wall-1.2').click(); await expect(page.getByTestId('param-wall_loops')).toHaveValue('3');
    await page.getByTestId('param-layer_height').fill('0,4'); await expect(page.getByTestId('profile-warnings')).toContainText('demasiado alta'); await shot(page, 'P04-editor-paredes-multiplos', { full: true });

    // copia personalizada con nombre propio
    await page.goto('/laminador'); await page.waitForLoadState('networkidle'); await page.getByRole('row', { name: /A1 · 0,20 Standard/ }).first().getByTestId('profile-duplicate').click();
    await page.getByTestId('dup-name').fill('A1 · piezas con rosca'); await page.getByTestId('dup-edit').click(); await page.waitForURL(/\/laminador\/perfiles\//); await expect(page.getByTestId('profile-title')).toHaveValue('A1 · piezas con rosca');

    // el cambio de boquilla de la máquina cambia la impresora y la calidad
    await page.goto('/maquinas'); await page.waitForLoadState('networkidle'); await page.goto((await page.getByRole('link', { name: /Bambu A1 #1/ }).getAttribute('href'))!); await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('active-nozzle')).toContainText('0,4 mm'); await page.getByTestId('set-nozzle-0.6').click();
    await expect(page.getByText(/Boquilla 0,6 mm puesta/)).toBeVisible(); await expect(page.getByTestId('active-nozzle')).toContainText('0.30mm Standard'); await shot(page, 'P05-boquilla-puesta');

    // laminar: la lista de calidades pone primero las de la boquilla de la máquina y avisa si se elige otra
    await page.goto('/archivos'); await page.waitForLoadState('networkidle'); await page.goto((await page.getByRole('link', { name: 'Barquito decorativo' }).first().getAttribute('href'))!); await page.waitForLoadState('networkidle'); await page.goto((await page.getByRole('link', { name: 'Laminar y cotizar' }).getAttribute('href'))!);
    await page.getByTestId('slice-machine').selectOption({ label: 'Bambu A1 #1 · 0,6 mm' }); await expect(page.getByTestId('slice-nozzle')).toContainText('0.6');
    // con dos boquillas configuradas, cada una es una opción de máquina
    await expect(page.getByTestId('slice-machine').locator('option', { hasText: 'Bambu A1 #1 · 0,4 mm' })).toHaveCount(1);
    await page.getByTestId('slice-process').selectOption({ label: 'A1 · 0,20 Standard · Boquilla 0.4 mm' }); await expect(page.getByTestId('nozzle-mismatch')).toContainText('boquilla 0.4 mm'); await shot(page, 'P06-aviso-boquilla');
    // deja la máquina de demostración como estaba (las demás pruebas esperan la boquilla 0,4)
    await page.goto('/maquinas'); await page.waitForLoadState('networkidle'); await page.goto((await page.getByRole('link', { name: /Bambu A1 #1/ }).getAttribute('href'))!); await page.waitForLoadState('networkidle'); await page.getByTestId('set-nozzle-0.4').click(); await expect(page.getByText(/Boquilla 0,4 mm puesta/)).toBeVisible();
    // comparador: la misma máquina con sus dos boquillas lado a lado
    await page.goto('/laminador?tab=comparar'); await page.waitForLoadState('networkidle'); await expect(page.getByTestId('cmp-machine-0').locator('option', { hasText: 'Bambu A1 #1 · 0,6 mm' })).toHaveCount(1); await expect(page.getByTestId('cmp-machine-0').locator('option', { hasText: 'Bambu A1 #1 · 0,4 mm' })).toHaveCount(1);
    saveAs('perfiles-boquillas');
  });

  test('ficha de máquina: boquillas con un toque, tipos de material normalizados y serie único', async ({ page }) => {
    await login(page); await page.goto('/maquinas/nueva'); await page.waitForLoadState('networkidle'); await page.getByTestId('machine-name').fill('Ender 0,2'); 
    await page.getByTestId('machine-nozzles').getByTestId('nozzle-0.2').click(); await page.getByTestId('machine-nozzles').getByTestId('nozzle-other').fill('1,2'); await page.getByTestId('machine-nozzles').getByRole('button', { name: 'Agregar' }).click();
    await expect(page.getByTestId('machine-nozzles').getByTestId('nozzle-1.2')).toHaveAttribute('aria-pressed', 'true');
    await page.getByTestId('machine-materials').getByTestId('mat-other').fill(' petg-cf '); await page.getByTestId('machine-materials').getByRole('button', { name: 'Agregar' }).click(); await expect(page.getByTestId('mat-PETG-CF')).toHaveAttribute('aria-pressed', 'true');
    await page.getByLabel('N° de serie').fill('SN-DUP-1');
    await page.getByTestId('machine-save').click(); await page.waitForURL(/\/maquinas\/[0-9a-f-]{36}$/);
    await page.goto('/maquinas'); await page.waitForLoadState('networkidle'); await expect(page.getByRole('link', { name: /Ender 0,2/ })).toContainText('0,2 · 0,4 · 1,2');
    // otra máquina con el mismo serie: se rechaza
    await page.goto('/maquinas/nueva'); await page.waitForLoadState('networkidle'); await page.getByTestId('machine-name').fill('Ender copia'); await page.getByLabel('N° de serie').fill('sn-dup-1'); await page.getByTestId('machine-save').click();
    await expect(page.getByText(/ya lo tiene la máquina «Ender 0,2»/)).toBeVisible();
  });
});
