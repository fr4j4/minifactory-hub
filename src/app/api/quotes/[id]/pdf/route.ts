import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { getT } from '@/i18n/server';
import { chromiumPath } from '@/lib/health';

export const maxDuration = 60;

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
  } catch (e) {
    console.error('PDF: no se pudo generar con Chromium', e);
    // Fallo explícito: se entrega la versión imprimible, pero avisando que el PDF no se pudo generar
    return NextResponse.redirect(`${origin}/imprimir/presupuesto/${id}?sinpdf=1`);
  }
}
