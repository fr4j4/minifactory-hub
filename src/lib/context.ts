import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { getSettings } from './settings';
import { ensureGenericMaterials, materialCostPerKg, materialStock } from './services/inventory';
import { machineCostOf } from './services/quotes';
import type { CalcProfile as EngineProfile, MachineCost, Rates } from './pricing';
import { rowNozzle } from './slicer/catalog';
import { nozzleVariants, processFitsMachineBase } from './slicer/setup';
import { num } from '@/lib/format';
import { getT } from '@/i18n/server';

export interface CalcMachine { id: string; name: string; tech: string; nozzle: string | null; volX: number; volY: number; volZ: number; simulated: boolean; machineProfileId: string | null; defaultProcessProfileId: string | null; feedGph: number; cost: MachineCost; status: string }
export interface CalcMaterial { id: string; label: string; type: string; colorName: string; hex: string; costPerKg: number; replaceCostPerKg: number; riskFactor: number | null; wastePct: number | null; density: number; filamentProfileId: string | null; tech: string; /** «PLA genérico»: sirve cuando el color pedido no está en el inventario */ generic: boolean; /** gramos físicos en carretes (el genérico suma los colores de su tipo) */ stockG: number }
/** Una máquina con una boquilla puesta: lo que se elige al laminar (una máquina con 0,2 y 0,4 da dos opciones). */
export interface CalcSetup { key: string; machineId: string; label: string; nozzle: string | null; machineProfileId: string; processProfileId: string | null; active: boolean; /** calidades (perfiles de proceso) que sirven para esta impresora */ compatibleProcessIds: string[] }
export interface CalcProfile { id: string; name: string; type: string; vendor: string | null; baseName: string; simulated: boolean; version: number; nozzle: string | null }
export interface CalcPreset { key: string; label: string | null }
export interface CalcChannel { id: string; name: string; commissionPct: number; calcProfileId: string | null }
export interface CalcContext { presets: CalcPreset[]; rates: Rates; calcProfiles: EngineProfile[]; channels: CalcChannel[]; setupDone: boolean; machines: CalcMachine[]; setups: CalcSetup[]; materials: CalcMaterial[]; profiles: CalcProfile[]; urgency: Rates['urgency']; defaults: { infillPct: number }; currency: string }

/** Datos necesarios para calcular precios y elegir perfiles de laminado en el navegador (serializables). */
export async function getCalcContext(): Promise<CalcContext> {
  const db = await getDb(); const st = await getSettings();
  await ensureGenericMaterials(db);
  const machines = await db.select().from(s.machines).where(isNull(s.machines.deletedAt)).orderBy(asc(s.machines.name));
  const mats = await db.select().from(s.materials).where(isNull(s.materials.deletedAt)).orderBy(asc(s.materials.generic), asc(s.materials.type), asc(s.materials.colorName));
  const profs = await db.select().from(s.slicerProfiles).where(isNull(s.slicerProfiles.deletedAt)).orderBy(asc(s.slicerProfiles.name));
  const linkMap = await (await import('./slicer/links')).defaultLinkMap(db);
  const tt = await getT(); const materials: CalcMaterial[] = []; const stockOf = new Map((await materialStock(db)).map((x) => [x.materialId, x.physicalG]));
  for (const m of mats) materials.push({ replaceCostPerKg: m.costPerKg, riskFactor: m.riskFactor, wastePct: m.wastePct, generic: m.generic, stockG: Math.round(stockOf.get(m.id) ?? 0), id: m.id, label: m.generic ? `${m.type} ${tt('buy.genericName')}` : `${m.manufacturer ? m.manufacturer + ' ' : ''}${m.type} ${m.colorName}`, type: m.type, colorName: m.colorName, hex: m.hex, costPerKg: await materialCostPerKg(m.id, db), density: m.density, filamentProfileId: linkMap.get(m.id) ?? null, tech: m.tech });
  const nozzleOf = (id: string | null) => { const p = id ? profs.find((x) => x.id === id) : null; return p ? rowNozzle(p) : null; };
  const alive = new Set(profs.map((p) => p.id)); const setups: CalcSetup[] = [];
  const procProfs = profs.filter((p) => p.type === 'process');
  // la misma impresora con otra boquilla sigue siendo la misma impresora
  const compatFor = (mpId: string) => {
    const mp = profs.find((x) => x.id === mpId); if (!mp) return procProfs.map((p) => p.id);
    let bases = [mp.baseName]; try { bases = [mp.baseName, ...nozzleVariants(mp.baseName).map((v) => v.base)]; } catch { /* sin datos de fábrica */ }
    return procProfs.filter((p) => { try { return bases.some((b) => processFitsMachineBase({ baseName: p.baseName, vendor: p.vendor }, b)); } catch { return true; } }).map((p) => p.id);
  };
  for (const m of machines) {
    const list: Array<{ nozzle: string | null; mp: string; pp: string | null }> = [];
    for (const [n, v] of Object.entries(m.nozzleSetups ?? {})) if (alive.has(v.machineProfileId)) list.push({ nozzle: n, mp: v.machineProfileId, pp: v.processProfileId && alive.has(v.processProfileId) ? v.processProfileId : null });
    // máquinas con un perfil asignado a mano (o anteriores a «boquilla puesta»)
    if (m.machineProfileId && alive.has(m.machineProfileId) && !list.some((x) => x.mp === m.machineProfileId)) list.push({ nozzle: nozzleOf(m.machineProfileId), mp: m.machineProfileId, pp: m.defaultProcessProfileId });
    list.sort((a, b) => Number(a.nozzle ?? 0) - Number(b.nozzle ?? 0));
    for (const x of list) setups.push({ key: `${m.id}|${x.nozzle ?? ''}`, machineId: m.id, label: list.length > 1 ? `${m.name} · ${x.nozzle ? num(+x.nozzle, 2) + ' mm' : '—'}` : m.name, nozzle: x.nozzle, machineProfileId: x.mp, processProfileId: x.pp, active: x.mp === m.machineProfileId, compatibleProcessIds: compatFor(x.mp) });
  }
  const chs = await db.select().from(s.salesChannels).where(and(isNull(s.salesChannels.deletedAt), eq(s.salesChannels.active, true)));
  const rates: Rates = { ...st.rates, machineCount: Math.max(1, machines.filter((m) => !m.simulated).length) };
  const { loadPresets } = await import('./slicer/presets');
  return {
    presets: (await loadPresets(db)).map((p) => ({ key: p.key, label: p.label ?? null })),
    rates, calcProfiles: st.calcProfiles, setupDone: st.calcSetup.done,
    channels: chs.map((c) => ({ id: c.id, name: c.name, commissionPct: c.commissionPct, calcProfileId: c.calcProfileId })), urgency: st.rates.urgency, defaults: { infillPct: st.defaults.infillPct }, currency: st.shop.currency,
    machines: machines.map((m) => ({ id: m.id, name: m.name, tech: m.tech, nozzle: nozzleOf(m.machineProfileId), volX: m.volX, volY: m.volY, volZ: m.volZ, simulated: m.simulated, machineProfileId: m.machineProfileId, defaultProcessProfileId: m.defaultProcessProfileId, feedGph: m.feedGph, cost: machineCostOf(m)!, status: m.status })),
    setups, materials, profiles: profs.map((p) => ({ id: p.id, name: p.name, type: p.type, vendor: p.vendor, baseName: p.baseName, simulated: p.simulated, version: p.version, nozzle: rowNozzle(p) })),
  };
}
