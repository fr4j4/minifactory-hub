import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { config } from '../config';
import { parseGcodeMeta, type SliceMeta } from '../gcode';
import { getT } from '@/i18n/server';
import type { MessageKey } from '@/i18n/translate';

export interface CliResult {
  ok: boolean; error?: string; engine: string; durationMs: number;
  plates: Array<{ gcodePath: string; meta: SliceMeta }>; threemfPath?: string; tmpDir: string;
}

let engineVer: string | null = null;
export async function engineVersion(): Promise<string> {
  if (engineVer) return engineVer;
  if (!fs.existsSync(config.orcaBin)) return 'no-instalado';
  const out = await new Promise<string>((res) => {
    const p = spawn(config.orcaBin, ['--help'], { stdio: ['ignore', 'pipe', 'pipe'] });
    let buf = ''; p.stdout.on('data', (d) => (buf += d)); p.stderr.on('data', (d) => (buf += d));
    const tt = setTimeout(() => p.kill('SIGKILL'), 30000);
    p.on('close', () => { clearTimeout(tt); res(buf); }); p.on('error', () => res(''));
  });
  const m = out.match(/OrcaSlicer-([\d.]+)/);
  return (engineVer = m ? m[1] : 'desconocida');
}

const ERR_MAP: Record<number, MessageKey> = {
  [-50]: 'slicer.errPartDoesNotFit',
  [-17]: 'slicer.errProfileIncompatible',
};

export async function runOrca(o: {
  inputPath: string; ext: string; machine: Record<string, any>; process: Record<string, any>; filament: Record<string, any>;
  copies: number; timeoutS?: number;
}): Promise<CliResult> {
  const t = await getT();
  const t0 = Date.now();
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'mf-slice-'));
  const engine = await engineVersion();
  if (!fs.existsSync(config.orcaBin)) return { ok: false, error: t('slicer.orcaslicerIsNotInstalledOn'), engine, durationMs: 0, plates: [], tmpDir };
  const outDir = path.join(tmpDir, 'out'); await fsp.mkdir(outDir);
  const input = path.join(tmpDir, `model.${o.ext}`);
  await fsp.copyFile(o.inputPath, input);
  const wr = async (n: string, d: unknown) => { const p = path.join(tmpDir, n); await fsp.writeFile(p, JSON.stringify(d)); return p; };
  const mf = await wr('machine.json', o.machine), pf = await wr('process.json', o.process), ff = await wr('filament.json', o.filament);
  const args = ['--slice', '0', '--arrange', '1', '--load-settings', `${mf};${pf}`, '--load-filaments', ff, '--outputdir', outDir, '--export-3mf', 'sliced.3mf'];
  if (o.copies > 1) args.push('--clone-objects', String(o.copies));
  args.push(input);
  const log: string[] = [];
  const code: number = await new Promise((res) => {
    const p = spawn(config.orcaBin, args, { cwd: tmpDir, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, HOME: tmpDir } });
    p.stdout.on('data', (d) => log.push(String(d))); p.stderr.on('data', (d) => log.push(String(d)));
    const timer = setTimeout(() => { log.push('timeout'); p.kill('SIGKILL'); }, (o.timeoutS ?? config.orcaTimeoutS) * 1000);
    p.on('close', (c) => { clearTimeout(timer); res(c ?? -1); }); p.on('error', () => { clearTimeout(timer); res(-1); });
  });
  const durationMs = Date.now() - t0;
  let rc = code, errStr = '';
  try { const r = JSON.parse(await fsp.readFile(path.join(outDir, 'result.json'), 'utf8')); rc = r.return_code ?? rc; errStr = r.error_string ?? ''; } catch { /* sin result.json */ }
  if (log.join('').includes('timeout')) return { ok: false, error: t('slicer.slicingExceededTheLimitOf', { timeoutS: o.timeoutS ?? config.orcaTimeoutS }), engine, durationMs, plates: [], tmpDir };
  const files = (await fsp.readdir(outDir)).filter((f) => /^plate_\d+\.gcode$/.test(f)).sort((a, b) => parseInt(a.slice(6)) - parseInt(b.slice(6)));
  if (rc !== 0 || !files.length) {
    return { ok: false, error: (ERR_MAP[rc] ? t(ERR_MAP[rc]) : (errStr && errStr !== 'Success.' ? errStr : t('slicer.theSlicerFinishedWithAn', { code: rc}))), engine, durationMs, plates: [], tmpDir };
  }
  const plates = [];
  for (const f of files) {
    const gp = path.join(outDir, f);
    plates.push({ gcodePath: gp, meta: parseGcodeMeta(await fsp.readFile(gp, 'utf8')) });
  }
  const t3 = path.join(tmpDir, 'sliced.3mf');
  const t3b = path.join(outDir, 'sliced.3mf');
  const threemfPath = fs.existsSync(t3) ? t3 : fs.existsSync(t3b) ? t3b : undefined;
  return { ok: true, engine, durationMs, plates, threemfPath, tmpDir };
}

export async function cleanup(tmpDir: string) { await fsp.rm(tmpDir, { recursive: true, force: true }); }
