import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, 'src') } },
  test: { include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'], testTimeout: 180_000, hookTimeout: 180_000, pool: 'forks', poolOptions: { forks: { singleFork: true } }, env: { PGLITE_DIR: 'memory://', STORAGE_DIR: path.resolve(__dirname, 'data/test-storage'), DATA_DIR: path.resolve(__dirname, 'data/test-data') } },
});
