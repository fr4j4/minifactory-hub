import { test, expect, login, shot } from './helpers';

test.describe('Colores de la pieza', () => {
  test('un color adicional es solo referencia: no cambia el precio, se resume y se puede quitar', async ({ page }) => {
    await login(page);
    await page.goto('/presupuestos/nuevo');
    await page.getByTestId('add-line').click();
    const l1 = page.getByTestId('quote-line').first();
    await l1.getByTestId('manual-grams').fill('100');
    const before = await l1.getByTestId('line-suggested').innerText();
    await l1.getByTestId('add-color').click();
    await expect(l1.getByTestId('colors-panel')).toBeVisible();
    await expect(l1.getByTestId('color-row')).toHaveCount(1);
    await shot(page, '65-colores-pieza');
    await expect(l1.getByTestId('line-suggested')).toHaveText(before); // referencia: el precio no se mueve
    await l1.getByRole('button', { name: /Cerrar|Close/ }).click();
    await expect(l1.getByTestId('colors-summary')).toBeVisible();
    await l1.getByTestId('colors-summary').click();
    await l1.getByTestId('color-remove').click();
    await expect(l1.getByTestId('add-color')).toBeVisible();
  });
});
