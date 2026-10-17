import type { loadQuote } from './quotes';
import type { AppSettings } from '../settings';
import type { QuoteDocData } from '@/components/quote-document';
import type { TFn } from '@/i18n/translate';
import { dur } from '../format';

/** % de IVA con que se calculó el presupuesto (el de Configuración puede haber cambiado después). */
export function quoteTaxPct(q: { total: number; taxAmount: number }, st: AppSettings): number {
  const net = q.total - q.taxAmount;
  return net > 0 && Math.round((net * st.rates.taxPct) / 100) !== q.taxAmount ? Math.round((q.taxAmount / net) * 100) : st.rates.taxPct;
}

/** Datos del documento de cliente a partir de un presupuesto: solo lo que el cliente puede ver (sin costos ni precio sugerido). */
export function buildQuoteDoc(d: NonNullable<Awaited<ReturnType<typeof loadQuote>>>, st: AppSettings, t: TFn): QuoteDocData {
  const { quote: q, items, models, links } = d;
  const lt = ((q.calc as any)?.lines ?? []) as Array<{ id: string; finalTotal: number }>;
  const docItems = items.map((it) => {
    const unit = it.finalUnit ?? it.suggestedUnit; const total = lt.find((x) => x.id === it.id)?.finalTotal ?? unit * it.qty;
    const lineTotal = it.optional ? unit * it.qty : total; const qty = Math.max(1, it.qty);
    return {
      id: it.id, description: it.description, groupName: it.groupName, qty: it.qty, unitPrice: lineTotal % qty === 0 ? lineTotal / qty : null, total: lineTotal, optional: it.optional,
      leadTime: !it.variantId && it.hoursTotal > 0 ? t('quotes.approxPrintLeadTime', { time: dur(it.hoursTotal * 3600) }) : null,
      models: models.filter((m) => m.qm.quoteItemId === it.id).map((m) => ({ name: m.name, thumbUrl: m.thumb ? `/api/files/v/${m.qm.fileVersionId ?? ''}/thumb` : null })),
    };
  });
  // el despacho suma al neto (calcQuote) aunque no esté en el total de ninguna línea: se muestra aparte para que el documento cuadre
  const active = items.filter((i) => !i.optional); const shipping = active.reduce((a, i) => a + i.shipping, 0);
  const subtotal = docItems.filter((i) => !i.optional).reduce((a, i) => a + i.total, 0) + shipping;
  const net = q.total - q.taxAmount; const pct = quoteTaxPct(q, st);
  return {
    shop: { name: st.shop.name, legalName: st.shop.legalName, taxId: st.shop.taxId, address: st.shop.address, phone: st.shop.phone, email: st.shop.email, brandColor: st.shop.brandColor, logoUrl: st.shop.logoKey ? '/api/branding/logo' : null },
    quote: { number: q.number, version: q.version, createdAt: q.createdAt, validUntil: q.validUntil, customerName: q.customerName, customerPhone: q.customerPhone, title: q.title, discount: Math.min(q.discount, subtotal), shipping, total: q.total, taxAmount: q.taxAmount, notes: q.notes },
    items: docItems,
    links: links.filter((l) => l.showInPdf).map((l) => ({ id: l.id, title: l.title, url: l.url })),
    tax: q.applyTax ? { label: t('quotes.plusVat', { pct }), showRow: true, netAmount: net } : { label: t('quotes.noVat'), showRow: false, netAmount: null },
    terms: st.templates.terms,
  };
}
