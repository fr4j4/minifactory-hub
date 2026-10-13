'use server';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { requirePerm } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { enqueueSlice } from '@/lib/slicer/queue';
import { findVendorOf, getIndex, listFactory, listVendors, resolveFactory, SIMPLE_PARAMS, type ProfileType } from '@/lib/slicer/catalog';
import { safe } from './common';
import { getT } from '@/i18n/server';

export async function sliceAction(i: { fileVersionId: string; machineProfileId: string; processProfileId: string; filamentProfileId: string; copies?: number; label?: string; force?: boolean }) {
  return safe(async () => {
    const u = await requirePerm('laminador', 'V');
    return enqueueSlice({ ...i, userId: u.id });
  });
}

export async function compareAction(i: { fileVersionId: string; copies?: number; combos: Array<{ label: string; machineProfileId: string; processProfileId: string; filamentProfileId: string }> }) {
  const t = await getT();
  return safe(async () => {
    const u = await requirePerm('laminador', 'V');
    if (i.combos.length < 1 || i.combos.length > 8) throw new Error(t('slicer.chooseBetween1And8'));
    const groupId = crypto.randomUUID(); const ids: string[] = [];
    for (const c of i.combos) ids.push(await enqueueSlice({ fileVersionId: i.fileVersionId, copies: i.copies ?? 1, label: c.label, groupId, userId: u.id, machineProfileId: c.machineProfileId, processProfileId: c.processProfileId, filamentProfileId: c.filamentProfileId }));
    return { groupId, ids };
  });
}

export async function factoryVendorsAction() { return safe(async () => { await requirePerm('laminador', 'V'); return listVendors(); }); }
export async function factoryListAction(type: ProfileType, vendor: string, machine?: string, q?: string) { return safe(async () => { await requirePerm('laminador', 'V'); return listFactory(type, vendor, { machine, q }); }); }

export async function createProfileAction(i: { type: ProfileType; name: string; baseName: string; vendor?: string; changes?: Record<string, any>; simulated?: boolean; notes?: string }) {
  const t = await getT();
  return safe(async () => {
    const u = await requirePerm('laminador', 'C');
    if (!i.name.trim()) throw new Error(t('slicer.giveTheProfileAName'));
    const vendor = i.vendor || findVendorOf(i.type, i.baseName);
    if (!vendor) throw new Error(t('slicer.theSelectedFactoryProfileDoes'));
    resolveFactory(i.type, i.baseName, vendor); // valida la cadena de herencia
    const db = await getDb();
    const [r] = await db.insert(s.slicerProfiles).values({ workspaceId: WORKSPACE_ID, type: i.type, name: i.name.trim(), vendor, baseName: i.baseName, changes: i.changes ?? {}, simulated: !!i.simulated, notes: i.notes ?? null, createdBy: u.id }).returning({ id: s.slicerProfiles.id });
    await db.insert(s.slicerProfileVersions).values({ profileId: r.id, version: 1, baseName: i.baseName, changes: i.changes ?? {}, createdBy: u.id, note: t('slicer.initialVersion') });
    await audit('slicer_profile', r.id, 'crear', { name: i.name }, u.id);
    return r.id;
  }, ['/laminador']);
}

/** Editar un perfil crea una versión nueva (se puede volver atrás). */
export async function updateProfileAction(id: string, i: { name?: string; changes: Record<string, any>; baseName?: string; note?: string; simulated?: boolean; notes?: string }) {
  const t = await getT();
  return safe(async () => {
    const u = await requirePerm('laminador', 'E');
    const db = await getDb();
    const [p] = await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.id, id));
    if (!p) throw new Error(t('slicer.profileNotFound'));
    const changes: Record<string, any> = {};
    for (const [k, v] of Object.entries(i.changes)) if (v !== '' && v !== null && v !== undefined) changes[k] = v;
    const baseName = i.baseName ?? p.baseName;
    if (baseName !== p.baseName) resolveFactory(p.type as ProfileType, baseName, findVendorOf(p.type as ProfileType, baseName));
    const same = JSON.stringify(changes) === JSON.stringify(p.changes) && baseName === p.baseName;
    const version = same ? p.version : p.version + 1;
    if (!same) await db.insert(s.slicerProfileVersions).values({ profileId: id, version, baseName, changes, createdBy: u.id, note: i.note ?? null });
    await db.update(s.slicerProfiles).set({ name: i.name ?? p.name, changes, baseName, version, simulated: i.simulated ?? p.simulated, notes: i.notes ?? p.notes, updatedAt: new Date() }).where(eq(s.slicerProfiles.id, id));
    await audit('slicer_profile', id, 'editar', { version, keys: Object.keys(changes) }, u.id);
    return { version };
  }, ['/laminador', `/laminador/perfiles/${id}`]);
}

