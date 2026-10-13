import { test, expect, login, shot } from './helpers';
import AxeBuilder from '@axe-core/playwright';

test.describe('IA opcional (Fase 0)', () => {
  test('apagada por defecto: sin controles de IA; el operador no ve la configuración', async ({ page }) => {
    await login(page, 'operador');
    await page.goto('/configuracion'); await expect(page).not.toHaveURL(/\/configuracion$/); // sin permiso de config
    await page.goto('/laminador'); await expect(page.getByRole('button', { name: /IA/ })).toHaveCount(0);
  });

  test('el administrador configura el proveedor, prueba la conexión y la clave nunca vuelve al navegador', async ({ page }) => {
    await login(page);
    await page.goto('/configuracion?tab=ia');
    await expect(page.getByTestId('ai-enabled')).not.toBeChecked();
    await shot(page, 'IA01-apagada', { full: true });

    await page.getByTestId('ai-provider').selectOption('openai-compat');
    await page.getByTestId('ai-base-url').fill('http://127.0.0.1:18090/v1');
    await page.getByTestId('ai-key').fill('clave-secreta-e2e-4321');
    await page.getByTestId('ai-test').click();
    await expect(page.getByTestId('ai-test-result')).toContainText('Conexión correcta');

    await page.getByTestId('ai-key').fill('clave-mala');
    await page.getByTestId('ai-test').click();
    await expect(page.getByTestId('ai-test-result')).toContainText('401');
    await expect(page.getByTestId('ai-test-result')).not.toContainText('clave-mala');

    await page.getByTestId('ai-key').fill('clave-secreta-e2e-4321');
    await page.getByTestId('ai-enabled').check(); await page.getByTestId('ai-feat-messages.draft').check(); await page.getByTestId('ai-budget').fill('5');
    await page.getByTestId('ai-save').click(); await expect(page.getByText('Configuración de IA guardada')).toBeVisible();

    await page.reload();
    await expect(page.getByTestId('ai-enabled')).toBeChecked();
    await expect(page.getByTestId('ai-key')).toHaveAttribute('placeholder', 'guardada ••••4321');
    await expect(page.getByTestId('ai-key')).toHaveValue('');
    expect(await page.content()).not.toContain('clave-secreta-e2e'); // ni en el HTML ni en el payload RSC
    await expect(page.getByTestId('ai-usage')).toContainText('llamadas');
    await shot(page, 'IA02-configurada', { full: true });
  });

  test('«solo local» rechaza un proveedor de internet al guardar', async ({ page }) => {
    await login(page); await page.goto('/configuracion?tab=ia');
    await page.getByTestId('ai-provider').selectOption('openai-compat');
    await page.getByTestId('ai-base-url').fill('https://api.openai.com/v1');
    await page.getByTestId('ai-local-only').check(); await page.getByTestId('ai-save').click();
    await expect(page.getByText(/solo local/i).first()).toBeVisible();
  });

  test('accesibilidad de la pantalla', async ({ page }) => {
    await login(page); await page.goto('/configuracion?tab=ia');
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(r.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
  });
});
