/**
 * Motor de precios (sección 3 de la spec). Funciones puras, sin acceso a base de datos.
 * El sistema calcula un PRECIO SUGERIDO; el precio final siempre lo decide el usuario (sección 4.1).
 */
export interface Rates {
  kwh: number;              // CLP por kWh
  laborHour: number;        // CLP por hora de mano de obra
  wastePct: number;         // desperdicio (purga, soportes, falda)
  failRatePct: number;      // tasa de falla por defecto
  marginPct: number;        // margen sobre costo
  marginByCategory?: Record<string, number>;
  minPrice: number;         // precio mínimo por línea
  minMarginPct: number;     // alerta bajo este margen
  rounding: { mode: 'none' | 'step' | 'ending990'; step: number };
  taxPct: number;
  taxMode: 'incluido' | 'sumado' | 'exento';
  urgency: Array<{ key: string; label: string; pct: number }>;
  volumeTiers: Array<{ minQty: number; pct: number }>; // pct negativo = descuento
  prepMinutes: number;
  /**
   * 'heredado': comportamiento histórico (margen = recargo sobre el costo, IVA incluido/sumado según taxMode).
   * 'neto': costos y precios netos de IVA, margen sobre la venta neta (precio = costo / (1 − margen)), falla con encogimiento
   * y tiempo calibrado en todos los modos; el IVA es una casilla del presupuesto (spec de calculadora, fase 1).
   */
  pricingModel?: 'heredado' | 'neto';
  /** Valor inicial de la casilla «+ IVA» en presupuestos nuevos (modelo 'neto'). */
  taxDefault?: boolean;
}

export interface MachineCost {
  purchaseValue: number; residualValue: number; lifeHours: number; watts: number; maintCostHour: number;
  failRatePct?: number | null; timeFactor?: number;
}

export interface LineInput {
  qty: number;
  gramsTotal: number;    // gramos para TODAS las unidades de la línea
  hoursTotal: number;    // horas de impresión para TODAS las unidades (cotizadas por placa, no multiplicadas)
  costPerKg: number;     // costo promedio del material
  machine: MachineCost | null;
  prepMinutes?: number;
  postMinutesPerUnit?: number;
  postSuppliesPerUnit?: number;
  shipping?: number;
  urgency?: string;
  category?: string;
  applyTimeFactor?: boolean;
}

export interface CostBreakdown {
  material: number; machine: number; energy: number; prep: number; post: number; failure: number;
  cost: number;           // suma de los seis costos
  marginPct: number;
  urgencyPct: number;
  volumePct: number;
  priceBeforeRound: number;
  suggestedTotal: number; // total sugerido de la línea (sin envío)
  suggestedUnit: number;
  shipping: number;
  hoursEffective: number;
  gramsEffective: number;
  /** Datos que faltan y vuelven poco confiable el precio: material sin costo, máquina sin valor de compra o potencia (CAL-12, CAL-16). */
  warnings?: Array<'materialCostZero' | 'machineIncomplete' | 'noMachine'>;
}

export function roundPrice(v: number, r: Rates['rounding']): number {
  if (!isFinite(v)) return 0;
  if (r.mode === 'none') return Math.round(v);
  if (r.mode === 'step') { const st = Math.max(1, r.step || 10); return Math.max(0, Math.round(v / st) * st); }
  // termina en 990: el 990 más cercano
  const base = Math.round((v - 990) / 1000) * 1000 + 990;
  return Math.max(990, base);
}

export function volumePct(qty: number, tiers: Rates['volumeTiers']): number {
  let pct = 0;
  for (const t of [...tiers].sort((a, b) => a.minQty - b.minQty)) if (qty >= t.minQty) pct = t.pct;
  return pct;
}

export function machineHourly(m: MachineCost | null, kwh: number) {
  if (!m) return { dep: 0, maint: 0, energy: 0 };
  const dep = m.lifeHours > 0 ? Math.max(0, m.purchaseValue - m.residualValue) / m.lifeHours : 0;
  return { dep, maint: m.maintCostHour || 0, energy: (m.watts / 1000) * kwh };
}

