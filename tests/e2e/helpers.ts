import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { expect, test as base, type Page, type TestInfo } from '@playwright/test';

export const ROOT = path.resolve('docs/reporte');
export const SHOTS = path.join(ROOT, 'media/screens'); export const VIDEOS = path.join(ROOT, 'media/videos'); export const DATA = path.join(ROOT, 'data');
export const SAMPLES = path.resolve('samples');

export async function login(page: Page, who: 'admin' | 'operador' | 'ventas' = 'admin') {
  const creds = { admin: ['admin@minifactory.cl', 'admin1234'], operador: ['operador@minifactory.cl', 'taller1234'], ventas: ['ventas@minifactory.cl', 'taller1234'] }[who];
  await page.goto('/login'); await page.getByLabel('Correo').fill(creds[0]); await page.getByLabel('Contraseña').fill(creds[1]); await page.getByRole('button', { name: 'Ingresar' }).click(); await page.waitForURL('**/', { timeout: 30000 });
}
export async function shot(page: Page, name: string, opts: { full?: boolean } = {}) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: !!opts.full }); }

/** Mide tiempo y cantidad de interacciones de un caso de uso (para el informe de usabilidad). */
export interface Metric { name: string; seconds: number; steps: number; limitS?: number; ok: boolean; note?: string }
const metrics: Metric[] = [];
export async function measure<T>(name: string, o: { limitS?: number; note?: string }, fn: (tick: () => void) => Promise<T>): Promise<T> {
  let steps = 0; const t0 = Date.now(); const r = await fn(() => { steps++; }); const seconds = (Date.now() - t0) / 1000;
  const m: Metric = { name, seconds: +seconds.toFixed(1), steps, limitS: o.limitS, ok: o.limitS ? seconds <= o.limitS : true, note: o.note }; metrics.push(m);
  fs.mkdirSync(DATA, { recursive: true }); const f = path.join(DATA, 'usability.json'); const prev = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) as Metric[] : [];
  fs.writeFileSync(f, JSON.stringify([...prev.filter((x) => x.name !== name), m], null, 1));
  return r;
}

/** Grabación propia: CDP screencast + ffmpeg del sistema (MP4 H.264). Si la prueba pide `saveAs(nombre)`, el video queda en docs/reporte/media/videos. */
export const test = base.extend<{ saveAs: (name: string) => void; _name: { v: string } }>({
  _name: async ({}, use) => { await use({ v: '' }); },
  saveAs: async ({ _name }, use) => { await use((n) => { _name.v = n; }); },
  page: async ({ browser, _name }, use, info) => {
    const mobile = info.annotations.some((a) => a.type === 'mobile');
    const ctx = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1360, height: 860 }, locale: 'es-CL', timezoneId: 'America/Santiago', baseURL: info.project.use.baseURL, ...(mobile ? { hasTouch: true, isMobile: true, deviceScaleFactor: 2 } : {}) });
    const page = await ctx.newPage(); const dir = fs.mkdtempSync(path.join(path.resolve('data'), 'vid-'));
    const cdp = await ctx.newCDPSession(page); const frames: Array<{ f: string; t: number }> = []; let n = 0;
    cdp.on('Page.screencastFrame', async (e: any) => { const f = path.join(dir, `f${String(n++).padStart(6, '0')}.jpg`); fs.writeFileSync(f, Buffer.from(e.data, 'base64')); frames.push({ f, t: e.metadata.timestamp }); cdp.send('Page.screencastFrameAck', { sessionId: e.sessionId }).catch(() => {}); });
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 72, maxWidth: mobile ? 780 : 1360, maxHeight: mobile ? 1688 : 860, everyNthFrame: 1 }).catch(() => {});
    await use(page);
    await cdp.send('Page.stopScreencast').catch(() => {}); await ctx.close();
    if (_name.v && frames.length > 2) {
      const list = frames.map((fr, i) => `file '${fr.f}'\nduration ${Math.max(0.03, Math.min(1.5, (frames[i + 1]?.t ?? fr.t + 0.5) - fr.t)).toFixed(3)}`).join('\n') + `\nfile '${frames[frames.length - 1].f}'\n`;
      fs.writeFileSync(path.join(dir, 'list.txt'), list); fs.mkdirSync(VIDEOS, { recursive: true });
      try { execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'), '-vf', 'fps=15,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '30', '-movflags', '+faststart', path.join(VIDEOS, _name.v + '.mp4')]); } catch (e) { console.log('ffmpeg falló', (e as Error).message.slice(0, 200)); }
    }
    fs.rmSync(dir, { recursive: true, force: true });
  },
});
export { expect };

/** Gestos táctiles reales por CDP (arrastre con un dedo y pellizco con dos) para probar el visor en el celular. */
export async function touchDrag(page: Page, from: [number, number], to: [number, number], steps = 12) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: from[0], y: from[1] }] });
  for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: from[0] + ((to[0] - from[0]) * i) / steps, y: from[1] + ((to[1] - from[1]) * i) / steps }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}
export async function touchPinch(page: Page, center: [number, number], startDist: number, endDist: number, steps = 12) {
  const cdp = await page.context().newCDPSession(page);
  const pts = (d: number) => [{ x: center[0] - d / 2, y: center[1], id: 1 }, { x: center[0] + d / 2, y: center[1], id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts(startDist) });
  for (let i = 1; i <= steps; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts(startDist + ((endDist - startDist) * i) / steps) });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

/** Sube a la biblioteca aceptando el aviso de duplicado («Subir igual») si aparece, y espera el «Listo ✓». */
export async function uploadAcceptingDuplicates(page: Page, files: string | string[], timeout = 60_000) {
  const input = page.getByTestId('model-uploader').locator('input[type=file]');
  const started = () => page.locator('ul[aria-live="polite"] li').or(page.getByTestId('duplicate-upload')).first().isVisible();
  const end = Date.now() + timeout; let tries = 0; let lastTry = 0;
  while (Date.now() < end) {
    // si la página aún no se había hidratado, el primer intento se pierde: se repite hasta que aparezca la lista de progreso
    if (!(await started()) && Date.now() - lastTry > 6_000 && tries < 4) { await input.setInputFiles(files); tries++; lastTry = Date.now(); await page.waitForTimeout(300); }
    const dlg = page.getByTestId('duplicate-upload');
    // el diálogo se desvanece unos 160 ms tras cerrarse: se espera a que salga para no hacer clic dos veces
    if (await dlg.isVisible()) { await dlg.click(); await dlg.waitFor({ state: 'detached', timeout: 5_000 }).catch(() => {}); continue; }
    if ((await page.getByText('Listo ✓').count()) >= (Array.isArray(files) ? files.length : 1)) return;
    await page.waitForTimeout(150);
  }
  throw new Error('La subida no terminó');
}

/** Elige un filamento en el selector (botón con ese data-testid): por texto (se busca y se toma la primera coincidencia) o, sin texto, la primera opción. */
export async function pickFilament(page: Page, testId: string, text?: string) {
  await page.getByTestId(testId).click();
  const dlg = page.getByRole('dialog');
  if (text) await dlg.getByTestId('picker-search').fill(text);
  await dlg.locator('[data-material-id]').filter(text ? { hasText: text.split(' ').pop()! } : {}).first().click();
  await expect(dlg).toBeHidden();
}
