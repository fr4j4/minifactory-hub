import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { orcaAvailable } from './slicer/catalog';
import { config } from './config';

export type Check = { id: 'orca' | 'chromium' | 'ffmpeg' | 'storage'; ok: boolean; detail: string };

export function chromiumPath(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try { for (const d of fs.readdirSync(base)) { const p = `${base}/${d}/chrome-linux/chrome`; if (/^chromium-/.test(d) && fs.existsSync(p)) return p; } } catch { /* usa el de playwright */ }
  return undefined;
}
async function chromiumOk(): Promise<{ ok: boolean; detail: string }> {
  try {
    const { chromium } = await import('playwright');
    const p = chromiumPath() ?? chromium.executablePath();
    return fs.existsSync(p) ? { ok: true, detail: p } : { ok: false, detail: p };
  } catch (e) { return { ok: false, detail: String((e as Error).message).slice(0, 120) }; }
}

/** Dependencias del servidor de las que dependen funciones concretas (laminador, PDF, cámara). */
export async function systemHealth(): Promise<Check[]> {
  const ff = spawnSync(process.env.FFMPEG_BIN || 'ffmpeg', ['-version'], { encoding: 'utf8', timeout: 4000 });
  const ch = await chromiumOk();
  let storageOk = true; try { fs.accessSync(process.env.STORAGE_DIR || config.storageDir, fs.constants.W_OK); } catch { storageOk = false; }
  return [
    { id: 'orca', ok: orcaAvailable(), detail: config.orcaBin },
    { id: 'chromium', ...ch },
    { id: 'ffmpeg', ok: ff.status === 0, detail: ff.status === 0 ? String(ff.stdout).split('\n')[0] : 'ffmpeg' },
    { id: 'storage', ok: storageOk, detail: process.env.STORAGE_DIR || String(config.storageDir ?? '') },
  ];
}
