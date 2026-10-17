import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { getT } from '@/i18n/server';
import { LOCALE_COOKIE } from '@/i18n/config';
import { renderPdf } from '@/lib/pdf';
import { exists, getBuffer, newKey, putBuffer } from '@/lib/storage';

export const maxDuration = 60;

/**
 * PDF del presupuesto. Si ya se envió, se entrega la copia guardada (lo que recibió el cliente); si no existe aún, se genera con la plantilla
 * congelada y se guarda. En borrador siempre se genera de nuevo. Sin Chromium, avisa y entrega la versión imprimible.
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const user = await getSession();
  if (!user || !can(user, 'presupuestos', 'V')) return NextResponse.json({ error: t('common.unauthorized') }, { status: 401 });
  const { id } = await params; const db = await getDb();
  const [q] = await db.select().from(s.quotes).where(eq(s.quotes.id, id)); if (!q) return NextResponse.json({ error: t('common.doesNotExist') }, { status: 404 });
  const headers = { 'content-type': 'application/pdf', 'content-disposition': `attachment; filename="${q.number}-v${q.version}.pdf"` };
  if (q.status !== 'borrador' && q.pdfKey && (await exists(q.pdfKey))) return new Response(new Uint8Array(await getBuffer(q.pdfKey)), { headers });
  // origen interno fijo: req.url sale del encabezado Host, que controla el cliente (SSRF y PDF guardado alterado)
  const origin = process.env.INTERNAL_ORIGIN ?? `http://127.0.0.1:${process.env.PORT ?? 3000}`; const sess = (await cookies()).get('mf_session')?.value ?? '';
  // mf_lang: el PDF sale en el mismo idioma que la vista previa de quien lo pide
  const lang = (await cookies()).get(LOCALE_COOKIE)?.value;
  // pie en cada página: número del presupuesto y página X/Y
  const num = `${q.number}${q.version > 1 ? ` (v${q.version})` : ''}`.replace(/[<>&"]/g, '');
  const footer = `<div style="font-size:8px;color:#64748b;width:100%;padding:0 8mm;display:flex;justify-content:space-between"><span>${num}</span><span><span class="pageNumber"></span>/<span class="totalPages"></span></span></div>`;
  try {
    const pdf = await renderPdf(`${origin}/imprimir/presupuesto/${id}`, [{ name: 'mf_session', value: sess }, ...(lang ? [{ name: LOCALE_COOKIE, value: lang }] : [])], footer);
    if (q.status !== 'borrador') { const key = newKey('pdf', 'pdf'); await putBuffer(key, pdf); await db.update(s.quotes).set({ pdfKey: key }).where(eq(s.quotes.id, id)); }
    return new Response(new Uint8Array(pdf), { headers });
  } catch (e) {
    console.error('PDF: no se pudo generar con Chromium', e);
    // Fallo explícito: se entrega la versión imprimible, pero avisando que el PDF no se pudo generar
    return NextResponse.redirect(new URL(`/imprimir/presupuesto/${id}?sinpdf=1`, req.url));
  }
}
