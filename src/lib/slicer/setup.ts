import { and, eq, isNull } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { audit } from '../audit';
import { entryNozzle, findVendorOf, getIndex, listFactory, profileNozzle, resolveFactory, rowNozzle, type ProfileType } from './catalog';
import { layerRange, normNozzle, nozzleFromName, numStr, qualityTemplates, scaleSpeeds, standardLayer, type TemplateKey } from './nozzle';
import { getT } from '@/i18n/server';
import { tDefault } from '@/i18n/errors';

/**
 * Configuración guiada del laminado. Para laminar en el sitio hacen falta tres cosas:
 *  1. que cada máquina tenga un perfil de MÁQUINA (qué impresora y boquilla es),
 *  2. un perfil de PROCESO por defecto (calidad: altura de capa, paredes, relleno…),
 *  3. que cada material del inventario tenga un perfil de FILAMENTO (temperaturas, flujo, densidad).
 * Este módulo detecta lo que falta, sugiere el perfil de fábrica correcto y lo crea/asigna.
 */
type Db = Awaited<ReturnType<typeof getDb>>;
const short = (n: string) => n.replace(/ @.*$/, '').trim();

/** Busca o crea un perfil «de fábrica tal cual» (sin cambios) para no duplicar perfiles idénticos. */
export async function ensureProfile(type: ProfileType, baseName: string, name: string, userId?: string | null, db?: Db) {
  const t = await getT();
  db ??= await getDb();
  const vendor = findVendorOf(type, baseName); if (!vendor) throw new Error(t('slicer.theFactoryProfileDoesNot', { baseName }));
  resolveFactory(type, baseName, vendor);
  const same = (await db.select().from(s.slicerProfiles).where(and(eq(s.slicerProfiles.type, type), eq(s.slicerProfiles.baseName, baseName), isNull(s.slicerProfiles.deletedAt))))
    .find((p) => !Object.keys(p.changes ?? {}).length);
  if (same) return same.id;
  return createProfileRow({ type, name, baseName, vendor, changes: {}, userId, note: t('slicer.createdByTheGuidedSetup') }, db);
}

export async function createProfileRow(i: { type: ProfileType; name: string; baseName: string; vendor?: string; changes: Record<string, any>; userId?: string | null; note?: string; imported?: boolean; notes?: string | null; nozzle?: string | null }, db?: Db) {
  const t = await getT();
  db ??= await getDb();
  const vendor = i.vendor ?? findVendorOf(i.type, i.baseName); if (!vendor) throw new Error(t('slicer.theFactoryProfileDoesNot2', { name: i.baseName }));
  // nombre único: si ya existe, se agrega un número
  const names = new Set((await db.select({ n: s.slicerProfiles.name }).from(s.slicerProfiles).where(and(eq(s.slicerProfiles.type, i.type), isNull(s.slicerProfiles.deletedAt)))).map((x) => x.n));
  let name = i.name.trim(); for (let k = 2; names.has(name); k++) name = `${i.name.trim()} (${k})`;
  const [r] = await db.insert(s.slicerProfiles).values({ workspaceId: WORKSPACE_ID, type: i.type, name, vendor, baseName: i.baseName, changes: i.changes, imported: !!i.imported, notes: i.notes ?? null, nozzle: normNozzle(i.nozzle) ?? (i.type === 'filament' ? null : rowNozzle({ type: i.type, baseName: i.baseName, changes: i.changes })), createdBy: i.userId ?? null }).returning({ id: s.slicerProfiles.id });
  await db.insert(s.slicerProfileVersions).values({ profileId: r.id, version: 1, baseName: i.baseName, changes: i.changes, createdBy: i.userId ?? null, note: i.note ?? t('slicer.initialVersion') });
  await audit('slicer_profile', r.id, 'crear', { name, baseName: i.baseName }, i.userId);
  return r.id;
}