export async function revertProfileAction(id: string, version: number) {
  const t = await getT();
  return safe(async () => {
    const u = await requirePerm('laminador', 'E');
    const db = await getDb();
    const [v] = await db.select().from(s.slicerProfileVersions).where(and(eq(s.slicerProfileVersions.profileId, id), eq(s.slicerProfileVersions.version, version)));
    const [p] = await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.id, id));
    if (!v || !p) throw new Error(t('slicer.versionNotFound'));
    const next = p.version + 1;
    await db.insert(s.slicerProfileVersions).values({ profileId: id, version: next, baseName: v.baseName, changes: v.changes, createdBy: u.id, note: t('slicer.restoredVersion', { version }) });
    await db.update(s.slicerProfiles).set({ baseName: v.baseName, changes: v.changes, version: next, updatedAt: new Date() }).where(eq(s.slicerProfiles.id, id));
    return { version: next };
  }, [`/laminador/perfiles/${id}`, '/laminador']);
}

export async function duplicateProfileAction(id: string, name: string) {
  const t = await getT();
  return safe(async () => {
    const u = await requirePerm('laminador', 'C');
    const db = await getDb();
    const [p] = await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.id, id));
    if (!p) throw new Error(t('slicer.profileNotFound'));
    const [r] = await db.insert(s.slicerProfiles).values({ workspaceId: WORKSPACE_ID, type: p.type, name: name || `${p.name} (copia)`, vendor: p.vendor, baseName: p.baseName, changes: p.changes, simulated: p.simulated, notes: p.notes, createdBy: u.id }).returning({ id: s.slicerProfiles.id });
    await db.insert(s.slicerProfileVersions).values({ profileId: r.id, version: 1, baseName: p.baseName, changes: p.changes, createdBy: u.id, note: t('slicer.copyOf', { name: p.name }) });
    return r.id;
  }, ['/laminador']);
}

export async function deleteProfileAction(id: string) {
  return safe(async () => {
    const u = await requirePerm('laminador', 'X');
    const db = await getDb();
    await db.update(s.slicerProfiles).set({ deletedAt: new Date() }).where(eq(s.slicerProfiles.id, id));
    await audit('slicer_profile', id, 'eliminar', {}, u.id);
  }, ['/laminador']);
}