export function calcLine(i: LineInput, rt: Rates): CostBreakdown {
  const neto = rt.pricingModel === 'neto';
  const qty = Math.max(1, Math.floor(i.qty || 1));
  const waste = rt.wastePct / 100;
  const gramsEff = Math.max(0, i.gramsTotal) * (1 + waste);
  // CAL-10: el factor de tiempo (calibrado con el historial) se aplica en los tres modos de entrada; en el modelo histórico solo si se pide
  const factor = (neto || i.applyTimeFactor) && i.machine?.timeFactor ? i.machine.timeFactor : 1;
  const hoursEff = Math.max(0, i.hoursTotal) * factor;
  const hr = machineHourly(i.machine, rt.kwh);
  const material = (gramsEff / 1000) * i.costPerKg;
  const machine = hoursEff * (hr.dep + hr.maint);
  const energy = hoursEff * hr.energy;
  const prep = ((i.prepMinutes ?? rt.prepMinutes) / 60) * rt.laborHour;
  const post = (((i.postMinutesPerUnit ?? 0) * qty) / 60) * rt.laborHour + (i.postSuppliesPerUnit ?? 0) * qty;
  // CAL-17: con pocas muestras la tasa nunca baja de un piso; el modelo 'neto' además usa f/(1−f): para entregar una pieza buena hay que imprimir 1/(1−f) piezas
  const failRate = Math.min(0.9, (i.machine?.failRatePct ?? rt.failRatePct) / 100);
  const base = material + machine + energy;
  const failure = neto ? (base * failRate) / (1 - failRate) : failRate * base;
  const cost = base + prep + post + failure;
  const marginPct: number = (i.category ? rt.marginByCategory?.[i.category] : undefined) ?? rt.marginPct;
  const urg = rt.urgency.find((u) => u.key === (i.urgency ?? 'normal'))?.pct ?? 0;
  const vol = volumePct(qty, rt.volumeTiers);
  // modelo 'neto': el margen es un porcentaje de la venta neta (tope 90 % para no dividir por ~0)
  let price = neto ? (cost / (1 - Math.min(0.9, Math.max(0, marginPct / 100)))) * (1 + urg / 100) * (1 + vol / 100)
    : cost * (1 + marginPct / 100) * (1 + urg / 100) * (1 + vol / 100);
  price = Math.max(price, rt.minPrice);
  const suggestedUnit = roundPrice(price / qty, rt.rounding);
  const warnings: NonNullable<CostBreakdown['warnings']> = [];
  if (neto) {
    if (!(i.costPerKg > 0) && i.gramsTotal > 0) warnings.push('materialCostZero');
    if (!i.machine) warnings.push('noMachine'); else if (!(i.machine.purchaseValue > 0) || !(i.machine.watts > 0)) warnings.push('machineIncomplete');
  }
  return {
    material: Math.round(material), machine: Math.round(machine), energy: Math.round(energy),
    prep: Math.round(prep), post: Math.round(post), failure: Math.round(failure),
    cost: Math.round(cost), marginPct, urgencyPct: urg, volumePct: vol, priceBeforeRound: Math.round(price),
    suggestedUnit, suggestedTotal: suggestedUnit * qty, shipping: i.shipping ?? 0,
    hoursEffective: hoursEff, gramsEffective: gramsEff, ...(neto ? { warnings } : {}),
  };
}

/* ───────── Totales de presupuesto con precio final decidido por el usuario ───────── */
export interface QuoteLine {
  id: string; qty: number; optional?: boolean;
  suggestedUnit: number; finalUnit: number | null; cost: number; shipping?: number;
}
export interface QuoteTotals {
  lines: Array<{ id: string; suggestedTotal: number; finalTotal: number; cost: number; marginPct: number | null; diffPct: number; belowCost: boolean; belowMin: boolean }>;
  suggestedTotal: number; subtotal: number; discount: number; net: number; tax: number; total: number; cost: number;
  marginPct: number | null; diffPct: number; belowCost: boolean; belowMin: boolean;
}

/**
 * finalTotalOverride: si el usuario fija el TOTAL del presupuesto, se reparte entre las líneas
 * en proporción a su precio sugerido para poder calcular el margen de cada una.
 */
