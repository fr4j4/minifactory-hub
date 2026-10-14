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

    await page.getByTestId('ai-provider').selectOption('genericOpenai');
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
    await page.getByTestId('ai-provider').selectOption('genericOpenai');
    await page.getByTestId('ai-base-url').fill('https://api.openai.com/v1');
    await page.getByTestId('ai-local-only').check(); await page.getByTestId('ai-save').click();
    await expect(page.getByText(/solo local/i).first()).toBeVisible();
  });

  test('proveedores preconfigurados, descubridor de IA local y opción genérica', async ({ page }) => {
    await login(page); await page.goto('/configuracion?tab=ia');
    // preajuste local: trae su dirección y no pide clave
    await page.getByTestId('ai-provider').selectOption('ollama');
    await expect(page.getByTestId('ai-base-url')).toHaveValue('http://localhost:11434/v1'); await expect(page.getByTestId('ai-preset-note')).toContainText('11434');
    // Ollama Cloud: dirección de la nube, modelos sugeridos y aviso de clave
    await page.getByTestId('ai-provider').selectOption('ollamaCloud');
    await expect(page.getByTestId('ai-base-url')).toHaveValue('https://ollama.com/v1'); await expect(page.getByTestId('ai-model-smart')).toHaveValue('gpt-oss:120b'); await expect(page.getByTestId('ai-preset-note')).toContainText('clave');
    await page.getByTestId('ai-local-only').check(); await expect(page.getByText('«solo local» está activo')).toBeVisible(); await page.getByTestId('ai-local-only').uncheck();
    // el genérico siempre existe y deja escribir todo a mano
    await page.getByTestId('ai-provider').selectOption('genericOpenai');
    await page.getByTestId('ai-base-url').fill('http://127.0.0.1:18090/v1'); await expect(page.getByTestId('ai-base-url')).toHaveValue('http://127.0.0.1:18090/v1');
    // descubridor: un servidor en otra dirección de la red local
    await page.getByTestId('ai-provider').selectOption('');
    await page.getByTestId('ai-discover-extra').fill('127.0.0.1:18090'); await page.getByTestId('ai-discover').click();
    await expect(page.getByTestId('ai-discover-list')).toContainText('4 modelo(s)');
    await page.getByTestId('ai-discover-use-18090').click();
    await expect(page.getByTestId('ai-provider')).toHaveValue('genericOpenai'); await expect(page.getByTestId('ai-base-url')).toHaveValue('http://127.0.0.1:18090/v1');
    await expect(page.getByTestId('ai-model-fast')).toHaveValue('qwen2.5vl:7b'); await expect(page.getByTestId('ai-model-smart')).toHaveValue('gpt-oss:20b'); await expect(page.getByTestId('ai-model-vision')).toHaveValue('qwen2.5vl:7b');
    await shot(page, 'IA03-descubridor-local', { full: true });
    // cargar modelos del proveedor ya elegido
    await page.getByTestId('ai-model-fast').fill(''); await page.getByTestId('ai-load-models').click();
    await expect(page.getByTestId('ai-models-note')).toContainText('4 modelo(s) disponibles'); await expect(page.getByTestId('ai-model-fast')).toHaveValue('qwen2.5vl:7b');
    // direcciones de internet no se buscan
    await page.getByTestId('ai-discover-extra').fill('8.8.8.8'); await page.getByTestId('ai-discover').click(); await expect(page.getByText('Solo se puede buscar en tu red local')).toBeVisible();
    // guardar y volver: se recuerda el preajuste
    await page.getByTestId('ai-discover-extra').fill(''); await page.getByTestId('ai-save').click(); await expect(page.getByText('Configuración de IA guardada')).toBeVisible();
    await page.reload(); await expect(page.getByTestId('ai-provider')).toHaveValue('genericOpenai');
    await page.getByTestId('ai-test').click(); await expect(page.getByTestId('ai-test-result')).toContainText('Conexión correcta');
  });

  test('accesibilidad de la pantalla', async ({ page }) => {
    await login(page); await page.goto('/configuracion?tab=ia');
    const r = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
    expect(r.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([]);
  });
});