const IGNORE = new Set(['inherits', 'name', 'from', 'version', 'is_custom_defined', 'setting_id', 'instantiation', 'type', 'print_settings_id', 'printer_settings_id', 'filament_settings_id', 'compatible_printers', 'compatible_printers_condition', 'filament_id', 'base_id']);
/** Importa un perfil exportado desde OrcaSlicer o Bambu Studio (JSON): base = lo que hereda; cambios = el resto de las claves. */
export async function importProfileAction(i: { type: ProfileType; json: string; name?: string }) {
  const t = await getT();
  return safe(async () => {
    const u = await requirePerm('laminador', 'C');
    let d: any; try { d = JSON.parse(i.json); } catch { throw new Error(t('slicer.theFileIsNotValid')); }
    if (typeof d !== 'object' || !d) throw new Error(t('slicer.unexpectedJson'));
    const type = (d.type as ProfileType) || i.type;
    let baseName: string | undefined = d.inherits && findVendorOf(type, d.inherits) ? d.inherits : undefined;
    if (!baseName) {
      const fb = getIndex().all.find((e) => e.type === type && /^fdm_(machine|process|filament)_common$|^fdm_.*common$/.test(e.name));
      baseName = fb?.name; if (!baseName) throw new Error(t('slicer.noBaseProfileWasFound'));
    }
    const changes: Record<string, any> = {};
    for (const [k, v] of Object.entries(d)) if (!IGNORE.has(k)) changes[k] = v;
    const name = (i.name || d.name || t('slicer.importedProfile')).toString();
    const db = await getDb();
    const [r] = await db.insert(s.slicerProfiles).values({ workspaceId: WORKSPACE_ID, type, name, vendor: findVendorOf(type, baseName), baseName, changes, imported: true, createdBy: u.id }).returning({ id: s.slicerProfiles.id });
    await db.insert(s.slicerProfileVersions).values({ profileId: r.id, version: 1, baseName, changes, createdBy: u.id, note: t('slicer.importedFromOrcaslicerBambuStudi') });
    return { id: r.id, keys: Object.keys(changes).length, baseName };
  }, ['/laminador']);
}

/** Valores del perfil de fábrica base para prellenar el editor simple. */
export async function profileBaseValuesAction(type: ProfileType, baseName: string) {
  return safe(async () => {
    await requirePerm('laminador', 'V');
    const base = resolveFactory(type, baseName, findVendorOf(type, baseName));
    const out: Record<string, any> = {};
    for (const p of SIMPLE_PARAMS[type]) { const v = base[p.key]; out[p.key] = Array.isArray(v) ? v[0] : v ?? ''; }
    return out;
  });
}

/* ── Importar desde Bambu Studio / OrcaSlicer (3MF, paquetes y JSON) ─────────────────────────── */
async function readFiles(fd: FormData) {
  const t = await getT();
  const files = fd.getAll('files').filter((f): f is File => typeof f === 'object' && 'arrayBuffer' in f);
  if (!files.length) throw new Error(t('slicer.chooseAtLeastOneFile'));
  if (files.reduce((a, f) => a + f.size, 0) > 60 * 1024 * 1024) throw new Error(t('slicer.theFilesExceed60Mb'));
  return Promise.all(files.map(async (f) => ({ name: f.name, data: new Uint8Array(await f.arrayBuffer()) })));
}
export async function previewImportAction(fd: FormData) {
  return safe(async () => {
    await requirePerm('laminador', 'C');
    const { parsePresetFiles } = await import('@/lib/slicer/import'); const t = await getT();
    const cands = parsePresetFiles(await readFiles(fd), t);
    const db = await getDb(); const existing = await db.select({ type: s.slicerProfiles.type, name: s.slicerProfiles.name }).from(s.slicerProfiles).where(isNull(s.slicerProfiles.deletedAt));
    return cands.map((c) => ({ key: c.key, type: c.type, name: c.name, baseName: c.baseName, keys: Object.keys(c.changes).length, source: c.source, note: c.note, ok: c.ok, exists: existing.some((e) => e.type === c.type && e.name === c.name) }));
  });
}
/** Guarda los perfiles elegidos. Si ya existe uno con el mismo nombre, se agrega como versión nueva (se puede volver atrás). */
export async function importSelectedAction(fd: FormData) {
  const t = await getT();
  return safe(async () => {
    const u = await requirePerm('laminador', 'C');
    const { parsePresetFiles } = await import('@/lib/slicer/import'); const { createProfileRow } = await import('@/lib/slicer/setup'); const t = await getT();
    const keys = new Set(String(fd.get('keys') ?? '').split('\n').filter(Boolean));
    const cands = parsePresetFiles(await readFiles(fd), t).filter((c) => keys.has(c.key) && c.ok && c.baseName);
    const db = await getDb(); let created = 0, updated = 0;
    for (const c of cands) {
      const [prev] = await db.select().from(s.slicerProfiles).where(and(eq(s.slicerProfiles.type, c.type), eq(s.slicerProfiles.name, c.name), isNull(s.slicerProfiles.deletedAt)));
      if (prev) {
        const version = prev.version + 1;
        await db.insert(s.slicerProfileVersions).values({ profileId: prev.id, version, baseName: c.baseName!, changes: c.changes, createdBy: u.id, note: t('slicer.importedFrom', { source: c.source }) });
        await db.update(s.slicerProfiles).set({ baseName: c.baseName!, vendor: findVendorOf(c.type, c.baseName!) ?? prev.vendor, changes: c.changes, version, imported: true, updatedAt: new Date() }).where(eq(s.slicerProfiles.id, prev.id));
        updated++;
      } else { await createProfileRow({ type: c.type, name: c.name, baseName: c.baseName!, changes: c.changes, userId: u.id, imported: true, note: t('slicer.importedFrom', { source: c.source }) }, db); created++; }
    }
    return { created, updated };
  }, ['/laminador', '/laminador/configurar']);
}

