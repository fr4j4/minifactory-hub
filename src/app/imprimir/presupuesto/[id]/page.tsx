import { notFound, redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { can } from '@/lib/perm';
import { loadQuote } from '@/lib/services/quotes';
import { getSettings } from '@/lib/settings';
import { dmy, dur, money } from '@/lib/format';
import { getT } from '@/i18n/server';

export const dynamic = 'force-dynamic';

/** Versión imprimible del presupuesto (la usa el generador de PDF): sin costos internos ni precio sugerido. */
export default async function PrintQuote({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const user = await getSession(); if (!user) redirect('/login'); if (!can(user, 'presupuestos', 'V')) notFound();
  const { id } = await params; const d = await loadQuote(id); if (!d) notFound();
  const { quote: q, items, models, links } = d; const st = await getSettings();
  const lt = ((q.calc as any)?.lines ?? []) as Array<{ id: string; finalTotal: number }>;
  const pdfLinks = links.filter((l) => l.showInPdf);
  return (
    <div className="print-doc">
      <style>{`*{box-sizing:border-box}body{background:#fff!important}.print-doc{font-family:Inter,Arial,sans-serif;color:#0f172a;margin:0;padding:28px 34px;font-size:12px;background:#fff}h1{font-size:22px;margin:0}table{width:100%;border-collapse:collapse}th{text-align:left;font-size:10px;text-transform:uppercase;color:#64748b;border-bottom:2px solid #e2e8f0;padding:6px}td{padding:8px 6px;border-bottom:1px solid #eef2f7;vertical-align:top}.r{text-align:right}.muted{color:#64748b}.box{border:1px solid #e2e8f0;border-radius:8px;padding:10px 12px}.tot td{border:0;padding:3px 6px}.big{font-size:16px;font-weight:700}img.t{width:54px;height:40px;object-fit:cover;border-radius:4px;margin-right:6px;vertical-align:middle}`}</style>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
          <div><h1 style={{ color: st.shop.brandColor }}>{st.shop.name}</h1><div className="muted">{st.shop.legalName} {st.shop.taxId && `· ${st.shop.taxId}`}<br />{st.shop.address} {st.shop.phone} {st.shop.email}</div></div>
          <div className="r"><div className="big">{t('common.quote')} {q.number}{q.version > 1 ? ` (v${q.version})` : ''}</div><div className="muted">{t('quotes.dateLabel', { date: dmy(q.createdAt) })} · {t('quotes.validUntilLabel', { date: dmy(q.validUntil) })}</div></div>
        </div>
        <div className="box" style={{ marginBottom: 14 }}><b>{q.customerName ?? t('common.customer')}</b>{q.customerPhone ? ` · ${q.customerPhone}` : ''}{q.title && <div className="muted">{q.title}</div>}</div>
        <table><thead><tr><th>{t('common.details')}</th><th className="r">{t('common.qty')}</th><th className="r">{t('common.unitPrice')}</th><th className="r">{t('common.total')}</th></tr></thead>
          <tbody>{items.filter((i) => !i.optional).map((it) => { const ms = models.filter((m) => m.qm.quoteItemId === it.id); const unit = it.finalUnit ?? it.suggestedUnit; const tot = lt.find((x) => x.id === it.id)?.finalTotal ?? unit * it.qty;
            return (<tr key={it.id}><td>{ms.slice(0, 2).map((m) => m.thumb ? <img key={m.qm.id} className="t" alt="" src={`/api/files/v/${m.qm.fileVersionId ?? ''}/thumb`} /> : null)}<b>{it.description || t('quotes.n3dPrintedPart')}</b>{it.groupName && <span className="muted"> · {it.groupName}</span>}<div className="muted">{ms.map((m) => m.name).join(', ')}{!it.variantId && it.hoursTotal > 0 ? t('quotes.approxPrintLeadTime', { time: dur(it.hoursTotal * 3600) }) : ''}</div></td><td className="r">{it.qty}</td><td className="r">{money(Math.round(tot / Math.max(1, it.qty)))}</td><td className="r">{money(tot)}</td></tr>); })}</tbody></table>
        {items.some((i) => i.optional) && <div className="muted" style={{ marginTop: 8 }}>{t('quotes.optionalNotIncludedInThe')} {items.filter((i) => i.optional).map((i) => `${i.description} ${money((i.finalUnit ?? i.suggestedUnit) * i.qty)}`).join(' · ')}</div>}
        <table className="tot" style={{ width: 260, marginLeft: 'auto', marginTop: 12 }}><tbody>
          {q.discount > 0 && <tr><td>{t('common.discount')}</td><td className="r">−{money(q.discount)}</td></tr>}
          <tr><td>{st.rates.taxMode === 'incluido' ? t('quotes.vatIncluded', { pct: st.rates.taxPct }) : 'IVA'}</td><td className="r">{money(q.taxAmount)}</td></tr>
          <tr><td className="big">{t('common.total')}</td><td className="r big">{money(q.total)}</td></tr></tbody></table>
        {pdfLinks.length > 0 && <div style={{ marginTop: 14 }}><b>{t('quotes.references')}</b><ul>{pdfLinks.map((l) => <li key={l.id}>{l.title ?? l.url} — {l.url}</li>)}</ul></div>}
        {q.notes && <div style={{ marginTop: 10 }}><b>{t('common.notes')}</b><div className="muted" style={{ whiteSpace: 'pre-wrap' }}>{q.notes}</div></div>}
        <div className="muted" style={{ marginTop: 18, fontSize: 10 }}><b>{t('quotes.terms')}</b> {st.templates.terms}</div>
      </div>
  );
}
