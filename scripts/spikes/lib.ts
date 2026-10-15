/** Utilidades de los spikes R0: arman perfiles de OrcaSlicer (sin base de datos) y ejecutan el CLI midiendo tiempo. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { buildCliProfile } from '../../src/lib/slicer/catalog';
import { config } from '../../src/lib/config';

export const A1 = { machine: 'Bambu Lab A1 0.4 nozzle', process: '0.20mm Standard @BBL A1', filament: 'Bambu PLA Basic @BBL A1' };
export function profiles(o: Partial<typeof A1> = {}, changes: { process?: Record<string, any>; filament?: Record<string, any>; machine?: Record<string, any> } = {}) {
  const n = { ...A1, ...o };
  const machine = buildCliProfile('machine', { name: 'spike-machine', baseName: n.machine, changes: changes.machine ?? {} });
  const proc = buildCliProfile('process', { name: 'spike-process', baseName: n.process, changes: changes.process ?? {}, machineName: 'spike-machine' });
  const fil = buildCliProfile('filament', { name: 'spike-filament', baseName: n.filament, changes: changes.filament ?? {}, machineName: 'spike-machine' });
  return { machine, proc, fil };
}

export interface RunOut { code: number; ms: number; dir: string; log: string; files: string[] }
export async function orca(args: (dir: string) => string[], o: { timeoutS?: number; keep?: boolean } = {}): Promise<RunOut> {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'spike-'));
  const out = path.join(dir, 'out'); fs.mkdirSync(out);
  const t0 = Date.now(); const log: string[] = [];
  const code: number = await new Promise((res) => {
    const p = spawn(config.orcaBin, args(dir), { cwd: dir, env: { ...process.env, HOME: dir }, stdio: ['ignore', 'pipe', 'pipe'] });
    p.stdout.on('data', (d) => log.push(String(d))); p.stderr.on('data', (d) => log.push(String(d)));
    const t = setTimeout(() => p.kill('SIGKILL'), (o.timeoutS ?? 300) * 1000);
    p.on('close', (c) => { clearTimeout(t); res(c ?? -1); });
  });
  const files = fs.existsSync(out) ? fs.readdirSync(out) : [];
  return { code, ms: Date.now() - t0, dir, log: log.join(''), files };
}
export const wr = (dir: string, name: string, d: unknown) => { const p = path.join(dir, name); fs.writeFileSync(p, JSON.stringify(d)); return p; };
export function sliceArgs(dir: string, model: string, p: ReturnType<typeof profiles>, extra: string[] = []) {
  const m = wr(dir, 'm.json', p.machine), pr = wr(dir, 'p.json', p.proc), f = wr(dir, 'f.json', p.fil);
  const copy = path.join(dir, 'model' + path.extname(model)); fs.copyFileSync(model, copy);
  return ['--slice', '0', '--load-settings', `${m};${pr}`, '--load-filaments', f, '--outputdir', path.join(dir, 'out'), '--export-3mf', 'sliced.3mf', ...extra, copy];
}
