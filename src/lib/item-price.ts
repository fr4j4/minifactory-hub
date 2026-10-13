/**
 * Precio de UNA línea a partir de sus datos y del entorno (tarifas, perfiles, material, máquina).
 * Es la única implementación: la usan el navegador (vista en vivo) y el servidor (al guardar),
 * de modo que ambos siempre dan el mismo precio (spec CAL-50 y CAL-70).
 */
import { calcLine, resolveRates, pickProfileId, roundPrice, type CalcProfile, type CostBreakdown, type DeepPartial, type LineInput, type MachineCost, type Rates } from './pricing';

export interface ItemMaterial { costPerKg: number; replaceCostPerKg?: number; type?: string; riskFactor?: number | null; wastePct?: number | null }
export interface ItemOverrides { marginPct?: number; wastePct?: number; failRatePct?: number; laborHour?: number; supervisionMinPerHour?: number; payFeePct?: number }
export interface ItemCalcOpts {
  plates?: number; designMinutes?: number; colorChanges?: number; tags?: string[]; overrides?: ItemOverrides;
  filaments?: Array<{ g: number; materialId: string }>;
}
export interface ItemPriceInput {
  qty: number; gramsTotal: number; hoursTotal: number; mode?: 'auto' | 'semi' | 'manual';
  originKind?: string; // 'slicer' | 'file' | 'manual' | 'estimate' (origen de los gramos)
  prepMinutes?: number; postMinutes?: number; postSupplies?: number; shipping?: number;
  profileId?: string | null; opts?: ItemCalcOpts;
}
export interface ItemPriceEnv {
  rates: Rates; profiles: CalcProfile[];
  material: ItemMaterial | null; machine: MachineCost | null;
  materialById?: (id: string) => ItemMaterial | undefined;
  urgency?: string; priceAdjPct?: number;
  quoteProfileId?: string | null; customerProfileId?: string | null; channelProfileId?: string | null; channelFeePct?: number | null;
}
export interface ItemPrice { bd: CostBreakdown; suggestedUnit: number; cost: number; rates: Rates; profileId: string | null }

const originOf = (k?: string): LineInput['origin'] => (k === 'slicer' || k === 'file' || k === 'estimate' ? k : 'manual');

/** Tarifas efectivas de una línea: base → perfil → comisión del canal → ajustes propios de la línea. */
export function effectiveRates(it: Pick<ItemPriceInput, 'profileId' | 'opts'>, env: Pick<ItemPriceEnv, 'rates' | 'profiles' | 'quoteProfileId' | 'customerProfileId' | 'channelProfileId' | 'channelFeePct'>) {
  if (env.rates.engine === 'legacy') return { rt: env.rates, profileId: null as string | null };
  const profileId = pickProfileId([it.profileId, env.quoteProfileId, env.customerProfileId, env.channelProfileId], env.profiles);
  const profile = env.profiles.find((p) => p.id === profileId);
  const channel: DeepPartial<Rates> | undefined = env.channelFeePct ? { channelFeePct: env.channelFeePct } : undefined;
  const rt = resolveRates(env.rates, profile?.params, channel, it.opts?.overrides as DeepPartial<Rates> | undefined);
  return { rt, profileId };
}

/** Entrada del motor y tarifas efectivas de una línea (la usan priceLine y las herramientas del nivel Experto). */
export function buildLine(it: ItemPriceInput, env: ItemPriceEnv): { input: LineInput; rt: Rates; profileId: string | null } {
  const { rt, profileId } = effectiveRates(it, env);
  const qty = Math.max(1, Math.floor(it.qty || 1));
  const legacy = rt.engine === 'legacy';
  const m = env.material; const o = it.opts ?? {};
  const filaments = !legacy && o.filaments?.length
    ? o.filaments.map((f) => { const fm = env.materialById?.(f.materialId) ?? m; return { g: f.g, costPerKg: fm?.costPerKg ?? 0, costPerKgReplace: fm?.replaceCostPerKg }; })
    : undefined;
  const input: LineInput = {
    qty, gramsTotal: it.gramsTotal, hoursTotal: it.hoursTotal, costPerKg: m?.costPerKg ?? 0, costPerKgReplace: m?.replaceCostPerKg, machine: env.machine,
    prepMinutes: it.prepMinutes, postMinutesPerUnit: it.postMinutes, postSuppliesPerUnit: it.postSupplies, shipping: it.shipping,
    applyTimeFactor: it.mode !== 'manual',
    urgency: legacy ? undefined : env.urgency,
    plates: o.plates, designMinutes: o.designMinutes, colorChanges: o.colorChanges, tags: o.tags, materialType: m?.type, riskFactor: m?.riskFactor ?? undefined,
    wastePct: m?.wastePct ?? undefined, filaments, origin: originOf(it.originKind),
  };
  return { input, rt, profileId };
}

export function priceLine(it: ItemPriceInput, env: ItemPriceEnv): ItemPrice {
  const { input, rt, profileId } = buildLine(it, env);
  const bd = calcLine(input, rt);
  let unit = bd.suggestedUnit;
  if (rt.engine === 'legacy') { const urg = rt.urgency.find((u) => u.key === (env.urgency ?? 'normal'))?.pct ?? 0; if (urg) unit = Math.round((unit * (1 + urg / 100)) / 10) * 10; }
  if (env.priceAdjPct) unit = roundPrice(unit * (1 + env.priceAdjPct / 100), rt.rounding);
  return { bd, suggestedUnit: unit, cost: bd.cost + (bd.feesAmount ?? 0), rates: rt, profileId };
}

/** Material del contexto de cálculo (navegador) en la forma que usa `priceLine`. */
export const toItemMaterial = (m: { costPerKg: number; replaceCostPerKg?: number; type?: string; riskFactor?: number | null; wastePct?: number | null } | undefined | null): ItemMaterial | null =>
  m ? { costPerKg: m.costPerKg, replaceCostPerKg: m.replaceCostPerKg, type: m.type, riskFactor: m.riskFactor, wastePct: m.wastePct } : null;
