import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { loadQuote } from '@/lib/services/quotes';
import { buildQuoteDoc } from '@/lib/services/quote-doc';
import { getSettings } from '@/lib/settings';
import { QuoteDocument } from '@/components/quote-document';
import { getT } from '@/i18n/server';

export const dynamic = 'force-dynamic';

/** Versión imprimible del presupuesto (la usa el generador de PDF): el mismo documento de cliente que la vista previa, sin costos internos ni precio sugerido. */
export default async function PrintQuote({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ sinpdf?: string }> }) {
  const t = await getT();
  const user = await getSession(); if (!user) redirect('/login'); if (!can(user, 'presupuestos', 'V')) notFound();
  const { id } = await params; const sp = await searchParams; const d = await loadQuote(id); if (!d) notFound();
  const st = await getSettings();
  // un presupuesto enviado usa la plantilla que se congeló al enviarlo; en borrador, la vigente
  const template = (d.quote.docTemplate as any) ?? st.documents.quote;
  return (
    <div className="print-doc">
      {sp.sinpdf && <div role="alert" className="no-print" style={{ background: '#fef3c7', border: '1px solid #f59e0b', padding: '8px 12px', marginBottom: 12, borderRadius: 6 }}>{t('quotes.pdfUnavailable')}</div>}
      <style>{`*{box-sizing:border-box}body{background:#fff!important}ul{margin:4px 0}tr,[data-section]:not([data-section=items]){break-inside:avoid}`}</style>
      <QuoteDocument data={buildQuoteDoc(d, st, t)} template={template} t={t} />
    </div>
  );
}
