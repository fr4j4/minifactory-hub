import { defineConfig } from '@playwright/test';
import path from 'node:path';

const PORT = 3200;
const chromium = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const env = { PGLITE_DIR: path.resolve('data/e2e/pgdata'), STORAGE_DIR: path.resolve('data/e2e/storage'), DATA_DIR: path.resolve('data/e2e'), SESSION_SECRET: 'e2e', PORT: String(PORT) };

export default defineConfig({
  testDir: 'tests/e2e', timeout: 240_000, expect: { timeout: 20_000 }, workers: 1, fullyParallel: false, retries: 0, reporter: [['list']],
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1360, height: 860 }, locale: 'es-CL', timezoneId: 'America/Santiago', actionTimeout: 20_000, navigationTimeout: 60_000,
    launchOptions: { executablePath: chromium, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--enable-features=WebGLDeveloperExtensions'] },
    video: 'off', screenshot: 'off', trace: 'off' },
  webServer: { command: 'npx next start -p ' + PORT, port: PORT, reuseExistingServer: false, timeout: 120_000, env: { ...env, NODE_ENV: 'production' } },
});
