import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSettings } from './settings';
import { materialCostPerKg } from './services/inventory';
import { machineCostOf } from './services/quotes';
import type { CalcProfile as EngineProfile, MachineCost, Rates } from './pricing';

export interface CalcMachine { id: string; name: string; tech: string; volX: number; volY: number; volZ: number; simulated: boolean; machineProfileId: string | null; defaultProcessProfileId: string | null; feedGph: number; cost: MachineCost; status: string }
export interface CalcMaterial { id: string; label: string; type: string; colorName: string; hex: string; costPerKg: number; replaceCostPerKg: number; riskFactor: number | null; wastePct: number | null; density: number; filamentProfileId: string | null; tech: string }
export interface CalcProfile { id: string; name: string; type: string; vendor: string | null; baseName: string; simulated: boolean; version: number }
export interface CalcChannel { id: string; name: string; commissionPct: number; calcProfileId: string | null }
export interface CalcContext { rates: Rates; machines: CalcMachine[]; materials: CalcMaterial[]; profiles: CalcProfile[]; calcProfiles: EngineProfile[]; channels: CalcChannel[]; urgency: Rates['urgency']; defaults: { infillPct: number }; currency: string; setupDone: boolean }

/** Datos necesarios para calcular precios y elegir perfiles de laminado en el navegador (serializables). */
export async function getCalcContext(): Promise<CalcContext> {
  const db = await getDb(); const st = await getSettings();
  const machines = await db.select().from(s.machines).where(isNull(s.machines.deletedAt)).orderBy(asc(s.machines.name));
  const mats = await db.select().from(s.materials).where(isNull(s.materials.deletedAt)).orderBy(asc(s.materials.type), asc(s.materials.colorName));
  const profs = await db.select().from(s.slicerProfiles).where(isNull(s.slicerProfiles.deletedAt)).orderBy(asc(s.slicerProfiles.name));
  const materials: CalcMaterial[] = [];
  for (const m of mats) materials.push({ id: m.id, label: `${m.manufacturer ? m.manufacturer + ' ' : ''}${m.type} ${m.colorName}`, type: m.type, colorName: m.colorName, hex: m.hex, costPerKg: await materialCostPerKg(m.id, db), replaceCostPerKg: m.costPerKg, riskFactor: m.riskFactor, wastePct: m.wastePct, density: m.density, filamentProfileId: m.filamentProfileId, tech: m.tech });
  const chs = await db.select().from(s.salesChannels).where(and(isNull(s.salesChannels.deletedAt), eq(s.salesChannels.active, true)));
  const rates: Rates = { ...st.rates, machineCount: Math.max(1, machines.filter((m) => !m.simulated).length) };
  return {
    rates, calcProfiles: st.calcProfiles, setupDone: st.calcSetup.done,
    channels: chs.map((c) => ({ id: c.id, name: c.name, commissionPct: c.commissionPct, calcProfileId: c.calcProfileId })), urgency: st.rates.urgency, defaults: { infillPct: st.defaults.infillPct }, currency: st.shop.currency,
    machines: machines.map((m) => ({ id: m.id, name: m.name, tech: m.tech, volX: m.volX, volY: m.volY, volZ: m.volZ, simulated: m.simulated, machineProfileId: m.machineProfileId, defaultProcessProfileId: m.defaultProcessProfileId, feedGph: m.feedGph, cost: machineCostOf(m)!, status: m.status })),
    materials, profiles: profs.map((p) => ({ id: p.id, name: p.name, type: p.type, vendor: p.vendor, baseName: p.baseName, simulated: p.simulated, version: p.version })),
  };
}
