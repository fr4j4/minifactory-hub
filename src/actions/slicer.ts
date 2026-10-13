'use server';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { requirePerm } from '@/lib/auth';
import { audit } from '@/lib/audit';
import { enqueueSlice } from '@/lib/slicer/queue';
import { findVendorOf, getIndex, listFactory, listVendors, resolveFactory, SIMPLE_PARAMS, type ProfileType } from '@/lib/slicer/catalog';
import { safe } from './common';

export async function sliceAction(i: { fileVersionId: string; machineProfileId: string; processProfileId: string; filamentProfileId: string; copies?: number; label?: string; force?: boolean }) {
  return safe(async () => {
    const u = await requirePerm('laminador', 'V');
    return enqueueSlice({ ...i, userId: u.id });
  });
}

export async function compareAction(i: { fileVersionId: string; copies?: number; combos: Array<{ label: string; machineProfileId: string; processProfileId: string; filamentProfileId: string }> }) {
  return safe(async () => {
    const u = await requirePerm('laminador', 'V');
    if (i.combos.length < 1 || i.combos.length > 8) throw new Error('Elige entre 1 y 8 combinaciones');
    const groupId = crypto.randomUUID(); const ids: string[] = [];
    for (const c of i.combos) ids.push(await enqueueSlice({ fileVersionId: i.fileVersionId, copies: i.copies ?? 1, label: c.label, groupId, userId: u.id, machineProfileId: c.machineProfileId, processProfileId: c.processProfileId, filamentProfileId: c.filamentProfileId }));
    return { groupId, ids };
  });
}

export async function factoryVendorsAction() { return safe(async () => { await requirePerm('laminador', 'V'); return listVendors(); }); }
export async function factoryListAction(type: ProfileType, vendor: string, machine?: string, q?: string) { return safe(async () => { await requirePerm('laminador', 'V'); return listFactory(type, vendor, { machine, q }); }); }

export async function createProfileAction(i: { type: ProfileType; name: string; baseName: string; vendor?: string; changes?: Record<string, any>; simulated?: boolean; notes?: string }) {
  return safe(async () => {
    const u = await requirePerm('laminador', 'C');
    if (!i.name.trim()) throw new Error('Ponle un nombre al perfil');
    const vendor = i.vendor || findVendorOf(i.type, i.baseName);
    if (!vendor) throw new Error('El perfil de fábrica elegido no existe');
    resolveFactory(i.type, i.baseName, vendor); // valida la cadena de herencia
    const db = await getDb();
    const [r] = await db.insert(s.slicerProfiles).values({ workspaceId: WORKSPACE_ID, type: i.type, name: i.name.trim(), vendor, baseName: i.baseName, changes: i.changes ?? {}, simulated: !!i.simulated, notes: i.notes ?? null, createdBy: u.id }).returning({ id: s.slicerProfiles.id });
    await db.insert(s.slicerProfileVersions).values({ profileId: r.id, version: 1, baseName: i.baseName, changes: i.changes ?? {}, createdBy: u.id, note: 'Versión inicial' });
    await audit('slicer_profile', r.id, 'crear', { name: i.name }, u.id);
    return r.id;
  }, ['/laminador']);
}

/** Editar un perfil crea una versión nueva (se puede volver atrás). */
export async function updateProfileAction(id: string, i: { name?: string; changes: Record<string, any>; baseName?: string; note?: string; simulated?: boolean; notes?: string }) {
  return safe(async () => {
    const u = await requirePerm('laminador', 'E');
    const db = await getDb();
    const [p] = await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.id, id));
    if (!p) throw new Error('Perfil no encontrado');
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
  return safe(async () => {
    const u = await requirePerm('laminador', 'E');
    const db = await getDb();
    const [v] = await db.select().from(s.slicerProfileVersions).where(and(eq(s.slicerProfileVersions.profileId, id), eq(s.slicerProfileVersions.version, version)));
    const [p] = await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.id, id));
    if (!v || !p) throw new Error('Versión no encontrada');
    const next = p.version + 1;
    await db.insert(s.slicerProfileVersions).values({ profileId: id, version: next, baseName: v.baseName, changes: v.changes, createdBy: u.id, note: `Vuelta a la versión ${version}` });
    await db.update(s.slicerProfiles).set({ baseName: v.baseName, changes: v.changes, version: next, updatedAt: new Date() }).where(eq(s.slicerProfiles.id, id));
    return { version: next };
  }, [`/laminador/perfiles/${id}`, '/laminador']);
}

export async function duplicateProfileAction(id: string, name: string) {
  return safe(async () => {
    const u = await requirePerm('laminador', 'C');
    const db = await getDb();
    const [p] = await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.id, id));
    if (!p) throw new Error('Perfil no encontrado');
    const [r] = await db.insert(s.slicerProfiles).values({ workspaceId: WORKSPACE_ID, type: p.type, name: name || `${p.name} (copia)`, vendor: p.vendor, baseName: p.baseName, changes: p.changes, simulated: p.simulated, notes: p.notes, createdBy: u.id }).returning({ id: s.slicerProfiles.id });
    await db.insert(s.slicerProfileVersions).values({ profileId: r.id, version: 1, baseName: p.baseName, changes: p.changes, createdBy: u.id, note: `Copia de ${p.name}` });
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
  return safe(async () => {
    const u = await requirePerm('laminador', 'C');
    let d: any; try { d = JSON.parse(i.json); } catch { throw new Error('El archivo no es un JSON válido'); }
    if (typeof d !== 'object' || !d) throw new Error('JSON inesperado');
    const type = (d.type as ProfileType) || i.type;
    let baseName: string | undefined = d.inherits && findVendorOf(type, d.inherits) ? d.inherits : undefined;
    if (!baseName) {
      const fb = getIndex().all.find((e) => e.type === type && /^fdm_(machine|process|filament)_common$|^fdm_.*common$/.test(e.name));
      baseName = fb?.name; if (!baseName) throw new Error('No se encontró un perfil base para este tipo');
    }
    const changes: Record<string, any> = {};
    for (const [k, v] of Object.entries(d)) if (!IGNORE.has(k)) changes[k] = v;
    const name = (i.name || d.name || 'Perfil importado').toString();
    const db = await getDb();
    const [r] = await db.insert(s.slicerProfiles).values({ workspaceId: WORKSPACE_ID, type, name, vendor: findVendorOf(type, baseName), baseName, changes, imported: true, createdBy: u.id }).returning({ id: s.slicerProfiles.id });
    await db.insert(s.slicerProfileVersions).values({ profileId: r.id, version: 1, baseName, changes, createdBy: u.id, note: 'Importado desde OrcaSlicer/Bambu Studio' });
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
