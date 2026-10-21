import { test, expect, login, shot } from './helpers';

test.describe('Selector de filamento', () => {
  test('busca, filtra por tipo y color, y elige en una línea de presupuesto', async ({ page }) => {
    await login(page);
    await page.goto('/presupuestos/nuevo');
    await page.getByTestId('add-line').click();
    const l1 = page.getByTestId('quote-line').first();
    await l1.getByTestId('line-material').click();
    const dlg = page.getByRole('dialog');
    await expect(dlg.getByTestId('picker-search')).toBeFocused();
    await dlg.getByRole('button', { name: 'PETG', exact: true }).click();
    await expect(dlg.locator('[data-material-id]').first()).toContainText('PETG');
    await dlg.getByLabel('rojo').click(); // familia sin coincidencias en PETG
    await expect(dlg.getByText('No hay filamentos con ese filtro')).toBeVisible();
    await dlg.getByLabel('rojo').click();
    await dlg.getByTestId('picker-search').fill('esun transparente');
    await shot(page, '60-selector-filamento');
    await dlg.locator('[data-material-id]').first().click();
    await expect(dlg).toBeHidden();
    await expect(l1.getByTestId('line-material')).toContainText('eSun');
    await expect(l1.getByTestId('line-color')).toHaveValue('Transparente');
  });

  test('agrega un color de la Biblioteca sin stock y con stock, y queda elegido', async ({ page }) => {
    await login(page);
    await page.goto('/presupuestos/nuevo');
    await page.getByTestId('add-line').click();
    const l1 = page.getByTestId('quote-line').first();
    await l1.getByTestId('line-material').click();
    const dlg = page.getByRole('dialog');
    await dlg.getByTestId('picker-search').fill('bambu abs');
    await dlg.getByTestId('picker-library-line').first().click();
    await dlg.getByTestId('picker-library-color').filter({ hasText: 'Lavender' }).first().click();
    await expect(dlg.getByTestId('picker-add')).toBeVisible();
    await expect(dlg.getByTestId('picker-have-none')).toBeChecked(); // por defecto: sin stock, para que avise
    await dlg.getByTestId('picker-have-some').check(); await dlg.getByTestId('picker-closed').fill('1'); await dlg.getByTestId('picker-open-g').fill('300');
    await shot(page, '61-selector-agregar');
    await dlg.getByTestId('picker-add-go').click();
    await expect(dlg).toBeHidden();
    await expect(l1.getByTestId('line-material')).toContainText('Lavender');
    await page.goto('/inventario');
    await expect(page.getByText('Lavender').first()).toBeVisible();
  });
});
