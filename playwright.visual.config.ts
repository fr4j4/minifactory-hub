import { defineConfig } from '@playwright/test';
import path from 'node:path';

/**
 * Regresión visual (opt-in): `npm run test:visual` compara capturas de las pantallas principales con las líneas base de
 * tests/visual/__snapshots__; `npm run test:visual:update` las regenera. Las líneas base dependen del sistema de render
 * (fuentes, GPU): regenérelas en el mismo entorno donde corre la comparación (p. ej. el contenedor de CI).
 */
const PORT = 3210; const dir = path.resolve('data/visual');
const chromium = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
export default defineConfig({
  testDir: 'tests/visual', timeout: 120_000, workers: 1, retries: 0, reporter: [['list']],
  expect: { timeout: 20_000, toHaveScreenshot: { maxDiffPixelRatio: 0.03, animations: 'disabled', caret: 'hide' } },
  snapshotPathTemplate: '{testDir}/__snapshots__/{arg}{ext}',
  globalSetup: './tests/visual/global-setup.ts',
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1280, height: 800 }, locale: 'es-CL', timezoneId: 'America/Santiago', colorScheme: 'light', reducedMotion: 'reduce',
    launchOptions: { executablePath: chromium, args: ['--no-sandbox', '--font-render-hinting=none'] } },
  webServer: { command: `npx next start -p ${PORT}`, port: PORT, reuseExistingServer: false, timeout: 120_000, env: { NODE_ENV: 'production', PGLITE_DIR: path.join(dir, 'pgdata'), STORAGE_DIR: path.join(dir, 'storage'), DATA_DIR: dir, SESSION_SECRET: 'visual', PORT: String(PORT) } },
});
