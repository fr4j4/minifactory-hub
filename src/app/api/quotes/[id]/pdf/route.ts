import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { getT } from '@/i18n/server';
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
  const origin = new URL(req.url).origin; const sess = (await cookies()).get('mf_session')?.value ?? '';
  try {
    const pdf = await renderPdf(`${origin}/imprimir/presupuesto/${id}`, { name: 'mf_session', value: sess });
    if (q.status !== 'borrador') { const key = newKey('pdf', 'pdf'); await putBuffer(key, pdf); await db.update(s.quotes).set({ pdfKey: key }).where(eq(s.quotes.id, id)); }
    return new Response(new Uint8Array(pdf), { headers });
  } catch (e) {
    console.error('PDF: no se pudo generar con Chromium', e);
    // Fallo explícito: se entrega la versión imprimible, pero avisando que el PDF no se pudo generar
    return NextResponse.redirect(`${origin}/imprimir/presupuesto/${id}?sinpdf=1`);
  }
}