/** Modo de IVA efectivo: en el modelo 'neto' lo decide la casilla del presupuesto; en el histórico, la configuración. */
export function effectiveTaxMode(rt: Rates, applyTax?: boolean): Rates['taxMode'] {
  return rt.pricingModel === 'neto' ? (applyTax ? 'sumado' : 'exento') : rt.taxMode;
}
/** Neto de un importe cobrado. En el modelo 'neto' el IVA cobrado se guarda aparte (taxAmount); en el histórico se deduce de la configuración. */
export function netOfGross(gross: number, rt: Rates, taxAmount = 0): number {
  if (rt.pricingModel === 'neto') return gross - taxAmount;
  return rt.taxMode === 'incluido' ? gross / (1 + rt.taxPct / 100) : gross;
}

export function calcQuote(lines: QuoteLine[], rt0: Rates, opts: { discount?: number; finalTotalOverride?: number | null; applyTax?: boolean } = {}): QuoteTotals {
  const rt: Rates = rt0.pricingModel === 'neto' ? { ...rt0, taxMode: effectiveTaxMode(rt0, opts.applyTax) } : rt0;
  const active = lines.filter((l) => !l.optional);
  const sugTotals = active.map((l) => l.suggestedUnit * l.qty);
  const sugSum = sugTotals.reduce((a, b) => a + b, 0);
  let finals = active.map((l) => (l.finalUnit != null ? l.finalUnit * l.qty : l.suggestedUnit * l.qty));
  const shipping = active.reduce((a, l) => a + (l.shipping ?? 0), 0);
  if (opts.finalTotalOverride != null && opts.finalTotalOverride >= 0) {
    const target = opts.finalTotalOverride - shipping;
    let acc = 0;
    finals = active.map((l, idx) => {
      const share = sugSum > 0 ? sugTotals[idx] / sugSum : 1 / active.length;
      const v = idx === active.length - 1 ? target - acc : Math.round(target * share);
      acc += v; return v;
    });
  }
  const out = active.map((l, idx) => {
    const finalTotal = finals[idx];
    const net = rt.taxMode === 'incluido' ? finalTotal / (1 + rt.taxPct / 100) : finalTotal;
    const marginPct = net > 0 ? ((net - l.cost) / net) * 100 : null;
    const diffPct = sugTotals[idx] > 0 ? ((finalTotal - sugTotals[idx]) / sugTotals[idx]) * 100 : 0;
    return {
      id: l.id, suggestedTotal: sugTotals[idx], finalTotal, cost: l.cost, marginPct, diffPct,
      belowCost: net < l.cost, belowMin: marginPct != null && marginPct < rt.minMarginPct,
    };
  });
  const subtotal = out.reduce((a, l) => a + l.finalTotal, 0) + shipping;
  const discount = Math.min(opts.discount ?? 0, subtotal);
  const afterDiscount = subtotal - discount;
  let net = afterDiscount, tax = 0, total = afterDiscount;
  if (rt.taxMode === 'incluido') { net = Math.round(afterDiscount / (1 + rt.taxPct / 100)); tax = afterDiscount - net; }
  else if (rt.taxMode === 'sumado') { tax = Math.round(afterDiscount * rt.taxPct / 100); total = afterDiscount + tax; }
  const cost = out.reduce((a, l) => a + l.cost, 0);
  const marginPct = net > 0 ? ((net - shipping - cost) / (net - shipping || 1)) * 100 : null;
  const suggestedTotal = sugSum + shipping;
  return {
    lines: out, suggestedTotal, subtotal, discount, net, tax, total, cost, marginPct,
    diffPct: suggestedTotal > 0 ? ((subtotal - suggestedTotal) / suggestedTotal) * 100 : 0,
    belowCost: net - shipping < cost, belowMin: marginPct != null && marginPct < rt.minMarginPct,
  };
}

/** Estimación desde la malla (modo "estimado"): gramos = (cáscara + interior × relleno) × densidad. */
export function estimateFromMesh(o: { volumeCm3: number; areaCm2: number; infillPct: number; wallMm?: number; density: number; feedGph: number }) {
  const wall = o.wallMm ?? 1.2;
  const shell = Math.min(o.volumeCm3, (o.areaCm2 * wall) / 10);  // cm³ de cáscara
  const inner = Math.max(0, o.volumeCm3 - shell);
  const grams = (shell + inner * (o.infillPct / 100)) * o.density;
  return { grams, hours: grams / Math.max(1, o.feedGph) };
}
