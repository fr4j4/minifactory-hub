import { and, asc, eq, isNull } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { BUILTIN_PRESETS, type PresetSpec } from './nozzle';

type Db = Awaited<ReturnType<typeof getDb>>;

/** Siembra (idempotente) las calidades de fábrica y respeta lo que el taller ya cambió. Es el «backfill» de `quality_presets`. */
export async function ensurePresets(db?: Db): Promise<number> {
  db ??= await getDb();
  const have = new Set((await db.select({ k: s.qualityPresets.key }).from(s.qualityPresets)).map((r) => r.k));
  let n = 0;
  for (const [i, p] of BUILTIN_PRESETS.entries()) {
    if (have.has(p.key)) continue;
    await db.insert(s.qualityPresets).values({ workspaceId: WORKSPACE_ID, key: p.key, builtin: true, layerFactor: p.f, wallMm: p.wall, wallNozzles: p.wallNozzles ?? null, topMm: p.top, bottomMm: p.bottom, infill: p.infill, sortOrder: i }).onConflictDoNothing(); // dos primeras peticiones a la vez no chocan
    n++;
  }
  return n;
}

const toSpec = (r: typeof s.qualityPresets.$inferSelect): PresetSpec => ({ key: r.key, label: r.label, f: r.layerFactor, wall: r.wallMm, wallNozzles: r.wallNozzles ?? undefined, top: r.topMm, bottom: r.bottomMm, infill: r.infill });

/** Calidades activas del taller, en orden. */
export async function loadPresets(db?: Db): Promise<PresetSpec[]> {
  db ??= await getDb(); await ensurePresets(db);
  const rows = await db.select().from(s.qualityPresets).where(and(isNull(s.qualityPresets.deletedAt), eq(s.qualityPresets.active, true))).orderBy(asc(s.qualityPresets.sortOrder), asc(s.qualityPresets.createdAt));
  return rows.map(toSpec);
}

export interface PresetInput { id?: string; key?: string; label?: string | null; layerFactor: number; wallMm: number; wallNozzles?: number | null; topMm: number; bottomMm: number; infill: string; active?: boolean }

const slug = (v: string) => v.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24);

/** Crea o edita una calidad. Las de fábrica conservan su clave; las nuevas la derivan del nombre. */
export async function savePreset(i: PresetInput, userId?: string | null, db?: Db): Promise<string> {
  db ??= await getDb(); await ensurePresets(db);
  const num = (v: number, lo: number, hi: number, what: string) => { if (!Number.isFinite(v) || v < lo || v > hi) throw new Error(`${what}: ${lo}–${hi}`); return v; };
  const v = { layerFactor: num(i.layerFactor, 0.15, 0.85, 'layer'), wallMm: num(i.wallMm, 0.4, 6, 'wall'), wallNozzles: i.wallNozzles == null ? null : num(i.wallNozzles, 1, 8, 'wallNozzles'), topMm: num(i.topMm, 0.4, 4, 'top'), bottomMm: num(i.bottomMm, 0.4, 4, 'bottom'), infill: /^\d{1,3}%$/.test(i.infill.trim()) && parseInt(i.infill) <= 100 ? i.infill.trim() : (() => { throw new Error('infill: 0%–100%'); })(), label: i.label?.trim() || null, active: i.active ?? true, updatedAt: new Date() };
  if (i.id) { await db.update(s.qualityPresets).set(v).where(eq(s.qualityPresets.id, i.id)); return i.id; }
  if (!v.label) throw new Error('label');
  let key = slug(v.label) || 'calidad'; const taken = new Set((await db.select({ k: s.qualityPresets.key }).from(s.qualityPresets)).map((r) => r.k)); let n = 2; const base = key; while (taken.has(key)) key = `${base}-${n++}`;
  const m = Math.max(0, ...(await db.select({ o: s.qualityPresets.sortOrder }).from(s.qualityPresets)).map((r) => r.o));
  const [row] = await db.insert(s.qualityPresets).values({ workspaceId: WORKSPACE_ID, key, builtin: false, sortOrder: m + 1, createdBy: userId ?? null, ...v }).returning({ id: s.qualityPresets.id });
  return row.id;
}

/** Quita una calidad propia (las de fábrica solo se desactivan). Los perfiles ya creados no se tocan. */
export async function removePreset(id: string, db?: Db) {
  db ??= await getDb();
  const [r] = await db.select().from(s.qualityPresets).where(eq(s.qualityPresets.id, id)); if (!r) return;
  if (r.builtin) await db.update(s.qualityPresets).set({ active: false, updatedAt: new Date() }).where(eq(s.qualityPresets.id, id));
  else await db.update(s.qualityPresets).set({ deletedAt: new Date() }).where(eq(s.qualityPresets.id, id));
}

/** Referencia a un perfil: o un perfil concreto, o una intención de calidad que se resuelve contra una impresora. */
export type ProfileRef = { kind: 'profile'; id: string } | { kind: 'quality'; key: string; machineProfileId: string };

export async function resolveProfileRef(ref: ProfileRef, userId?: string | null, db?: Db): Promise<string> {
  if (ref.kind === 'profile') return ref.id;
  const { ensureQuality } = await import('./setup');
  return (await ensureQuality({ machineProfileId: ref.machineProfileId, key: ref.key, userId }, db)).id;
}

/** Todas las calidades (también las desactivadas) para la pantalla de Configuración. */
export async function presetRows(db?: Db) {
  db ??= await getDb(); await ensurePresets(db);
  const rows = await db.select().from(s.qualityPresets).where(isNull(s.qualityPresets.deletedAt)).orderBy(asc(s.qualityPresets.sortOrder), asc(s.qualityPresets.createdAt));
  return rows.map((r) => ({ ...toSpec(r), id: r.id, builtin: r.builtin, active: r.active }));
}
