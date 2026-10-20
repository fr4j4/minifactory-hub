/**
 * Motor de precios (sección 3 de la spec). Funciones puras, sin acceso a base de datos.
 * El sistema calcula un PRECIO SUGERIDO; el precio final siempre lo decide el usuario (sección 4.1).
 *
 * Todo lo que agrega la calculadora v2 (costos fijos, pisos, perfiles, comisiones, riesgo, bandas…) es OPCIONAL: mientras una tarifa
 * no se configure, el resultado es exactamente el del cálculo anterior (neto, margen sobre la venta, falla f/(1−f)).
 */
export type DeepPartial<T> = { [K in keyof T]?: NonNullable<T[K]> extends Array<any> ? T[K] : NonNullable<T[K]> extends object ? DeepPartial<NonNullable<T[K]>> : T[K] };

export interface FixedCost { id?: string; label: string; amount: number }
export interface ComplexityTag { key: string; label: string; factor: number }
export interface Benchmark { id: string; name: string; tech?: string; material?: string; perGram?: number; perHour?: number; price?: number; grams?: number; hours?: number; date?: string; source?: string }

export interface Rates {
  kwh: number;              // CLP por kWh
  laborHour: number;        // CLP por hora de mano de obra
  wastePct: number;         // desperdicio (purga, soportes, falda)
  failRatePct: number;      // tasa de falla por defecto
  marginPct: number;        // margen sobre la venta neta
  marginByCategory?: Record<string, number>;
  minPrice: number;         // precio mínimo por línea
  minMarginPct: number;     // alerta bajo este margen
  rounding: { mode: 'none' | 'step' | 'ending990'; step: number };
  taxPct: number;
  /** Lo decide la casilla «+ IVA» de cada presupuesto (ver effectiveTaxMode); este valor es solo el de partida. */
  taxMode: 'sumado' | 'exento';
  urgency: Array<{ key: string; label: string; pct: number }>;
  volumeTiers: Array<{ minQty: number; pct: number }>; // pct negativo = descuento
  prepMinutes: number;      // minutos de preparación (por placa)
  /** Valor inicial de la casilla «+ IVA» en presupuestos nuevos . */
  taxDefault?: boolean;

  /* ── calculadora v2 (todo opcional; sin configurar no cambia ningún precio) ── */
  powerFactor?: number;          // consumo medio / potencia de placa (0–1). Sin dato: 1 (como hasta ahora)
  capitalPct?: number;           // costo de capital anual sobre el valor de compra (%)
  fixedCosts?: FixedCost[];      // costos fijos mensuales del taller
  targetIncomeMonth?: number;    // ingreso mensual objetivo
  productive?: { hoursPerDay: number; daysPerMonth: number; utilizationPct: number };
  machineCount?: number;         // lo completa el servidor (máquinas activas)
  floors?: { perHour: number; perHourAuto: boolean; perGram: number; perOrder: number };
  payFeePct?: number;            // comisión de pasarela / POS (sobre lo cobrado)
  channelFeePct?: number;        // comisión del canal de venta
  supervisionMinPerHour?: number;
  postMinutes?: number;          // postproceso por unidad por defecto
  packPerUnit?: number;          // empaque por unidad (CLP)
  setupHoursPerPlate?: number;   // calentar, nivelar, retirar, enfriar
  colorChangeMin?: number;
  volumeMinMarginPct?: number;   // el descuento por volumen no baja de este margen (0 = sin tope)
  failShrinkK?: number;          // peso del valor por defecto al medir la falla con el historial
  failOnLabor?: boolean;         // la falla también repite la preparación y la supervisión
  riskByMaterial?: Record<string, number>;
  complexityTags?: ComplexityTag[];
  costBasis?: 'promedio' | 'reposicion' | 'max';
  useTimeFactor?: boolean;       // aplica el factor de tiempo de la máquina (por defecto sí)
  estimateErrorPct?: number;     // error esperado de una estimación (rango)
  bandHighPct?: number;          // recargo del precio "alto" sobre el recomendado
  benchmarks?: Benchmark[];
}

/**
 * Valores que se usan cuando una tarifa v2 no está definida: neutros, el resultado es el del cálculo anterior.
 * Los valores recomendados para un taller nuevo viven en `RECOMMENDED_V2` (los aplica el asistente de configuración).
 */