/* ── Configuración guiada ───────────────────────────────────────────────────────────────────── */
export async function setupMachineAction(machineId: string, machineBase: string, processBase: string | null) {
  return safe(async () => { const u = await requirePerm('laminador', 'C'); const { setupMachine } = await import('@/lib/slicer/setup'); return setupMachine(machineId, machineBase, processBase, u.id); }, ['/laminador', '/laminador/configurar', '/maquinas']);
}
export async function processesForAction(machineBase: string) { return safe(async () => { await requirePerm('laminador', 'V'); const { processesFor } = await import('@/lib/slicer/setup'); return processesFor(machineBase); }); }
export async function setupFilamentAction(materialId: string, o: { base?: string; profileId?: string }) {
  return safe(async () => { const u = await requirePerm('laminador', 'C'); const { setupFilament } = await import('@/lib/slicer/setup'); return setupFilament(materialId, o, u.id); }, ['/laminador', '/laminador/configurar', '/inventario']);
}
export async function setupAllFilamentsAction(items: Array<{ materialId: string; base: string }>) {
  return safe(async () => { const u = await requirePerm('laminador', 'C'); const { setupFilament } = await import('@/lib/slicer/setup'); for (const i of items) await setupFilament(i.materialId, { base: i.base }, u.id); return items.length; }, ['/laminador', '/laminador/configurar', '/inventario']);
}
export async function customFilamentDefaultsAction(type: string, baseName?: string) {
  return safe(async () => { await requirePerm('laminador', 'V'); const { customFilamentDefaults, genericBaseFor } = await import('@/lib/slicer/setup'); const base = baseName || genericBaseFor(type); return { baseName: base, values: customFilamentDefaults(base) }; });
}
export async function createCustomFilamentAction(i: Omit<import('@/lib/slicer/setup').CustomFilamentInput, 'userId'>) {
  return safe(async () => { const u = await requirePerm('laminador', 'C'); if (i.addToInventory) await requirePerm('inventario', 'C'); const { createCustomFilament } = await import('@/lib/slicer/setup'); return createCustomFilament({ ...i, userId: u.id }); }, ['/laminador', '/laminador/configurar', '/inventario']);
}
/** Todas las claves del perfil de fábrica (para el buscador de parámetros del editor). */
export async function profileKeysAction(type: ProfileType, baseName: string) {
  return safe(async () => {
    await requirePerm('laminador', 'V');
    const base = resolveFactory(type, baseName, findVendorOf(type, baseName));
    return Object.entries(base).filter(([k, v]) => !['name', 'inherits', 'from', 'instantiation', 'setting_id', 'type', 'version', 'compatible_printers', 'compatible_printers_condition'].includes(k) && (typeof v !== 'string' || v.length < 200) && !(Array.isArray(v) && JSON.stringify(v).length > 200))
      .map(([k, v]) => ({ key: k, value: Array.isArray(v) ? String(v[0] ?? '') : String(v) })).sort((a, b) => a.key.localeCompare(b.key));
  });
}
