import { defineConfig } from '@playwright/test';
import path from 'node:path';

const PORT = 3200;
const chromium = process.env.CHROMIUM_PATH || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
// impresoras Bambu simuladas: anuncian por SSDP al puerto 12021, donde escucha el servidor de pruebas
const SSDP = '12021';
// nube de Bambu simulada (API HTTP + broker MQTT con TLS; su CA se escribe fuera de data/e2e, que se borra al iniciar)
const CLOUD = { api: '18080', mqtt: '18884', ca: path.resolve('data/bambu-cloud-ca-e2e.pem') };
const env = { BAMBU_SSDP_PORTS: SSDP, BAMBU_CLOUD_API: `http://127.0.0.1:${CLOUD.api}`, BAMBU_CLOUD_WEB: `http://127.0.0.1:${CLOUD.api}`, BAMBU_CLOUD_MQTT: `127.0.0.1:${CLOUD.mqtt}`, BAMBU_CLOUD_CA_FILE: CLOUD.ca, PGLITE_DIR: path.resolve('data/e2e/pgdata'), STORAGE_DIR: path.resolve('data/e2e/storage'), DATA_DIR: path.resolve('data/e2e'), SESSION_SECRET: 'e2e', PORT: String(PORT) };

export default defineConfig({
  testDir: 'tests/e2e', timeout: 240_000, expect: { timeout: 20_000 }, workers: 1, fullyParallel: false, retries: 0, reporter: [['list']],
  globalSetup: './tests/e2e/global-setup.ts',
  use: { baseURL: `http://localhost:${PORT}`, viewport: { width: 1360, height: 860 }, locale: 'es-CL', timezoneId: 'America/Santiago', actionTimeout: 20_000, navigationTimeout: 60_000,
    launchOptions: { executablePath: chromium, args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox', '--enable-features=WebGLDeveloperExtensions'] },
    video: 'off', screenshot: 'off', trace: 'off' },
  webServer: [
    { command: 'npx next start -p ' + PORT, port: PORT, reuseExistingServer: false, timeout: 120_000, env: { ...env, NODE_ENV: 'production' } },
    { command: 'npx tsx scripts/bambu-sim.ts', port: 18883, reuseExistingServer: false, timeout: 60_000, env: { BAMBU_SIM_SSDP_TARGETS: `127.0.0.1:${SSDP}`, BAMBU_SIM_BASE_PORT: '18000', BAMBU_SIM_CLOUD_API_PORT: CLOUD.api, BAMBU_SIM_CLOUD_MQTT_PORT: CLOUD.mqtt, BAMBU_SIM_CLOUD_CA_FILE: CLOUD.ca } },
  ],
});