/** Perfil de máquina sugerido según marca/modelo/boquilla de la ficha («Bambu Lab» + «A1» + 0.4 → «Bambu Lab A1 0.4 nozzle»). */
export function suggestMachineBase(m: { brand: string | null; model: string | null; name: string; nozzles?: string[] | null }): string | null {
  const idx = getIndex(); const list = (m.nozzles ?? []).map((x) => normNozzle(x)).filter(Boolean) as string[]; const nozzle = list.includes('0.4') ? '0.4' : list[0] ?? '0.4';
  const machines = idx.all.filter((e) => e.type === 'machine' && e.instantiation);
  const hay = `${m.brand ?? ''} ${m.model ?? ''} ${m.name}`.toLowerCase().replace(/\s+/g, ' ');
  // el nombre de modelo más largo que aparezca en la ficha (para no confundir «A1» con «A1 mini»)
  const cands = machines.filter((e) => (entryNozzle(e) ?? '0.4') === nozzle).map((e) => ({ e, model: e.name.replace(/ \d\.\d nozzle$/, '').toLowerCase() }))
    .filter(({ model }) => { const bare = model.replace(/^bambu lab /, ''); return hay.includes(model) || (/bambu/.test(hay) && new RegExp(`(^|\\s)${bare.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(hay)); })
    .sort((a, b) => b.model.length - a.model.length);
  return cands[0]?.e.name ?? null;
}

/** Calidades (procesos) de fábrica para una impresora, con la «Standard» primero. */
/**
 * Algunos fabricantes (p. ej. Prusa) no declaran la lista de impresoras compatibles sino una condición;
 * en ese caso se usa el sufijo del nombre («… @MK4S 0.4»): cada palabra debe estar en el nombre de la impresora.
 */
export function fitsMachine(profileName: string, machineBase: string) {
  const suffix = profileName.split('@')[1]; if (!suffix) return true;
  const words = machineBase.toLowerCase().split(/\s+/); const nozzle = machineBase.match(/(\d\.\d+) nozzle$/)?.[1] ?? '0.4';
  const toks = suffix.trim().toLowerCase().split(/\s+/);
  if (toks[0] === 'bbl' || toks[0] === 'system') return true;
  const tn = toks.find((tt) => /^\d\.\d+$/.test(tt)) ?? '0.4';
  return Number(tn) === Number(nozzle) && toks.filter((tt) => !/^\d\.\d+$/.test(tt)).every((tt) => words.includes(tt) || words.some((w) => w.replace(/-/g, '') === tt.replace(/-/g, '')));
}
/**
 * ¿Sirve esta calidad (perfil de proceso) para esta impresora? Un perfil de otro fabricante nunca sirve; con lista explícita de
 * impresoras compatibles se respeta; sin lista se usa el nombre («@Creality Ender3V3SE 0.4»). Sin datos de fábrica se asume que sirve.
 */
export function processFitsMachineBase(proc: { baseName: string; vendor?: string | null }, machineBase: string): boolean {
  const mv = findVendorOf('machine', machineBase); const pv = proc.vendor ?? findVendorOf('process', proc.baseName);
  if (mv && pv && mv !== pv) return false;
  const entries = getIndex().byName.get(`process|${proc.baseName}`) ?? []; const e = entries.find((x) => x.vendor === (pv ?? x.vendor)) ?? entries[0];
  if (e?.compatiblePrinters?.length) return e.compatiblePrinters.includes(machineBase);
  return fitsMachine(proc.baseName, machineBase);
}
export function processesFor(machineBase: string) {
  const vendor = findVendorOf('machine', machineBase) ?? 'BBL';
  const all = listFactory('process', vendor, { machine: machineBase });
  const explicit = getIndex().all.some((e) => e.type === 'process' && e.vendor === vendor && e.compatiblePrinters.includes(machineBase));
  const list = explicit ? all : all.filter((p) => fitsMachine(p.name, machineBase));
  // primero la calidad «estándar» de ESA boquilla: altura de capa más cercana a la mitad del diámetro
  // (0,2 → 0,10 · 0,4 → 0,20 · 0,6 → 0,30 · 0,8 → 0,40) y, a igualdad, la Standard
  const target = standardLayer(profileNozzle('machine', machineBase) ?? '0.4');
  const lh = (n: string) => Number(n.match(/^(\d+\.\d+)mm/)?.[1] ?? target);
  const kind = (n: string) => (/standard/i.test(n) ? 0 : /optimal|balanced/i.test(n) ? 1 : /strength/i.test(n) ? 2 : /speed/i.test(n) ? 3 : 4);
  return list.map((p) => p.name).sort((a, b) => Math.abs(lh(a) - target) - Math.abs(lh(b) - target) || kind(a) - kind(b) || a.localeCompare(b));
}

/** Misma impresora con otras boquillas de fábrica: «Bambu Lab A1 0.4 nozzle» → [{0.2, «… 0.2 nozzle»}, {0.4, …}, {0.6, …}, {0.8, …}]. */
export function nozzleVariants(machineBase: string): Array<{ nozzle: string; base: string }> {
  const stem = machineBase.replace(/\s*\d\.\d+\s*nozzle$/i, ''); if (stem === machineBase) { const n = profileNozzle('machine', machineBase); return n ? [{ nozzle: n, base: machineBase }] : []; }
  const vendor = findVendorOf('machine', machineBase);
  return getIndex().all.filter((e) => e.type === 'machine' && e.instantiation && (!vendor || e.vendor === vendor) && e.name.startsWith(`${stem} `) && /^\d\.\d+ nozzle$/i.test(e.name.slice(stem.length + 1)))
    .map((e) => ({ nozzle: entryNozzle(e) ?? nozzleFromName(e.name)!, base: e.name })).filter((v) => v.nozzle).sort((a, b) => Number(a.nozzle) - Number(b.nozzle));
}

/** Filamentos de fábrica disponibles: los de la marca de la impresora y los genéricos de OrcaSlicer. */
export function filamentsFor(machineBase?: string | null) {
  const out: Array<{ name: string; group: string }> = [];
  if (machineBase) {
    const v = findVendorOf('machine', machineBase);
    if (v) { const explicit = getIndex().all.some((e) => e.type === 'filament' && e.vendor === v && e.compatiblePrinters.includes(machineBase)); for (const f of listFactory('filament', v, { machine: machineBase })) if (explicit || fitsMachine(f.name, machineBase)) out.push({ name: f.name, group: v === 'BBL' ? 'Bambu Lab' : v }); }
  }
  for (const f of listFactory('filament', 'OrcaFilamentLibrary')) out.push({ name: f.name, group: tDefault('slicer.genericGroup') });
  return out;
}

/** Filamento sugerido para un material del inventario (marca + tipo + línea). */
export function suggestFilamentBase(mat: { type: string; manufacturer: string | null; line: string | null }, machineBase?: string | null): string | null {
  const all = filamentsFor(machineBase).map((f) => f.name); const type = mat.type.toUpperCase().trim(); const line = (mat.line ?? '').trim().replace(new RegExp(`^${type.replace(/[-+]/g, '\\$&')}\\s*`, 'i'), '');
  if (/bambu/i.test(mat.manufacturer ?? '') && machineBase) {
    const suffix = machineBase.match(/^Bambu Lab (.+?) \d\.\d nozzle$/)?.[1];
    const tryNames = [`Bambu ${type} ${line || 'Basic'}`, `Bambu ${type} Basic`, `Bambu ${type}`].map((n) => `${n.replace(/\s+/g, ' ')} @BBL ${suffix}`);
    for (const n of tryNames) if (all.includes(n)) return n;
  }
  const generic = [`Generic ${type}${line ? ` ${line}` : ''} @System`, `Generic ${type} @System`].find((n) => all.includes(n));
  return generic ?? (all.includes('Generic PLA @System') ? 'Generic PLA @System' : null);
}

export async function slicingReadiness() {
  const db = await getDb();
  const machines = await db.select().from(s.machines).where(and(isNull(s.machines.deletedAt), eq(s.machines.tech, 'FDM')));
  const materials = await db.select().from(s.materials).where(and(isNull(s.materials.deletedAt), eq(s.materials.tech, 'fdm')));
  const profs = await db.select().from(s.slicerProfiles).where(isNull(s.slicerProfiles.deletedAt));
  const P = (id: string | null) => (id ? profs.find((p) => p.id === id) ?? null : null);
  const ms = machines.map((m) => {
    const mp = P(m.machineProfileId); const base = mp?.baseName ?? suggestMachineBase(m);
    const nozzle = (mp ? rowNozzle(mp) : base ? profileNozzle('machine', base) : null) ?? normNozzle(m.nozzles?.[0]) ?? '0.4';
    const setups = Object.entries(m.nozzleSetups ?? {}).filter(([, v]) => P(v.machineProfileId)).map(([n, v]) => ({ nozzle: n, machineProfile: P(v.machineProfileId)!.name, process: P(v.processProfileId)?.name ?? null }));
    return { id: m.id, name: m.name, brand: m.brand, model: m.model, nozzle, nozzles: m.nozzles ?? [], simulated: m.simulated,
      machineProfile: mp ? { id: mp.id, name: mp.name, baseName: mp.baseName } : null, suggestedMachine: mp ? null : base,
      defaultProcess: P(m.defaultProcessProfileId) ? { id: m.defaultProcessProfileId!, name: P(m.defaultProcessProfileId)!.name } : null,
      processes: base ? processesFor(base) : [], variants: base ? nozzleVariants(base) : [], setups };
  });
  const ref = ms.find((m) => m.machineProfile)?.machineProfile?.baseName ?? ms.find((m) => m.suggestedMachine)?.suggestedMachine ?? null;
  const mats = materials.map((m) => {
    const fp = P(m.filamentProfileId);
    // advertencia si el perfil es de otro tipo (p. ej. un TPU con perfil de PLA: temperaturas y caudal equivocados)
    let ptype: string | null = null;
    if (fp) { try { const b = resolveFactory('filament', fp.baseName, fp.vendor ?? undefined); const v = (fp.changes as any)?.filament_type ?? b.filament_type; ptype = String(Array.isArray(v) ? v[0] : v ?? '') || null; } catch { /* base ausente */ } }
    const norm = (tt: string) => tt.toUpperCase().replace(/[^A-Z]/g, '').replace(/^PLA.*/, 'PLA').replace(/^PETG.*/, 'PETG');
    const mismatch = !!(ptype && norm(ptype) !== norm(m.type) && !norm(ptype).startsWith(norm(m.type)));
    const line = m.line && !m.line.toUpperCase().startsWith(m.type.toUpperCase()) ? ` ${m.line}` : '';
    const label = `${m.manufacturer ? m.manufacturer + ' ' : ''}${m.line && m.line.toUpperCase().startsWith(m.type.toUpperCase()) ? m.line : m.type + line} ${m.colorName}`.trim();
    return { id: m.id, label, type: m.type, hex: m.hex, filamentProfile: fp ? { id: fp.id, name: fp.name } : null, profileType: ptype, mismatch, suggested: fp && !mismatch ? null : suggestFilamentBase(m, ref) };
  });
  const machineOptions = getIndex().all.filter((e) => e.type === 'machine' && e.instantiation).map((e) => ({ name: e.name, vendor: e.vendor })).sort((a, b) => (a.vendor === 'BBL' ? 0 : 1) - (b.vendor === 'BBL' ? 0 : 1) || a.name.localeCompare(b.name));
  const filamentProfiles = profs.filter((p) => p.type === 'filament').map((p) => ({ id: p.id, name: p.name }));
  return { machines: ms, materials: mats, machineOptions, filamentOptions: filamentsFor(ref), filamentProfiles, refMachine: ref,
    done: { machines: ms.filter((m) => m.machineProfile && m.defaultProcess).length, materials: mats.filter((m) => m.filamentProfile && !m.mismatch).length } };
}

/** Registra la configuración vigente de la máquina (impresora + calidad) bajo su boquilla si aún no está: máquinas configuradas antes de «boquilla puesta». */
async function currentSetups(db: Db, m: typeof s.machines.$inferSelect) {
  const out = { ...(m.nozzleSetups ?? {}) };
  if (!m.machineProfileId) return out;
  const [cur] = await db.select().from(s.slicerProfiles).where(and(eq(s.slicerProfiles.id, m.machineProfileId), isNull(s.slicerProfiles.deletedAt)));
  const n = cur ? rowNozzle(cur) : null;
  if (n && !out[n]) out[n] = { machineProfileId: cur.id, processProfileId: m.defaultProcessProfileId ?? null };
  return out;
}
const sortNozzles = (l: string[]) => [...new Set(l)].sort((a, b) => Number(a) - Number(b));

export async function setupMachine(machineId: string, machineBase: string, processBase: string | null, userId?: string | null) {
  const t = await getT();
  const db = await getDb(); const [m] = await db.select().from(s.machines).where(eq(s.machines.id, machineId)); if (!m) throw new Error(t('slicer.machineNotFound'));
  const mpId = await ensureProfile('machine', machineBase, machineBase.replace(/ nozzle$/, ''), userId, db);
  const proc = processBase ?? processesFor(machineBase)[0]; if (!proc) throw new Error(t('slicer.thereAreNoQualityProfiles'));
  const ppId = await ensureProfile('process', proc, `${short(machineBase).replace(/^Bambu Lab /, '').replace(/ \d\.\d+ nozzle$/, '')} · ${short(proc)}`, userId, db);
  const nozzle = profileNozzle('machine', machineBase);
  // La boquilla se SUMA a las de la ficha (antes la reemplazaba y se perdían las demás) y queda como la activa.
  const nozzles = nozzle ? sortNozzles([...(m.nozzles ?? []).map((x) => normNozzle(x)).filter(Boolean) as string[], nozzle]) : m.nozzles ?? [];
  const before = await currentSetups(db, m); const nozzleSetups = nozzle ? { ...before, [nozzle]: { machineProfileId: mpId, processProfileId: ppId } } : before;
  await db.update(s.machines).set({ machineProfileId: mpId, defaultProcessProfileId: ppId, nozzles, nozzleSetups, updatedAt: new Date() }).where(eq(s.machines.id, machineId));
  await audit('machine', machineId, 'configurar_laminado', { machineBase, processBase: proc, nozzle }, userId);
  return { machineProfileId: mpId, processProfileId: ppId };
}

/** Quita de `changes` lo que ya vale lo mismo en el perfil de fábrica: el perfil queda con «solo tus cambios». */
export function diffAgainstBase(type: ProfileType, baseName: string, changes: Record<string, any>) {
  const base = resolveFactory(type, baseName, findVendorOf(type, baseName)); const f = (v: unknown) => (Array.isArray(v) ? v[0] : v);
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(changes)) {
    const b = f(base[k]); const x = f(v);
    if (b != null && (String(b) === String(x) || (Number.isFinite(Number(b)) && Number.isFinite(Number(x)) && String(b) !== '' && String(x) !== '' && Number(b) === Number(x)))) continue;
    out[k] = v;
  }
  return out;
}

/** Perfil de fábrica de calidad sobre el que se aplican las plantillas: el «Standard» de esa impresora (o el genérico del tipo). */
export function templateBase(machineBase?: string | null) {
  const std = machineBase ? processesFor(machineBase)[0] : null;
  if (std) return std;
  const g = getIndex().all.find((e) => e.type === 'process' && /^fdm_process_common$/.test(e.name)) ?? getIndex().all.find((e) => e.type === 'process' && /^fdm_.*common$/.test(e.name));
  if (!g) throw new Error(tDefault('nozzle.errNoBaseProcess'));
  return g.name;
}

/** Límites de altura de capa que declara el perfil de impresora (si los declara). */
export function machineLayerLimits(machineBase: string, changes?: Record<string, any> | null) {
  const b = resolveFactory('machine', machineBase, findVendorOf('machine', machineBase)); const f = (v: unknown) => Number(Array.isArray(v) ? v[0] : v);
  const min = f(changes?.min_layer_height ?? b.min_layer_height), max = f(changes?.max_layer_height ?? b.max_layer_height);
  return { min: Number.isFinite(min) && min > 0 ? min : undefined, max: Number.isFinite(max) && max > 0 ? max : undefined };
}

export interface TemplateInput { machineBase?: string | null; machineChanges?: Record<string, any> | null; nozzle: string; keys: TemplateKey[]; baseName?: string; prefix?: string; userId?: string | null; /** reutiliza la calidad ya creada con el mismo nombre en vez de duplicarla */ reuse?: boolean }
/** Crea perfiles de calidad «de la casa» (Borrador/Estándar/Fino/Resistente/Funcional) calculados para la boquilla. */
export async function createQualityFromTemplates(i: TemplateInput, db?: Db) {
  db ??= await getDb(); const t = await getT();
  const nozzle = normNozzle(i.nozzle); if (!nozzle) throw new Error(t('nozzle.errBadNozzle'));
  // la impresora «de ese diámetro» (A1 0.4 → A1 0.2) para partir de su calidad estándar y de sus límites de capa
  let machineBase = i.machineBase ?? null; let machineChanges = i.machineChanges ?? null;
  if (machineBase) { const v = nozzleVariants(machineBase).find((x) => Number(x.nozzle) === Number(nozzle)); if (v && v.base !== machineBase) { machineBase = v.base; machineChanges = null; } }
  const baseName = i.baseName ?? templateBase(machineBase);
  if (!findVendorOf('process', baseName)) throw new Error(t('slicer.theFactoryProfileDoesNot2', { name: baseName }));
  const limits = machineBase ? machineLayerLimits(machineBase, machineChanges) : {};
  const tpl = qualityTemplates(nozzle, limits).filter((q) => i.keys.includes(q.key)); if (!tpl.length) throw new Error(t('nozzle.errPickOneQuality'));
  const prefix = i.prefix?.trim() || (machineBase ? short(machineBase).replace(/^Bambu Lab /, '').replace(/ \d\.\d+ nozzle$/, '') : t('nozzle.genericPrefix'));
  const ids: Array<{ id: string; name: string }> = [];
  const baseNozzle = profileNozzle('process', baseName); const baseValues = resolveFactory('process', baseName, findVendorOf('process', baseName));
  for (const q of tpl) {
    // sin calidad de fábrica para ese diámetro: las velocidades de la base (de otra boquilla) se reescalan
    const speeds = baseNozzle && Number(baseNozzle) !== Number(nozzle) ? scaleSpeeds(baseValues, baseNozzle, nozzle) : {};
    // todos los anchos de línea que traiga la base (skin, skeleton…) al ancho de la boquilla: uno menor que la capa hace que OrcaSlicer rechace el laminado
    const widths = Object.fromEntries(Object.keys(baseValues).filter((k) => /_line_width$/.test(k) && !(k in q.changes)).map((k) => [k, /infill|skin|skeleton|inner/.test(k) ? q.changes.sparse_infill_line_width : q.changes.line_width]));
    const changes = diffAgainstBase('process', baseName, { ...widths, ...q.changes, ...speeds }); const label = t(q.label);
    const qName = `${prefix} ${nozzle} · ${label} ${numStr(q.layer)}`;
    if (i.reuse) { const [ex] = await db.select({ id: s.slicerProfiles.id, name: s.slicerProfiles.name }).from(s.slicerProfiles).where(and(eq(s.slicerProfiles.type, 'process'), eq(s.slicerProfiles.name, qName), eq(s.slicerProfiles.baseName, baseName), isNull(s.slicerProfiles.deletedAt))); if (ex) { ids.push(ex); continue; } }
    const id = await createProfileRow({ type: 'process', name: qName, baseName, changes, nozzle, userId: i.userId, note: t('nozzle.noteTemplate', { label, nozzle }), notes: t('nozzle.noteTemplateLong', { label, nozzle, hint: t(q.hint) }) }, db);
    const [r] = await db.select({ name: s.slicerProfiles.name }).from(s.slicerProfiles).where(eq(s.slicerProfiles.id, id)); ids.push({ id, name: r.name });
  }
  return ids;
}

/** Cambia la boquilla puesta en una máquina: reutiliza lo que ya se configuró para esa boquilla o lo crea (de fábrica si existe; si no, una copia con el diámetro cambiado). */
export async function switchNozzle(machineId: string, nozzleIn: string, userId?: string | null) {
  const t = await getT();
  const nozzle = normNozzle(nozzleIn); if (!nozzle) throw new Error(t('nozzle.errBadNozzleRange'));
  const db = await getDb(); const [m] = await db.select().from(s.machines).where(eq(s.machines.id, machineId)); if (!m) throw new Error(t('slicer.machineNotFound'));
  const profs = await db.select().from(s.slicerProfiles).where(isNull(s.slicerProfiles.deletedAt)); const P = (id: string | null | undefined) => (id ? profs.find((p) => p.id === id) ?? null : null);
  const setups0 = await currentSetups(db, m); const known = setups0[nozzle];
  if (known && P(known.machineProfileId)) {
    const proc = P(known.processProfileId) ? known.processProfileId : null;
    await db.update(s.machines).set({ machineProfileId: known.machineProfileId, defaultProcessProfileId: proc, nozzleSetups: setups0, updatedAt: new Date() }).where(eq(s.machines.id, machineId));
    await audit('machine', machineId, 'cambiar_boquilla', { nozzle }, userId); return { machineProfileId: known.machineProfileId, processProfileId: proc, created: false };
  }
  const cur = P(m.machineProfileId); const base = cur?.baseName ?? suggestMachineBase(m);
  if (!base) throw new Error(t('nozzle.errPickPrinterFirst'));
  const factory = nozzleVariants(base).find((v) => Number(v.nozzle) === Number(nozzle));
  if (factory) { const r = await setupMachine(machineId, factory.base, null, userId); return { ...r, created: true }; }
  // sin perfil de fábrica para esa boquilla (1,0 · 1,2 · impresoras de otras marcas): copia de la impresora con otro diámetro
  const limits = layerRange(nozzle);
  const mpId = await createProfileRow({ type: 'machine', name: `${(cur?.name ?? short(base)).replace(/\s*\d\.\d+(\s*nozzle)?$/i, '')} ${nozzle}`, baseName: base, vendor: cur?.vendor ?? undefined, nozzle, changes: { ...(cur?.changes ?? {}), nozzle_diameter: nozzle, min_layer_height: numStr(limits.min), max_layer_height: numStr(limits.max) }, userId, note: t('nozzle.noteNozzle', { nozzle }), notes: t('nozzle.noteCopyNozzle', { nozzle }) }, db);
  const curProc = P(m.defaultProcessProfileId);
  const [ppRow] = await createQualityFromTemplates({ machineBase: base, machineChanges: { min_layer_height: numStr(limits.min), max_layer_height: numStr(limits.max) }, nozzle, keys: ['estandar'], baseName: curProc?.baseName, prefix: short(cur?.name ?? base), userId }, db);
  const nozzles = sortNozzles([...(m.nozzles ?? []).map((x) => normNozzle(x)).filter(Boolean) as string[], nozzle]);
  await db.update(s.machines).set({ machineProfileId: mpId, defaultProcessProfileId: ppRow.id, nozzles, nozzleSetups: { ...setups0, [nozzle]: { machineProfileId: mpId, processProfileId: ppRow.id } }, updatedAt: new Date() }).where(eq(s.machines.id, machineId));
  await audit('machine', machineId, 'cambiar_boquilla', { nozzle, custom: true }, userId);
  return { machineProfileId: mpId, processProfileId: ppRow.id, created: true };
}

export async function setupFilament(materialId: string, o: { base?: string; profileId?: string }, userId?: string | null) {
  const t = await getT();
  const db = await getDb(); const [m] = await db.select().from(s.materials).where(eq(s.materials.id, materialId)); if (!m) throw new Error(t('slicer.materialNotFound'));
  const id = o.profileId ?? (o.base ? await ensureProfile('filament', o.base, short(o.base), userId, db) : null);
  if (!id) throw new Error(t('slicer.chooseAFilamentProfile'));
  await db.update(s.materials).set({ filamentProfileId: id, updatedAt: new Date() }).where(eq(s.materials.id, materialId));
  return id;
}

/* ── Filamento personalizado ─────────────────────────────────────────────────────────────────── */
export const FILAMENT_TYPES = ['PLA', 'PLA Matte', 'PLA Silk', 'PLA-CF', 'PETG', 'PETG HF', 'PETG-CF', 'ABS', 'ASA', 'TPU', 'PA', 'PA-CF', 'PC', 'PCTG', 'PVA', 'HIPS', 'PP'];
/** Campos del formulario de filamento personalizado ↔ claves de OrcaSlicer. */
export const CUSTOM_FILAMENT_FIELDS = [
  { key: 'nozzle_temperature_initial_layer', label: 'slicer.field.nozzleFirstLayer', unit: '°C', group: 'slicer.field.groupTemperatures' },
  { key: 'nozzle_temperature', label: 'slicer.field.nozzle', unit: '°C', group: 'slicer.field.groupTemperatures' },
  { key: 'textured_plate_temp', label: 'slicer.field.texturedPei', unit: '°C', group: 'slicer.field.groupTemperatures' },
  { key: 'hot_plate_temp', label: 'slicer.field.smoothPei', unit: '°C', group: 'slicer.field.groupTemperatures' },
  { key: 'cool_plate_temp', label: 'slicer.field.coolPlate', unit: '°C', group: 'slicer.field.groupTemperatures' },
  { key: 'filament_flow_ratio', label: 'slicer.field.flowRatio', unit: '', group: 'slicer.field.groupExtrusion' },
  { key: 'filament_max_volumetric_speed', label: 'slicer.field.maxVolumetric', unit: 'mm³/s', group: 'slicer.field.groupExtrusion' },
  { key: 'pressure_advance', label: 'slicer.field.pressureAdvance', unit: '', group: 'slicer.field.groupExtrusion' },
  { key: 'filament_density', label: 'slicer.field.density', unit: 'g/cm³', group: 'slicer.field.groupMaterial' },
  { key: 'filament_cost', label: 'slicer.field.cost', unit: '$/kg', group: 'slicer.field.groupMaterial' },
  { key: 'filament_diameter', label: 'slicer.field.diameter', unit: 'mm', group: 'slicer.field.groupMaterial' },
  { key: 'fan_min_speed', label: 'slicer.field.fanMin', unit: '%', group: 'slicer.field.groupCooling' },
  { key: 'fan_max_speed', label: 'slicer.field.fanMax', unit: '%', group: 'slicer.field.groupCooling' },
  { key: 'filament_retraction_length', label: 'slicer.field.retraction', unit: 'mm', group: 'slicer.field.groupCooling' },
] as const;

export function genericBaseFor(type: string) {
  const all = new Set(listFactory('filament', 'OrcaFilamentLibrary').map((f) => f.name));
  return [`Generic ${type} @System`, `Generic ${type.split(/[ -]/)[0]} @System`, 'Generic PLA @System'].find((n) => all.has(n))!;
}
const first = (v: unknown) => (Array.isArray(v) ? v[0] : v);
export function customFilamentDefaults(baseName: string) {
  const base = resolveFactory('filament', baseName, findVendorOf('filament', baseName));
  return Object.fromEntries(CUSTOM_FILAMENT_FIELDS.map((f) => [f.key, first(base[f.key]) == null || first(base[f.key]) === 'nil' ? '' : String(first(base[f.key]))]));
}

export interface CustomFilamentInput { name: string; brand?: string; type: string; baseName?: string; values: Record<string, string>; addToInventory?: { colorName: string; hex: string; costPerKg?: number } | null; materialId?: string | null; userId?: string | null }
export async function createCustomFilament(i: CustomFilamentInput) {
  const t = await getT();
  if (!i.name.trim()) throw new Error(t('slicer.giveTheFilamentAName'));
  const baseName = i.baseName || genericBaseFor(i.type);
  const defaults = customFilamentDefaults(baseName);
  const changes: Record<string, any> = {};
  for (const f of CUSTOM_FILAMENT_FIELDS) {
    const v = (i.values[f.key] ?? '').toString().trim().replace(',', '.');
    if (v === '' || v === defaults[f.key] || (defaults[f.key] !== '' && Number(v) === Number(defaults[f.key]))) continue;
    if (!/^-?\d+(\.\d+)?$/.test(v)) throw new Error(t('slicer.mustBeANumber', { field: t(f.label) }));
    changes[f.key] = v;
  }
  if (i.brand?.trim()) changes.filament_vendor = i.brand.trim();
  const db = await getDb();
  const id = await createProfileRow({ type: 'filament', name: i.name, baseName, changes, userId: i.userId, note: t('slicer.customFilament2'), notes: `${t('slicer.customNote')} · ${i.type}${i.brand ? ' · ' + i.brand : ''}` }, db);
  let materialId = i.materialId ?? null;
  if (materialId) await db.update(s.materials).set({ filamentProfileId: id, updatedAt: new Date() }).where(eq(s.materials.id, materialId));
  else if (i.addToInventory) {
    const density = Number(changes.filament_density ?? defaults.filament_density) || 1.24;
    const [m] = await db.insert(s.materials).values({ workspaceId: WORKSPACE_ID, tech: 'fdm', manufacturer: i.brand?.trim() || null, type: i.type.split(' ')[0], line: i.type.includes(' ') ? i.type.split(' ').slice(1).join(' ') : null,
      colorName: i.addToInventory.colorName || t('slicer.noColor'), hex: i.addToInventory.hex || '#888888', density, costPerKg: Math.round(i.addToInventory.costPerKg ?? Number(changes.filament_cost ?? 0)), filamentProfileId: id,
      tempNozzle: changes.nozzle_temperature ?? defaults.nozzle_temperature, tempBed: changes.textured_plate_temp ?? defaults.textured_plate_temp, createdBy: i.userId ?? null }).returning({ id: s.materials.id });
    materialId = m.id;
  }
  return { profileId: id, materialId };
}

/** Calidad por intención (Borrador / Estándar / Fino / Resistente / Funcional) resuelta para la impresora y boquilla de un perfil de máquina. Crea el perfil de proceso la primera vez y luego lo reutiliza. */
export async function ensureQuality(i: { machineProfileId: string; key: TemplateKey; userId?: string | null }, db?: Db) {
  db ??= await getDb(); const t = await getT();
  const [m] = await db.select().from(s.slicerProfiles).where(and(eq(s.slicerProfiles.id, i.machineProfileId), isNull(s.slicerProfiles.deletedAt)));
  if (!m || m.type !== 'machine') throw new Error(t('nozzle.errPrinterProfileNotFound'));
  const nozzle = rowNozzle(m) ?? profileNozzle('machine', m.baseName) ?? '0.4';
  const [r] = await createQualityFromTemplates({ machineBase: m.baseName, machineChanges: m.changes, nozzle, keys: [i.key], userId: i.userId, reuse: true }, db);
  return r;
}
