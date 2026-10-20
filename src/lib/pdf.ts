import { chromiumPath } from './health';

/**
 * Generador de PDF con Chromium. El navegador se mantiene abierto entre peticiones (lanzarlo cuesta 1–2 s) y se cierra tras un rato sin uso.
 * Cada PDF usa su propio contexto aislado con la cookie de la persona que lo pidió.
 */
type Browser = import('playwright').Browser;
const g = globalThis as unknown as { __pdfBrowser?: Promise<Browser>; __pdfIdle?: NodeJS.Timeout };
const IDLE_MS = 90_000;

async function getBrowser(): Promise<Browser> {
  const cur = g.__pdfBrowser ? await g.__pdfBrowser.catch(() => null) : null;
  if (cur?.isConnected()) return cur;
  const { chromium } = await import('playwright');
  g.__pdfBrowser = chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
  return g.__pdfBrowser;
}
function touch() {
  if (g.__pdfIdle) clearTimeout(g.__pdfIdle);
  g.__pdfIdle = setTimeout(async () => { const b = g.__pdfBrowser; g.__pdfBrowser = undefined; (await b?.catch(() => null))?.close().catch(() => {}); }, IDLE_MS);
  g.__pdfIdle.unref?.();
}

/** `footer`: HTML del pie de cada página (Chromium rellena .pageNumber y .totalPages). */
export async function renderPdf(url: string, cookies: Array<{ name: string; value: string }>, footer?: string): Promise<Buffer> {
  const browser = await getBrowser();
  const ctx = await browser.newContext();
  try {
    await ctx.addCookies(cookies.map((c) => ({ name: c.name, value: c.value, url: new URL(url).origin })));
    const page = await ctx.newPage();
    const res = await page.goto(url, { waitUntil: 'networkidle' });
    if (!res?.ok()) throw new Error(`PDF: la página respondió ${res?.status()}`);
    return await page.pdf({
      format: 'A4', printBackground: true, margin: { top: '12mm', bottom: footer ? '16mm' : '12mm', left: '8mm', right: '8mm' },
      ...(footer ? { displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: footer } : {}),
    });
  } finally { await ctx.close().catch(() => {}); touch(); }
}