export const PRICING_DEFAULTS = {
  powerFactor: 1, capitalPct: 0, fixedCosts: [] as FixedCost[], targetIncomeMonth: 0,
  productive: { hoursPerDay: 8, daysPerMonth: 22, utilizationPct: 50 }, machineCount: 1,
  floors: { perHour: 0, perHourAuto: true, perGram: 0, perOrder: 0 },
  payFeePct: 0, channelFeePct: 0, supervisionMinPerHour: 0, postMinutes: 0, packPerUnit: 0, setupHoursPerPlate: 0, colorChangeMin: 0,
  volumeMinMarginPct: 0, failShrinkK: 20, failOnLabor: false, riskByMaterial: {} as Record<string, number>, complexityTags: [] as ComplexityTag[],
  costBasis: 'promedio' as const, useTimeFactor: true, estimateErrorPct: 30, bandHighPct: 25, benchmarks: [] as Benchmark[],
};
/** Valores sugeridos de la spec para un taller que parte de cero (los aplica el asistente; no se usan solos). */
export const RECOMMENDED_V2: Partial<Rates> = {
  powerFactor: 0.7, supervisionMinPerHour: 2, setupHoursPerPlate: 0.1, volumeMinMarginPct: 20,
  productive: { hoursPerDay: 8, daysPerMonth: 22, utilizationPct: 50 },
};

export interface MachineCost {
  purchaseValue: number; residualValue: number; lifeHours: number; watts: number; maintCostHour: number;
  failRatePct?: number | null; timeFactor?: number;
  jobsDone?: number; jobsFailed?: number;   // historial para medir falla y calibrar el tiempo
}

export interface LineInput {
  qty: number;
  gramsTotal: number;    // gramos para TODAS las unidades de la línea
  hoursTotal: number;    // horas de impresión para TODAS las unidades (cotizadas por placa, no multiplicadas)
  costPerKg: number;     // costo promedio del material
  costPerKgReplace?: number; // costo de reposición (precio de catálogo)
  machine: MachineCost | null;
  prepMinutes?: number;
  postMinutesPerUnit?: number;
  postSuppliesPerUnit?: number;
  shipping?: number;
  urgency?: string;
  category?: string;
  applyTimeFactor?: boolean;
  /* v2 */
  plates?: number;            // placas (por defecto 1)
  designMinutes?: number;
  colorChanges?: number;
  tags?: string[];            // etiquetas de complejidad
  materialType?: string;
  riskFactor?: number;        // factor del material
  wastePct?: number;          // merma propia del material
  filaments?: Array<{ g: number; costPerKg: number; costPerKgReplace?: number }>; // multicolor: un costo por slot
  origin?: 'slicer' | 'file' | 'manual' | 'estimate';
}

export type PriceRule = 'margin' | 'floorHour' | 'floorGram' | 'floorLine' | 'volumeLimited';
export type Confidence = 'alta' | 'media' | 'baja';
/** Avisos de datos que faltan o no cuadran. Los críticos se muestran siempre; el resto, en el nivel Experto. */
export type PriceWarning = 'noMachine' | 'machineNoPurchase' | 'machineNoPower' | 'materialNoCost' | 'noLabor' | 'noFixedCosts' | 'timeUncalibrated' | 'belowBenchmark';

export interface CostBreakdown {
  material: number; machine: number; energy: number; prep: number; post: number; failure: number;
  cost: number;           // suma de todos los costos (sin comisiones)
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
  warnings?: PriceWarning[];
  /* v2 */
  overhead?: number; supervision?: number; design?: number; packaging?: number;
  feesAmount?: number;                 // comisiones de pasarela/canal sobre el precio
  marginReal?: number | null;          // margen real sobre neto, después de comisiones
  rule?: PriceRule; ruleValue?: number; // regla que fijó el precio
  band?: { floor: number; recommended: number; high: number }; // por unidad
  confidence?: Confidence; reliable?: boolean;
  range?: { min: number; max: number } | null; // precio unitario cuando la estimación es incierta
  pricePerHour?: number; pricePerGram?: number;
  benchmark?: { min: number; max: number } | null; // totales de referencia de mercado
}

/* ───────── utilidades ───────── */
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

