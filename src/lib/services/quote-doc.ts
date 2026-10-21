import type { loadQuote } from './quotes';
import type { AppSettings } from '../settings';
import type { QuoteDocData } from '@/components/quote-document';
import { createT, type TFn } from '@/i18n/translate';
import { getLocale } from '@/i18n/server';
import { isLocale, type Locale } from '@/i18n/config';
import { dur } from '../format';
import { normalizeTemplate } from '../documents';

/** Lo que se congela al enviar, junto a la plantilla: datos del taller (con su logo), condiciones e idioma, tal como los recibió el cliente. */
export interface DocSnapshot { shop: Omit<QuoteDocData['shop'], 'logoUrl'> & { logoKey?: string }; terms: string; lang?: Locale }
export const docSnapshot = (st: AppSettings): DocSnapshot => ({
  shop: { name: st.shop.name, legalName: st.shop.legalName, taxId: st.shop.taxId, address: st.shop.address, phone: st.shop.phone, email: st.shop.email, brandColor: st.shop.brandColor, logoKey: st.shop.logoKey },
  terms: st.templates.terms,
});

/** Plantilla + copia de los datos del taller e idioma de quien envía/aprueba: se guarda en quotes.docTemplate y ya no cambia. */
export async function freezeDoc(st: AppSettings): Promise<Record<string, unknown>> {
  return { ...normalizeTemplate(st.documents.quote), snapshot: { ...docSnapshot(st), lang: await getLocale() } };
}

/** Traductor del documento: un presupuesto congelado sale en el idioma con que se envió; si no, en el de quien lo mira. */
export function docT(q: { docTemplate: unknown }, t: TFn): TFn {
  const lang = (q.docTemplate as any)?.snapshot?.lang;
  return isLocale(lang) ? createT(lang) : t;
}

/** % de IVA con que se calculó el presupuesto (el de Configuración puede haber cambiado después). */
export function quoteTaxPct(q: { total: number; taxAmount: number; calc?: unknown }, st: AppSettings): number {
  // guardado al calcular; los presupuestos antiguos lo deducen del propio IVA
  const saved = (q.calc as any)?.totals?.taxPct; if (typeof saved === 'number') return saved;
  const net = q.total - q.taxAmount;
  return net > 0 && Math.round((net * st.rates.taxPct) / 100) !== q.taxAmount ? Math.round((q.taxAmount / net) * 100) : st.rates.taxPct;
}

/** Colores de una línea para el documento del cliente: solo cuando tiene colores adicionales (el color principal y luego los demás, sin porcentajes ni costos). */
function colorsOfItem(it: { color: string | null; materialId: string | null; calcOpts: unknown }, matOf: Map<string, { type: string; colorName: string; generic: boolean }>): string | null {
  const extras = (((it.calcOpts as any)?.colors ?? []) as Array<{ materialId: string; color?: string }>); if (!extras.length) return null;
  const name = (id: string | null, color?: string | null) => { const m = id ? matOf.get(id) : undefined; return (color || (m && !m.generic ? m.colorName : '') || (m ? m.type : '') || '').trim(); };
  const list = [name(it.materialId, it.color), ...extras.map((c) => name(c.materialId, c.color))].filter(Boolean);
  return [...new Set(list)].join(' · ') || null;
}

/** Datos del documento de cliente a partir de un presupuesto: solo lo que el cliente puede ver (sin costos ni precio sugerido). */
export function buildQuoteDoc(d: NonNullable<Awaited<ReturnType<typeof loadQuote>>>, st: AppSettings, t: TFn): QuoteDocData {
  const { quote: q, items, models, links, materials } = d; const matOf = new Map((materials ?? []).map((m) => [m.id, m]));
  const lt = ((q.calc as any)?.lines ?? []) as Array<{ id: string; finalTotal: number }>;
  // enviado: datos del taller congelados al enviar; borrador (o enviado antes de existir la copia): los vigentes
  const snap = ((q.docTemplate as any)?.snapshot ?? docSnapshot(st)) as DocSnapshot;
  const docItems = items.map((it) => {
    const unit = it.finalUnit ?? it.suggestedUnit; const total = lt.find((x) => x.id === it.id)?.finalTotal ?? unit * it.qty;
    const lineTotal = it.optional ? unit * it.qty : total; const qty = Math.max(1, it.qty);
    return {
      id: it.id, description: it.description, groupName: it.groupName, qty: it.qty, unitPrice: lineTotal % qty === 0 ? lineTotal / qty : null, total: lineTotal, optional: it.optional,
      leadTime: !it.variantId && it.hoursTotal > 0 ? t('quotes.approxPrintLeadTime', { time: dur(it.hoursTotal * 3600) }) : null,
      colors: colorsOfItem(it, matOf),
      models: models.filter((m) => m.qm.quoteItemId === it.id).map((m) => ({ name: m.name, thumbUrl: m.thumb ? `/api/files/v/${m.qm.fileVersionId ?? ''}/thumb` : null })),
    };
  });
  // el despacho suma al neto (calcQuote) aunque no esté en el total de ninguna línea: se muestra aparte para que el documento cuadre
  const active = items.filter((i) => !i.optional); const shipping = active.reduce((a, i) => a + i.shipping, 0);
  const subtotal = docItems.filter((i) => !i.optional).reduce((a, i) => a + i.total, 0) + shipping;
  const net = q.total - q.taxAmount; const pct = quoteTaxPct(q, st);
  const { logoKey, ...shop } = snap.shop;
  return {
    shop: { ...shop, logoUrl: logoKey ? `/api/branding/logo?k=${encodeURIComponent(logoKey)}` : null },
    quote: { number: q.number, version: q.version, createdAt: q.createdAt, validUntil: q.validUntil, customerName: q.customerName, customerPhone: q.customerPhone, title: q.title, discount: Math.min(q.discount, subtotal), shipping, total: q.total, taxAmount: q.taxAmount, notes: q.notes },
    items: docItems,
    links: links.filter((l) => l.showInPdf).map((l) => ({ id: l.id, title: l.title, url: l.url })),
    tax: q.applyTax ? { label: t('quotes.plusVat', { pct }), showRow: true, netAmount: net } : { label: t('quotes.noVat'), showRow: false, netAmount: null },
    terms: snap.terms,
  };
}
