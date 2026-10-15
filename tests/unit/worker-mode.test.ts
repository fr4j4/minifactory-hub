import { afterEach, describe, expect, it } from 'vitest';
import { runsQueues } from '@/lib/worker-mode';

const keep = { ...process.env };
afterEach(() => { process.env = { ...keep }; });

describe('modo del worker', () => {
  it('por defecto el proceso ejecuta las colas', () => { delete process.env.MF_EXTERNAL_WORKER; expect(runsQueues()).toBe(true); });
  it('con worker externo la web solo encola y el proceso worker ejecuta', () => {
    process.env.MF_EXTERNAL_WORKER = '1'; expect(runsQueues()).toBe(false);
    process.env.MF_WORKER_PROCESS = '1'; expect(runsQueues()).toBe(true);
  });
});