/** Tarifas con los valores neutros completados (el original no se modifica). */
export function normRates(rt: Rates): Rates & Required<Pick<Rates, keyof typeof PRICING_DEFAULTS>> {
  const d = PRICING_DEFAULTS;
  return {
    ...rt,
    powerFactor: rt.powerFactor ?? d.powerFactor, capitalPct: rt.capitalPct ?? d.capitalPct, fixedCosts: rt.fixedCosts ?? d.fixedCosts, targetIncomeMonth: rt.targetIncomeMonth ?? d.targetIncomeMonth,
    productive: { ...d.productive, ...(rt.productive ?? {}) }, machineCount: Math.max(1, rt.machineCount ?? d.machineCount), floors: { ...d.floors, ...(rt.floors ?? {}) },
    payFeePct: rt.payFeePct ?? d.payFeePct, channelFeePct: rt.channelFeePct ?? d.channelFeePct, supervisionMinPerHour: rt.supervisionMinPerHour ?? d.supervisionMinPerHour,
    postMinutes: rt.postMinutes ?? d.postMinutes, packPerUnit: rt.packPerUnit ?? d.packPerUnit, setupHoursPerPlate: rt.setupHoursPerPlate ?? d.setupHoursPerPlate, colorChangeMin: rt.colorChangeMin ?? d.colorChangeMin,
    volumeMinMarginPct: rt.volumeMinMarginPct ?? d.volumeMinMarginPct, failShrinkK: rt.failShrinkK ?? d.failShrinkK, failOnLabor: rt.failOnLabor ?? d.failOnLabor, riskByMaterial: rt.riskByMaterial ?? d.riskByMaterial,
    complexityTags: rt.complexityTags ?? d.complexityTags, costBasis: rt.costBasis ?? d.costBasis, useTimeFactor: rt.useTimeFactor ?? d.useTimeFactor,
    estimateErrorPct: rt.estimateErrorPct ?? d.estimateErrorPct, bandHighPct: rt.bandHighPct ?? d.bandHighPct, benchmarks: rt.benchmarks ?? d.benchmarks,
  };
}

/* ───────── costos fijos, tarifa de equilibrio y tarifa de máquina ───────── */
export const fixedMonthly = (rt: Rates) => (rt.fixedCosts ?? []).reduce((a, f) => a + Math.max(0, f.amount || 0), 0);
export function hoursPerMachineMonth(rt: Rates) {
  const p = { ...PRICING_DEFAULTS.productive, ...(rt.productive ?? {}) };
  return Math.max(0, p.hoursPerDay * p.daysPerMonth * (p.utilizationPct / 100));
}
/** Costos fijos repartidos entre las horas que de verdad se venden (todas las máquinas). */
export function fixedPerHour(rt: Rates) {
  const h = hoursPerMachineMonth(rt) * Math.max(1, rt.machineCount ?? 1);
  return h > 0 ? fixedMonthly(rt) / h : 0;
}
/** Lo mínimo que debe rendir cada hora de máquina para cubrir los costos fijos y el ingreso objetivo. */
export function breakEvenRate(rt: Rates) {
  const h = hoursPerMachineMonth(rt) * Math.max(1, rt.machineCount ?? 1);
  return h > 0 ? (fixedMonthly(rt) + Math.max(0, rt.targetIncomeMonth ?? 0)) / h : 0;
}
export function hourFloor(rt: Rates) {
  const f = { ...PRICING_DEFAULTS.floors, ...(rt.floors ?? {}) };
  return f.perHourAuto ? breakEvenRate(rt) : f.perHour;
}
export function machineRate(m: MachineCost | null, rt: Rates) {
  const n = normRates(rt);
  const hy = Math.max(1, hoursPerMachineMonth(rt) * 12);
  const fixed = fixedPerHour(rt);
  if (!m) return { dep: 0, maint: 0, capital: 0, energy: 0, fixed, total: fixed };
  const dep = m.lifeHours > 0 ? Math.max(0, m.purchaseValue - m.residualValue) / m.lifeHours : 0;
  const maint = m.maintCostHour || 0;
  const capital = (m.purchaseValue * (n.capitalPct / 100)) / hy;
  const energy = (m.watts / 1000) * n.powerFactor * rt.kwh;
  return { dep, maint, capital, energy, fixed, total: dep + maint + capital + energy + fixed };
}

