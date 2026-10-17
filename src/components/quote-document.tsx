import type { CSSProperties } from 'react';
import type { TFn } from '@/i18n/translate';
import { dmy, money } from '@/lib/format';
import { DOC_FONTS, fillVars, isCustomId, normalizeTemplate, type DocTemplate } from '@/lib/documents';

export interface QuoteDocItem { id: string; description: string; groupName?: string | null; qty: number; /** null cuando total/qty no es entero: se imprime «≈ unitario redondeado», nunca un cant. × precio ≠ total que parezca exacto */ unitPrice: number | null; total: number; optional: boolean; leadTime?: string | null; models: Array<{ name: string; thumbUrl?: string | null }> }
export interface QuoteDocData {
  shop: { name: string; legalName: string; taxId: string; address: string; phone: string; email: string; brandColor: string; logoUrl?: string | null };
  quote: { number: string; version: number; createdAt: Date | string; validUntil: Date | string | null; customerName: string | null; customerPhone: string | null; title: string | null; discount: number; /** despacho de las líneas incluidas: suma al neto aunque no figure en ninguna línea */ shipping: number; total: number; taxAmount: number; notes: string | null };
  items: QuoteDocItem[];
  links: Array<{ id: string; title: string | null; url: string }>;
  tax: { label: string; showRow: boolean; netAmount: number | null };
  terms: string;
}

