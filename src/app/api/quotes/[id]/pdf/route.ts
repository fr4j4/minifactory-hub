import fs from 'node:fs';
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { getT } from '@/i18n/server';

export const maxDuration = 60;

function chromiumPath(): string | undefined {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try { for (const d of fs.readdirSync(base)) { const p = `${base}/${d}/chrome-linux/chrome`; if (/^chromium-/.test(d) && fs.existsSync(p)) return p; } } catch { /* usa el de playwright */ }
  return undefined;
}

/** PDF del presupuesto: la plantilla HTML se imprime con Chromium (Playwright). Sin Chromium disponible, entrega la versión imprimible. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const user = await getSession();
  if (!user || !can(user, 'presupuestos', 'V')) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 });
  const { id } = await params; const db = await getDb();
  const [q] = await db.select().from(s.quotes).where(eq(s.quotes.id, id)); if (!q) return NextResponse.json({ error: t('common.doesNotExist') }, { status: 404 });
  const origin = new URL(req.url).origin; const sess = (await cookies()).get('mf_session')?.value;
  try {
    const { chromium } = await import('playwright');
    const browser = await chromium.launch({ executablePath: chromiumPath(), args: ['--no-sandbox'] });
    try {
      const ctx = await browser.newContext(); await ctx.addCookies([{ name: 'mf_session', value: sess ?? '', url: origin }]);
      const page = await ctx.newPage(); await page.goto(`${origin}/imprimir/presupuesto/${id}`, { waitUntil: 'networkidle' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true, margin: { top: '12mm', bottom: '12mm', left: '8mm', right: '8mm' } });
      return new Response(new Uint8Array(pdf), { headers: { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${q.number}-v${q.version}.pdf"` } });
    } finally { await browser.close(); }
  } catch {
    return NextResponse.redirect(`${origin}/imprimir/presupuesto/${id}`);
  }
}
