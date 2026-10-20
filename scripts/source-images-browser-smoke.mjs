import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const baseURL = 'http://127.0.0.1:3011';
assert.equal((await fetch(`${baseURL}/api/library/health`).then(r => r.json())).environment, 'library-test');
const modelId = process.argv[2];
assert.match(modelId || '', /^[a-f0-9-]{36}$/);
const password = (await fs.readFile('data/library-test-access.txt', 'utf8')).match(/^Password: (.+)$/m)?.[1];
assert(password);
const root = path.join(os.homedir(), '.cache/ms-playwright');
const installed = (await fs.readdir(root)).filter(n => n.startsWith('chromium_headless_shell-')).sort().at(-1);
const browser = await chromium.launch({ executablePath: path.join(root, installed, 'chrome-headless-shell-linux64/chrome-headless-shell'), headless: true, args: ['--no-sandbox'] });
try {
  const page = await browser.newPage({ baseURL, viewport: { width: 1440, height: 1000 } });
  await page.goto('/login');
  await page.locator('input[name=email]').fill('biblioteca-test@minifactory.local');
  await page.locator('input[name=password]').fill(password);
  await page.locator('form button').first().click(); await page.waitForURL(u => !u.pathname.includes('/login'));
  await page.goto(`/archivos/${modelId}`);
  const photos = page.locator('img[src*="/api/media/photos/imported/"]:visible');
  await photos.first().waitFor();
  assert(await photos.count() >= 7);
  console.log('Ficha cargada; comprobando imágenes locales');
  for (const photo of (await photos.all()).slice(0, 7)) {
    await photo.scrollIntoViewIfNeeded();
    await photo.evaluate(img => Promise.race([img.decode(), new Promise((_, reject) => setTimeout(() => reject(new Error('Image decode timeout')), 10000))]));
    assert(await photo.evaluate(img => img.naturalWidth > 0));
  }
  await fs.mkdir('data/library-test-evidence', { recursive: true });
  await page.screenshot({ path: 'data/library-test-evidence/source-images-model.png', fullPage: true });
  const source = page.getByTestId('source-panel');
  assert(await source.locator('img[src^="/api/media/"]').count() >= 1);
  await page.goto('/archivos');
  const cover = page.locator(`img[src*="photos/imported/${modelId}/"]`).first();
  await cover.waitFor(); await cover.evaluate(img => img.decode());
  await page.screenshot({ path: 'data/library-test-evidence/source-images-library.png', fullPage: true });
  console.log('OK: fotos locales, portada de biblioteca y panel de origen visibles y accesibles.');
} finally { await browser.close(); }