/** Documento de cliente del presupuesto. Presentacional puro: lo usan la vista cliente, el PDF y la vista previa de Configuración. Sin costos internos ni precio sugerido. */
export function QuoteDocument({ data, template, t }: { data: QuoteDocData; template: Partial<DocTemplate> | DocTemplate; t: TFn }) {
  const tpl = normalizeTemplate(template); const { shop, quote: q } = data;
  const brand = tpl.theme.brandColor || shop.brandColor || '#c13d0b';
  const vars = { cliente: q.customerName ?? '', numero: q.number, total: money(q.total), vigencia: q.validUntil ? dmy(q.validUntil) : '', taller: shop.name };
  const sec = (id: string) => tpl.sections.find((s) => s.id === id)!;
  const customBlock = (s: DocTemplate['sections'][number]) => (s.title || s.text ? <div key={s.id} data-section={s.id} style={{ marginTop: 10 }}>{s.title && <b>{fillVars(s.title, vars)}</b>}<div style={{ ...muted, whiteSpace: 'pre-wrap' }}>{fillVars(s.text, vars)}</div></div> : null);
  const title = (id: string, fallback: string) => fillVars(sec(id).title || fallback, vars);
  const items = data.items.filter((i) => !i.optional); const optionals = data.items.filter((i) => i.optional);
  const th: CSSProperties = { textAlign: 'left', fontSize: 10, textTransform: 'uppercase', color: '#64748b', borderBottom: `2px solid ${brand}`, padding: 6 };
  const td: CSSProperties = { padding: '8px 6px', borderBottom: '1px solid #eef2f7', verticalAlign: 'top' };
  const r: CSSProperties = { textAlign: 'right' };
  const muted: CSSProperties = { color: '#64748b' };
  const box: CSSProperties = { border: '1px solid #e2e8f0', borderRadius: 8, padding: '10px 12px' };
  const blocks: Record<string, React.ReactNode> = {
    customer: <div key="customer" data-section="customer" style={{ ...box, marginBottom: 14 }}><b>{q.customerName ?? t('common.customer')}</b>{q.customerPhone ? ` · ${q.customerPhone}` : ''}{q.title && <div style={muted}>{q.title}</div>}{sec('customer').text && <div style={{ ...muted, whiteSpace: 'pre-wrap' }}>{fillVars(sec('customer').text, vars)}</div>}</div>,
    items: <div key="items" data-section="items"><table style={{ width: '100%', borderCollapse: 'collapse' }}><thead><tr><th style={th}>{title('items', t('common.details'))}</th><th style={{ ...th, ...r }}>{t('common.qty')}</th><th style={{ ...th, ...r }}>{t('common.unitPrice')}</th><th style={{ ...th, ...r }}>{t('common.total')}</th></tr></thead>
      <tbody>{items.map((it) => (
        <tr key={it.id}><td style={td}>{tpl.theme.showThumbs && it.models.slice(0, 2).map((m, i) => m.thumbUrl ? /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} alt="" src={m.thumbUrl} style={{ width: 54, height: 40, objectFit: 'cover', borderRadius: 4, marginRight: 6, verticalAlign: 'middle' }} /> : null)}<b>{it.description || t('quotes.n3dPrintedPart')}</b>{it.groupName && <span style={muted}> · {it.groupName}</span>}
          <div style={muted}>{[tpl.options.showModelNames && it.models.map((m) => m.name).join(', '), tpl.options.showLeadTime && it.leadTime].filter(Boolean).join(' · ')}</div></td>
          <td style={{ ...td, ...r }}>{it.qty}</td><td style={{ ...td, ...r }}>{it.unitPrice != null ? money(it.unitPrice) : <span style={muted}>≈ {money(Math.round(it.total / Math.max(1, it.qty)))}</span>}</td><td style={{ ...td, ...r }}>{money(it.total)}</td></tr>))}</tbody></table>
      {sec('items').text && <div style={{ ...muted, marginTop: 6, whiteSpace: 'pre-wrap' }}>{fillVars(sec('items').text, vars)}</div>}</div>,
    optionals: optionals.length ? <div key="optionals" data-section="optionals" style={{ ...muted, marginTop: 8 }}>{title('optionals', t('quotes.optionalNotIncludedInThe'))} {optionals.map((i) => `${i.description} ${money(i.total)}`).join(' · ')}</div> : null,
    totals: <table key="totals" data-section="totals" style={{ width: 260, marginLeft: 'auto', marginTop: 12, borderCollapse: 'collapse' }}><tbody>
      {q.shipping > 0 && <tr><td style={{ padding: '3px 6px' }}>{t('common.shipping')}</td><td style={{ ...r, padding: '3px 6px' }}>{money(q.shipping)}</td></tr>}
      {q.discount > 0 && <tr><td style={{ padding: '3px 6px' }}>{t('common.discount')}</td><td style={{ ...r, padding: '3px 6px' }}>−{money(q.discount)}</td></tr>}
      {data.tax.netAmount != null && <tr><td style={{ padding: '3px 6px' }}>{t('quotes.netAmount')}</td><td style={{ ...r, padding: '3px 6px' }}>{money(data.tax.netAmount)}</td></tr>}
      <tr><td style={{ padding: '3px 6px' }}>{data.tax.label}</td><td style={{ ...r, padding: '3px 6px', ...(data.tax.showRow ? {} : muted) }}>{data.tax.showRow ? money(q.taxAmount) : '—'}</td></tr>
      <tr><td style={{ padding: '3px 6px', fontSize: 16, fontWeight: 700 }}>{t('common.total')}</td><td style={{ ...r, padding: '3px 6px', fontSize: 16, fontWeight: 700, color: brand }}>{money(q.total)}</td></tr></tbody></table>,
    references: data.links.length ? <div key="references" data-section="references" style={{ marginTop: 14 }}><b>{title('references', t('quotes.references'))}</b><ul>{data.links.map((l) => <li key={l.id}>{l.title ?? l.url} — {l.url}</li>)}</ul></div> : null,
    notes: q.notes || sec('notes').text ? <div key="notes" data-section="notes" style={{ marginTop: 10 }}><b>{title('notes', t('common.notes'))}</b><div style={{ ...muted, whiteSpace: 'pre-wrap' }}>{[q.notes, fillVars(sec('notes').text, vars)].filter(Boolean).join('\n')}</div></div> : null,
    terms: sec('terms').text || data.terms ? <div key="terms" data-section="terms" style={{ ...muted, marginTop: 18, fontSize: 10 }}><b>{title('terms', t('quotes.terms'))}</b> {fillVars(sec('terms').text || data.terms, vars)}</div> : null,
  };
  return (
    <div className="quote-doc" style={{ fontFamily: DOC_FONTS[tpl.theme.font], color: '#0f172a', padding: '28px 34px', fontSize: 12, background: '#fff' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18, gap: 16, borderTop: `4px solid ${brand}`, paddingTop: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
          {tpl.theme.showLogo && shop.logoUrl && /* eslint-disable-next-line @next/next/no-img-element */ <img alt="" src={shop.logoUrl} style={{ maxHeight: 56, maxWidth: 140, objectFit: 'contain' }} />}
          <div><h1 style={{ color: brand, fontSize: 22, margin: 0 }}>{shop.name}</h1><div style={muted}>{shop.legalName} {shop.taxId && `· ${shop.taxId}`}<br />{shop.address} {shop.phone} {shop.email}</div></div>
        </div>
        <div style={r}><div style={{ fontSize: 16, fontWeight: 700 }}>{t('common.quote')} {q.number}{q.version > 1 ? ` (v${q.version})` : ''}</div><div style={muted}>{t('quotes.dateLabel', { date: dmy(q.createdAt) })} · {t('quotes.validUntilLabel', { date: dmy(q.validUntil) })}</div>{tpl.header.subtitle && <div style={muted}>{fillVars(tpl.header.subtitle, vars)}</div>}</div>
      </div>
      {tpl.sections.filter((s) => s.visible).map((s) => (isCustomId(s.id) ? customBlock(s) : blocks[s.id] ?? null))}
      {tpl.footer && <div style={{ ...muted, marginTop: 18, fontSize: 10, textAlign: 'center', borderTop: '1px solid #e2e8f0', paddingTop: 8, whiteSpace: 'pre-wrap' }}>{fillVars(tpl.footer, vars)}</div>}
    </div>
  );
}
