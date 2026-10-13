import { and, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import type { ProfileType } from './catalog';

type Db = Awaited<ReturnType<typeof getDb>>;

/** Nombre único dentro del tipo: si ya existe, agrega « (2)», « (3)»… `exceptId` deja conservar el propio nombre al editar. */
export async function uniqueProfileName(db: Db, type: ProfileType, wanted: string, exceptId?: string) {
  const base = wanted.trim(); if (!base) throw new Error('Ponle un nombre al perfil');
  const rows = await db.select({ id: s.slicerProfiles.id, n: s.slicerProfiles.name }).from(s.slicerProfiles).where(and(eq(s.slicerProfiles.type, type), isNull(s.slicerProfiles.deletedAt)));
  const names = new Set(rows.filter((r) => r.id !== exceptId).map((r) => r.n.toLowerCase()));
  let name = base; for (let k = 2; names.has(name.toLowerCase()); k++) name = `${base} (${k})`;
  return name;
}

/**
 * Dónde se usa un perfil. `blocking` = configuración viva (máquinas, materiales, productos): no se puede eliminar sin cambiarlo antes.
 * `historic` = presupuestos y pedidos ya hechos: se pueden conservar porque cada corrida guarda su propia versión del perfil.
 */
export async function profileUsage(db: Db, id: string) {
  const [p] = await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.id, id)); if (!p) throw new Error('Perfil no encontrado');
  const blocking: string[] = []; let historic = 0;
  if (p.type === 'filament') {
    const mats = await db.select({ t: s.materials.type, c: s.materials.colorName, m: s.materials.manufacturer }).from(s.materials).where(and(eq(s.materials.filamentProfileId, id), isNull(s.materials.deletedAt)));
    for (const m of mats) blocking.push(`el material ${[m.m, m.t, m.c].filter(Boolean).join(' ')}`);
  } else {
    const ms = await db.select().from(s.machines).where(isNull(s.machines.deletedAt));
    for (const m of ms) {
      const inSetups = Object.values(m.nozzleSetups ?? {}).some((v) => v.machineProfileId === id || v.processProfileId === id);
      if (m.machineProfileId === id || m.defaultProcessProfileId === id || inSetups) blocking.push(`la máquina ${m.name}`);
    }
    if (p.type === 'process') {
      const prods = await db.select({ n: s.products.name }).from(s.products).where(and(eq(s.products.processProfileId, id), isNull(s.products.deletedAt)));
      for (const x of prods) blocking.push(`el producto ${x.n}`);
      historic = (await db.select({ id: s.quoteItems.id }).from(s.quoteItems).where(eq(s.quoteItems.processProfileId, id))).length + (await db.select({ id: s.orderItems.id }).from(s.orderItems).where(eq(s.orderItems.processProfileId, id))).length;
    }
  }
  return { blocking, historic };
}
