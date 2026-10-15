import { loadQuote } from './quotes';
import type { AppSettings } from '../settings';
import type { QuoteDocData } from '@/components/quote-document';
import type { TFn } from '@/i18n/translate';
import { dur } from '../format';

/** Datos del documento de cliente a partir de un presupuesto: solo lo que el cliente puede ver (sin costos ni precio sugerido). */
export function buildQuoteDoc(d: NonNullable<Awaited<ReturnType<typeof loadQuote>>>, st: AppSettings, t: TFn): QuoteDocData {
  const { quote: q, items, models, links } = d;
  const lt = ((q.calc as any)?.lines ?? []) as Array<{ id: string; finalTotal: number }>;
  return {
    shop: { name: st.shop.name, legalName: st.shop.legalName, taxId: st.shop.taxId, address: st.shop.address, phone: st.shop.phone, email: st.shop.email, brandColor: st.shop.brandColor, logoUrl: st.shop.logoKey ? '/api/branding/logo' : null },
    quote: { number: q.number, version: q.version, createdAt: q.createdAt, validUntil: q.validUntil, customerName: q.customerName, customerPhone: q.customerPhone, title: q.title, discount: q.discount, total: q.total, taxAmount: q.taxAmount, notes: q.notes },
    items: items.map((it) => {
      const unit = it.finalUnit ?? it.suggestedUnit; const total = lt.find((x) => x.id === it.id)?.finalTotal ?? unit * it.qty;
      return {
        id: it.id, description: it.description, groupName: it.groupName, qty: it.qty, unitPrice: Math.round(total / Math.max(1, it.qty)), total: it.optional ? unit * it.qty : total, optional: it.optional,
        leadTime: !it.variantId && it.hoursTotal > 0 ? t('quotes.approxPrintLeadTime', { time: dur(it.hoursTotal * 3600) }) : null,
        models: models.filter((m) => m.qm.quoteItemId === it.id).map((m) => ({ name: m.name, thumbUrl: m.thumb ? `/api/files/v/${m.qm.fileVersionId ?? ''}/thumb` : null })),
      };
    }),
    links: links.filter((l) => l.showInPdf).map((l) => ({ id: l.id, title: l.title, url: l.url })),
    tax: q.applyTax ? { label: t('quotes.plusVat', { pct: st.rates.taxPct }), showRow: true, netAmount: q.total - q.taxAmount } : { label: t('quotes.noVat'), showRow: false, netAmount: null },
    terms: st.templates.terms,
  };
}