/* ───────── perfiles de cálculo ───────── */
export interface CalcProfile {
  id: string; name: string; description?: string; params: DeepPartial<Rates>;
  builtin?: boolean; isDefault?: boolean; archived?: boolean; tech?: string;
}
const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
function deepMerge<T>(base: T, over: any): T {
  if (!isObj(base) || !isObj(over)) return (over === undefined ? base : over) as T;
  const out: any = { ...base };
  for (const k of Object.keys(over)) out[k] = isObj((base as any)[k]) && isObj(over[k]) ? deepMerge((base as any)[k], over[k]) : over[k];
  return out;
}
/** tarifas base → perfil → overrides (cada capa posterior gana). Los arreglos se reemplazan completos. */
export function resolveRates(base: Rates, ...layers: Array<DeepPartial<Rates> | undefined | null>): Rates {
  let out = base;
  for (const l of layers) if (l) out = deepMerge(out, l);
  return out;
}
/** Cascada de elección: línea > presupuesto > cliente > canal > categoría > por defecto. */
export function pickProfileId(ids: Array<string | null | undefined>, profiles: CalcProfile[]): string | null {
  const ok = new Set(profiles.filter((p) => !p.archived).map((p) => p.id));
  for (const id of ids) if (id && ok.has(id)) return id;
  return profiles.find((p) => p.isDefault && !p.archived)?.id ?? null;
}

/* ───────── cálculo de una línea ───────── */
const r0 = Math.round;

function benchmarkTotals(rt: Rates, g: number, h: number): number[] {
  const out: number[] = [];
  for (const b of rt.benchmarks ?? []) {
    let v: number | null = null;
    if (b.perGram && g > 0) v = b.perGram * g;
    else if (b.perHour && h > 0) v = b.perHour * h;
    else if (b.price && b.grams && g > 0) v = (b.price / b.grams) * g;
    else if (b.price && b.hours && h > 0) v = (b.price / b.hours) * h;
    if (v != null && isFinite(v) && v > 0) out.push(v);
  }
  return out;
}

export function calcLine(i: LineInput, rt0: Rates): CostBreakdown { return calcLineCore(i, rt0, false); }

