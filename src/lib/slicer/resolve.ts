import { and, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { linkedProfileId } from './links';
import { lineProfileOf } from '../services/lines';
import { ensureProfile, suggestFilamentBase } from './setup';

type Db = Awaited<ReturnType<typeof getDb>>;
/** De dónde salió el filamento: lo eligió la persona, viene de la ficha heredada del material, o se sugirió por marca/tipo. */
export type FilamentSource = 'explicit' | 'material' | 'auto';
export interface ResolvedFilament { profileId: string; name: string; baseName: string; source: FilamentSource }

/**
 * Resolvedor de filamento (D1): el material del inventario ya no obliga a tener un perfil técnico.
 * 1) elección explícita · 2) perfil por defecto del material (`material_filament_links`; el de esa impresora si existe) ·
 * 3) sugerido por marca + tipo + línea (perfil de fábrica de la marca o genérico del tipo).
 */
export async function resolveFilament(i: { materialId?: string | null; explicitProfileId?: string | null; machineProfileId?: string | null; userId?: string | null }, db?: Db): Promise<ResolvedFilament> {
  db ??= await getDb();
  const load = async (id: string) => (await db!.select().from(s.slicerProfiles).where(and(eq(s.slicerProfiles.id, id), isNull(s.slicerProfiles.deletedAt))))[0];
  if (i.explicitProfileId) {
    const p = await load(i.explicitProfileId);
    if (p?.type === 'filament') return { profileId: p.id, name: p.name, baseName: p.baseName, source: 'explicit' };
  }
  if (!i.materialId) throw new Error('filament: falta material o perfil');
  const [mat] = await db.select().from(s.materials).where(eq(s.materials.id, i.materialId));
  if (!mat) throw new Error('filament: material no encontrado');
  const linked = await linkedProfileId(mat.id, i.machineProfileId, db);
  if (linked) {
    const p = await load(linked);
    if (p) return { profileId: p.id, name: p.name, baseName: p.baseName, source: 'material' };
  }
  const viaLine = await lineProfileOf(mat.id, db);
  if (viaLine) { const p = await load(viaLine); if (p?.type === 'filament') return { profileId: p.id, name: p.name, baseName: p.baseName, source: 'material' }; }
  const machine = i.machineProfileId ? await load(i.machineProfileId) : null;
  const base = suggestFilamentBase(mat, machine?.baseName ?? null);
  if (!base) throw new Error('filament: no hay perfil de filamento para este tipo');
  const id = await ensureProfile('filament', base, base.replace(/ @.*$/, ''), i.userId, db);
  const p = await load(id);
  return { profileId: id, name: p?.name ?? base, baseName: base, source: 'auto' };
}
