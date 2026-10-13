import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSettings } from './settings';
import { materialCostPerKg } from './services/inventory';
import { machineCostOf } from './services/quotes';
import type { MachineCost, Rates } from './pricing';

export interface CalcMachine { id: string; name: string; tech: string; volX: number; volY: number; volZ: number; simulated: boolean; machineProfileId: string | null; defaultProcessProfileId: string | null; feedGph: number; cost: MachineCost; status: string }
export interface CalcMaterial { id: string; label: string; type: string; colorName: string; hex: string; costPerKg: number; density: number; filamentProfileId: string | null; tech: string }
export interface CalcProfile { id: string; name: string; type: string; vendor: string | null; baseName: string; simulated: boolean; version: number }
export interface CalcContext { rates: Rates; machines: CalcMachine[]; materials: CalcMaterial[]; profiles: CalcProfile[]; urgency: Rates['urgency']; defaults: { infillPct: number }; currency: string }

/** Datos necesarios para calcular precios y elegir perfiles de laminado en el navegador (serializables). */
export async function getCalcContext(): Promise<CalcContext> {
  const db = await getDb(); const st = await getSettings();
  const machines = await db.select().from(s.machines).where(isNull(s.machines.deletedAt)).orderBy(asc(s.machines.name));
  const mats = await db.select().from(s.materials).where(isNull(s.materials.deletedAt)).orderBy(asc(s.materials.type), asc(s.materials.colorName));
  const profs = await db.select().from(s.slicerProfiles).where(isNull(s.slicerProfiles.deletedAt)).orderBy(asc(s.slicerProfiles.name));
  const materials: CalcMaterial[] = [];
  for (const m of mats) materials.push({ id: m.id, label: `${m.manufacturer ? m.manufacturer + ' ' : ''}${m.type} ${m.colorName}`, type: m.type, colorName: m.colorName, hex: m.hex, costPerKg: await materialCostPerKg(m.id, db), density: m.density, filamentProfileId: m.filamentProfileId, tech: m.tech });
  return {
    rates: st.rates, urgency: st.rates.urgency, defaults: { infillPct: st.defaults.infillPct }, currency: st.shop.currency,
    machines: machines.map((m) => ({ id: m.id, name: m.name, tech: m.tech, volX: m.volX, volY: m.volY, volZ: m.volZ, simulated: m.simulated, machineProfileId: m.machineProfileId, defaultProcessProfileId: m.defaultProcessProfileId, feedGph: m.feedGph, cost: machineCostOf(m)!, status: m.status })),
    materials, profiles: profs.map((p) => ({ id: p.id, name: p.name, type: p.type, vendor: p.vendor, baseName: p.baseName, simulated: p.simulated, version: p.version })),
  };
}