function calcLineCore(i: LineInput, rt0: Rates, inner: boolean): CostBreakdown {
  const rt = normRates(rt0);
  const qty = Math.max(1, Math.floor(i.qty || 1));
  const plates = Math.max(1, Math.floor(i.plates ?? 1));
  const warnings: PriceWarning[] = [];

  /* tiempo (CAL-10: el factor calibrado con el historial se aplica en los tres modos de entrada) */
  const H = Math.max(0, i.hoursTotal);
  const tf = rt.useTimeFactor && i.machine?.timeFactor ? i.machine.timeFactor : 1;
  const hoursEff = H * tf + (H > 0 ? plates * rt.setupHoursPerPlate : 0) + ((i.colorChanges ?? 0) * rt.colorChangeMin) / 60;
  if (i.machine && (i.machine.jobsDone ?? 0) < 10 && !inner) warnings.push('timeUncalibrated');

  /* material (multicolor: un costo por slot) */
  const waste = (i.wastePct ?? rt.wastePct) / 100;
  const pick = (avg: number, rep?: number) => (rt.costBasis === 'reposicion' ? (rep || avg) : rt.costBasis === 'max' ? Math.max(avg, rep ?? 0) : avg);
  const fils = i.filaments?.length ? i.filaments : [{ g: Math.max(0, i.gramsTotal), costPerKg: i.costPerKg, costPerKgReplace: i.costPerKgReplace }];
  const G = fils.reduce((a, f) => a + Math.max(0, f.g), 0);
  const gramsEff = G * (1 + waste);
  const material = fils.reduce((a, f) => a + (Math.max(0, f.g) * (1 + waste) / 1000) * pick(f.costPerKg, f.costPerKgReplace), 0);
  if (G > 0 && fils.some((f) => !(f.costPerKg > 0))) warnings.push('materialNoCost');

  /* máquina y costos fijos */
  const mr = machineRate(i.machine, rt);
  const machine = hoursEff * (mr.dep + mr.maint + mr.capital);
  const energy = hoursEff * mr.energy;
  const overhead = hoursEff * mr.fixed;
  if (!i.machine) warnings.push('noMachine');
  else { if (!(i.machine.purchaseValue > 0)) warnings.push('machineNoPurchase'); if (!(i.machine.watts > 0)) warnings.push('machineNoPower'); }
  if (!(rt.laborHour > 0)) warnings.push('noLabor');
  if (fixedMonthly(rt) <= 0) warnings.push('noFixedCosts');

  /* mano de obra */
  const prep = plates * ((i.prepMinutes ?? rt.prepMinutes) / 60) * rt.laborHour;
  const supervision = hoursEff * (rt.supervisionMinPerHour / 60) * rt.laborHour;
  const post = (((i.postMinutesPerUnit ?? rt.postMinutes) * qty) / 60) * rt.laborHour + (i.postSuppliesPerUnit ?? 0) * qty;
  const design = ((i.designMinutes ?? 0) / 60) * rt.laborHour;
  const packaging = rt.packPerUnit * qty;

  /* falla esperada (CAL-17): para entregar una pieza buena hay que imprimir 1/(1−f) piezas; la tasa medida se encoge hacia el valor por defecto */
  const f0 = rt.failRatePct / 100; const k = Math.max(0, rt.failShrinkK);
  const m = i.machine;
  const fMed = m && m.jobsDone != null ? ((m.jobsFailed ?? 0) + k * f0) / (m.jobsDone + k || 1) : (m?.failRatePct ?? rt.failRatePct) / 100;
  const tagFactor = (i.tags ?? []).reduce((a, key) => a * (rt.complexityTags.find((t) => t.key === key)?.factor ?? 1), 1);
  const matFactor = (i.riskFactor ?? 1) * ((i.materialType && rt.riskByMaterial[i.materialType]) || 1);
  const f = Math.min(0.9, Math.max(0, fMed * matFactor * tagFactor));
  const repeated = material + machine + energy + overhead + (rt.failOnLabor ? prep + supervision : 0);
  const failure = (repeated * f) / (1 - f);
  const cost = material + machine + energy + overhead + prep + supervision + failure + post + design + packaging;

  /* precio neto: el margen es un porcentaje de la venta neta (tope 90 %); el IVA se suma aparte sobre el precio final */
  const mPct = (i.category ? rt.marginByCategory?.[i.category] : undefined) ?? rt.marginPct;
  const withMargin = (c: number, pct: number) => c / (1 - Math.min(0.9, Math.max(0, pct / 100)));
  const urg = rt.urgency.find((u) => u.key === (i.urgency ?? 'normal'))?.pct ?? 0;
  const vol = volumePct(qty, rt.volumeTiers);
  let price = withMargin(cost, mPct) * (1 + urg / 100) * (1 + vol / 100);
  let rule: PriceRule = 'margin'; let ruleValue = 0;
  if (vol < 0 && rt.volumeMinMarginPct > 0) { const guard = withMargin(cost, rt.volumeMinMarginPct) * (1 + urg / 100); if (guard > price) { price = guard; rule = 'volumeLimited'; ruleValue = rt.volumeMinMarginPct; } }
  const fh = hourFloor(rt) * hoursEff; const fg = rt.floors.perGram * G; const fl = rt.minPrice;
  if (fh > price) { price = fh; rule = 'floorHour'; ruleValue = hourFloor(rt); }
  if (fg > price) { price = fg; rule = 'floorGram'; ruleValue = rt.floors.perGram; }
  if (fl > price) { price = fl; rule = 'floorLine'; ruleValue = fl; }

  /* comisiones sobre lo cobrado */
  const fees = Math.min(0.5, Math.max(0, (rt.payFeePct + rt.channelFeePct) / 100));
  const gross = price / (1 - fees);
  const suggestedUnit = roundPrice(gross / qty, rt.rounding);
  const suggestedTotal = suggestedUnit * qty;
  const feesAmount = suggestedTotal * fees;
  const marginReal = suggestedTotal > 0 ? ((suggestedTotal - feesAmount - cost) / suggestedTotal) * 100 : null;

  /* banda Piso / Recomendado / Alto (por unidad) */
  const floorBase = Math.max(withMargin(cost, rt.minMarginPct) * (1 + urg / 100), fh, fg, fl) / (1 - fees);
  const refs = benchmarkTotals(rt, G, H);
  const high = Math.max(suggestedTotal * (1 + rt.bandHighPct / 100), refs.length ? Math.max(...refs) : 0);
  const floorUnit = Math.min(roundPrice(floorBase / qty, rt.rounding), suggestedUnit);
  const highUnit = Math.max(roundPrice(high / qty, rt.rounding), suggestedUnit);
  const bench = refs.length ? { min: r0(Math.min(...refs)), max: r0(Math.max(...refs)) } : null;
  if (bench && suggestedTotal < bench.min * 0.9) warnings.push('belowBenchmark');

  /* confianza y rango */
  const critical = warnings.some((w) => ['noMachine', 'machineNoPurchase', 'machineNoPower', 'materialNoCost', 'noLabor'].includes(w));
  let confidence: Confidence = i.origin === 'slicer' || i.origin === 'file' ? 'alta' : i.origin === 'estimate' ? 'baja' : 'media';
  if (critical) confidence = 'baja';
  let range: CostBreakdown['range'] = null;
  if (!inner && i.origin === 'estimate') {
    const e = Math.min(0.9, Math.max(0, rt.estimateErrorPct / 100));
    const scale = (s: number): LineInput => ({ ...i, gramsTotal: i.gramsTotal * s, hoursTotal: i.hoursTotal * s, filaments: i.filaments?.map((x) => ({ ...x, g: x.g * s })), origin: 'manual' });
    range = { min: calcLineCore(scale(1 - e), rt0, true).suggestedUnit, max: calcLineCore(scale(1 + e), rt0, true).suggestedUnit };
  }

  return {
    material: r0(material), machine: r0(machine), energy: r0(energy), prep: r0(prep), post: r0(post), failure: r0(failure),
    overhead: r0(overhead), supervision: r0(supervision), design: r0(design), packaging: r0(packaging),
    cost: r0(cost), marginPct: mPct, urgencyPct: urg, volumePct: vol, priceBeforeRound: r0(price),
    suggestedUnit, suggestedTotal, shipping: i.shipping ?? 0, hoursEffective: hoursEff, gramsEffective: gramsEff,
    feesAmount: r0(feesAmount), marginReal, rule, ruleValue, band: { floor: floorUnit, recommended: suggestedUnit, high: highUnit },
    confidence, reliable: !critical, range, warnings, pricePerHour: hoursEff > 0 ? suggestedTotal / hoursEff : 0, pricePerGram: G > 0 ? suggestedTotal / G : 0,
    benchmark: bench,
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
  /** Mínimo por pedido de las tarifas (0 = sin mínimo) y si el pedido queda por debajo. */
  orderMin?: number; belowOrderMin?: boolean;
}

/**
 * finalTotalOverride: si el usuario fija el TOTAL del presupuesto, se reparte entre las líneas
 * en proporción a su precio sugerido para poder calcular el margen de cada una.
 */
/** Modo de IVA efectivo: lo decide la casilla «+ IVA» del presupuesto. */
export function effectiveTaxMode(_rt: Rates, applyTax?: boolean): Rates['taxMode'] {
  return applyTax ? 'sumado' : 'exento';
}
/** Neto de un importe cobrado: el IVA cobrado se guarda aparte (taxAmount). */
export function netOfGross(gross: number, _rt: Rates, taxAmount = 0): number {
  return gross - taxAmount;
}

export function calcQuote(lines: QuoteLine[], rt0: Rates, opts: { discount?: number; finalTotalOverride?: number | null; applyTax?: boolean } = {}): QuoteTotals {
  const rt: Rates = { ...rt0, taxMode: effectiveTaxMode(rt0, opts.applyTax) };
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
    const net = finalTotal;
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
  if (rt.taxMode === 'sumado') { tax = Math.round(afterDiscount * rt.taxPct / 100); total = afterDiscount + tax; }
  const cost = out.reduce((a, l) => a + l.cost, 0);
  const marginPct = net > 0 ? ((net - shipping - cost) / (net - shipping || 1)) * 100 : null;
  const suggestedTotal = sugSum + shipping;
  const orderMin = rt.floors?.perOrder ?? 0;
  return {
    lines: out, suggestedTotal, subtotal, discount, net, tax, total, cost, marginPct,
    diffPct: suggestedTotal > 0 ? ((subtotal - suggestedTotal) / suggestedTotal) * 100 : 0,
    belowCost: net - shipping < cost, belowMin: marginPct != null && marginPct < rt.minMarginPct,
    orderMin, belowOrderMin: orderMin > 0 && active.length > 0 && afterDiscount - shipping < orderMin,
  };
}

/* ───────── estimaciones sin laminar ───────── */
/** Estimación desde la malla (modo "estimado"): gramos = (cáscara + interior × relleno) × densidad. */
export function estimateFromMesh(o: { volumeCm3: number; areaCm2: number; infillPct: number; wallMm?: number; density: number; feedGph: number }) {
  const wall = o.wallMm ?? 1.2;
  const shell = Math.min(o.volumeCm3, (o.areaCm2 * wall) / 10);  // cm³ de cáscara
  const inner = Math.max(0, o.volumeCm3 - shell);
  const grams = (shell + inner * (o.infillPct / 100)) * o.density;
  return { grams, hours: grams / Math.max(1, o.feedGph) };
}

export type FillKind = 'hueca' | 'normal' | 'maciza';
/** Estimación por medidas aproximadas (sin archivo): caja envolvente × ocupación × llenado. Confianza baja. */
export function estimateFromDims(o: { lengthMm: number; widthMm: number; heightMm: number; fill: FillKind; density: number; feedGph: number; occupancy?: number }) {
  const boxCm3 = (Math.max(0, o.lengthMm) * Math.max(0, o.widthMm) * Math.max(0, o.heightMm)) / 1000;
  const solid = boxCm3 * (o.occupancy ?? 0.4);
  const fillFactor = o.fill === 'maciza' ? 0.9 : o.fill === 'hueca' ? 0.25 : 0.4;
  const grams = solid * fillFactor * o.density;
  return { grams, hours: grams / Math.max(1, o.feedGph) };
}

/* ───────── herramientas de análisis (nivel Experto) ───────── */
const scaleInput = (i: LineInput, qty: number): LineInput => {
  const s = qty / Math.max(1, i.qty);
  return { ...i, qty, gramsTotal: i.gramsTotal * s, hoursTotal: i.hoursTotal * s, plates: Math.max(1, Math.ceil((i.plates ?? 1) * s)), filaments: i.filaments?.map((f) => ({ ...f, g: f.g * s })), colorChanges: (i.colorChanges ?? 0) * s, origin: i.origin === 'estimate' ? 'manual' : i.origin };
};
/** Precio unitario, total y margen para distintas cantidades (escala lineal gramos y horas). */
export function quantityTable(i: LineInput, rt: Rates, qtys: number[]) {
  return qtys.map((q) => { const b = calcLine(scaleInput(i, q), rt); return { qty: q, unit: b.suggestedUnit, total: b.suggestedTotal, marginReal: b.marginReal ?? null, rule: b.rule ?? ('margin' as PriceRule) }; });
}
/** Cuánto cambia el precio sugerido si cambian el material, el tiempo o la falla. */
export function sensitivity(i: LineInput, rt: Rates) {
  const base = calcLine(i, rt).suggestedTotal;
  const d = (b: CostBreakdown) => (base > 0 ? ((b.suggestedTotal - base) / base) * 100 : 0);
  const mat = (s: number) => calcLine({ ...i, costPerKg: i.costPerKg * s, costPerKgReplace: i.costPerKgReplace != null ? i.costPerKgReplace * s : undefined, filaments: i.filaments?.map((f) => ({ ...f, costPerKg: f.costPerKg * s })) }, rt);
  const tim = (s: number) => calcLine({ ...i, hoursTotal: i.hoursTotal * s }, rt);
  const fail = (dp: number) => calcLine({ ...i, machine: i.machine ? { ...i.machine, jobsDone: undefined, jobsFailed: undefined, failRatePct: null } : null }, { ...rt, failRatePct: Math.max(0, rt.failRatePct + dp) });
  return [
    { key: 'material+10', delta: d(mat(1.1)) }, { key: 'material-10', delta: d(mat(0.9)) },
    { key: 'time+20', delta: d(tim(1.2)) }, { key: 'time-20', delta: d(tim(0.8)) },
    { key: 'fail+5', delta: d(fail(5)) }, { key: 'fail-5', delta: d(fail(-5)) },
  ];
}
/** "El cliente paga $X": margen, $/hora y veredicto. */
export function inversePrice(i: LineInput, rt: Rates, targetUnit: number) {
  const b = calcLine(i, rt); const qty = Math.max(1, Math.floor(i.qty || 1));
  const total = targetUnit * qty; const fees = Math.min(0.5, ((rt.payFeePct ?? 0) + (rt.channelFeePct ?? 0)) / 100);
  const marginPct = total > 0 ? ((total * (1 - fees) - b.cost) / total) * 100 : null;
  const perHour = b.hoursEffective > 0 ? total / b.hoursEffective : 0;
  const fh = hourFloor(rt);
  const verdict: 'ok' | 'bajoMinimo' | 'bajoCosto' | 'bajoPisoHora' =
    marginPct == null || marginPct < 0 ? 'bajoCosto' : marginPct < rt.minMarginPct ? 'bajoMinimo' : fh > 0 && perHour < fh ? 'bajoPisoHora' : 'ok';
  return { marginPct, perHour, verdict, suggestedUnit: b.suggestedUnit, cost: b.cost };
}

/* ───────── completitud y coherencia ───────── */
export type CheckKey = 'machine' | 'material' | 'labor' | 'fixed' | 'income' | 'times' | 'profile';
export interface CheckItem { key: CheckKey; ok: boolean; critical: boolean }
export function completeness(rt: Rates, d: { machines: Array<{ purchaseValue: number; watts: number }>; materials: Array<{ costPerKg: number }>; hasProfile?: boolean }) {
  const items: CheckItem[] = [
    { key: 'machine', ok: d.machines.length > 0 && d.machines.every((m) => m.purchaseValue > 0 && m.watts > 0), critical: true },
    { key: 'material', ok: d.materials.length > 0 && d.materials.every((m) => m.costPerKg > 0), critical: true },
    { key: 'labor', ok: rt.laborHour > 0, critical: true },
    { key: 'fixed', ok: fixedMonthly(rt) > 0, critical: false },
    { key: 'income', ok: (rt.targetIncomeMonth ?? 0) > 0, critical: false },
    { key: 'times', ok: rt.prepMinutes > 0 || (rt.postMinutes ?? 0) > 0, critical: false },
    { key: 'profile', ok: d.hasProfile ?? true, critical: false },
  ];
  const bad = items.filter((x) => !x.ok);
  const status: 'lista' | 'casi' | 'incompleta' = bad.some((x) => x.critical) ? 'incompleta' : bad.length ? 'casi' : 'lista';
  return { items, status };
}

export type CoherenceKey = 'marginBelowMin' | 'volumeBelowMin' | 'laborZero' | 'kwhZero' | 'fixedZeroWithIncome' | 'rateBelowBreakEven';
/** Avisos (no bloquean) al guardar tarifas. `sample` = precio por hora de un caso tipo, si se conoce. */
export function coherenceChecks(rt: Rates, sample?: { pricePerHour: number }): Array<{ key: CoherenceKey; params?: Record<string, number> }> {
  const n = normRates(rt); const out: Array<{ key: CoherenceKey; params?: Record<string, number> }> = [];
  if (rt.marginPct < rt.minMarginPct) out.push({ key: 'marginBelowMin', params: { margin: rt.marginPct, min: rt.minMarginPct } });
  const worst = Math.min(0, ...rt.volumeTiers.map((t) => t.pct));
  if (worst < 0 && n.volumeMinMarginPct > 0 && n.volumeMinMarginPct < rt.minMarginPct) out.push({ key: 'volumeBelowMin', params: { min: rt.minMarginPct, floor: n.volumeMinMarginPct } });
  if (!(rt.laborHour > 0)) out.push({ key: 'laborZero' });
  if (!(rt.kwh > 0)) out.push({ key: 'kwhZero' });
  if (fixedMonthly(rt) <= 0 && (rt.targetIncomeMonth ?? 0) > 0) out.push({ key: 'fixedZeroWithIncome' });
  const be = breakEvenRate(rt);
  if (sample && be > 0 && sample.pricePerHour < be) out.push({ key: 'rateBelowBreakEven', params: { rate: Math.round(sample.pricePerHour), breakEven: Math.round(be) } });
  return out;
}
