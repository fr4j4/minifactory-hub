import { test, expect, login } from './helpers';

test.describe('Biblioteca de modelos (R4)', () => {
  test('selección múltiple: etiquetar y combinar etiquetas; insignias de uso', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/archivos');
    await expect(page.getByTestId('file-grid')).toBeVisible();
    const boxes = page.getByTestId('file-select');
    await boxes.nth(0).check(); await boxes.nth(1).check();
    await expect(page.getByTestId('bulk-bar')).toContainText('2');
    await page.getByTestId('bulk-tags').fill('Llaveros');
    await page.getByTestId('bulk-add-tags').click();
    await expect(page.getByTestId('bulk-bar')).toBeHidden();
    await page.reload();
    await expect(page.getByTestId('file-grid').getByText('llavero').first()).toBeVisible(); // normalizada: singular, minúsculas
    // combinar «llavero» → «regalo»
    await page.getByTestId('tag-admin').locator('summary').click();
    await page.getByTestId('tag-admin').getByRole('button', { name: /^llavero/ }).click();
    await page.getByTestId('tag-to').fill('regalo'); await page.getByTestId('tag-rename').click();
    await page.reload();
    await expect(page.getByTestId('file-grid').getByText('regalo').first()).toBeVisible();
    await expect(page.getByTestId('file-grid').getByText('llavero', { exact: true })).toHaveCount(0);
  });

  test('origen por enlace: guarda el enlace aunque el sitio no responda y sugiere etiquetas por reglas', async ({ page }) => {
    await login(page, 'admin');
    await page.goto('/archivos'); await page.getByTestId('file-grid').locator('a').first().click();
    await page.getByTestId('source-url').fill('http://127.0.0.1:9/modelo'); // privada: bloqueada, queda como error con el enlace
    await page.getByTestId('source-fetch').click();
    await expect(page.getByText(/no respondió|did not respond/i)).toBeVisible({ timeout: 20_000 });
    await page.getByTestId('tags-suggest').click();
    await expect(page.getByTestId('tags-list').or(page.getByText(/Sin sugerencias|No new suggestions/))).toBeVisible();
  });
});
