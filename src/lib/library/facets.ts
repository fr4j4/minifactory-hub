import { and, eq, sql, type SQL } from 'drizzle-orm';
import { s, type getDb } from '@/db';
import type { SessionUser } from '../auth';
import { fitsMachine, libraryFilters } from './search';

type Db = Awaited<ReturnType<typeof getDb>>;
export interface Facet { value: string; n: number }
export interface LibraryFacets {
  formats: Facet[]; tags: Facet[]; categories: Facet[]; sources: Facet[]; collections: Facet[]; licenses: Facet[]; fits: Facet[];
  flags: Record<'fav' | 'photo' | 'turn' | 'multicolor' | 'used', number>;
}

const rowsOf = <T,>(r: unknown) => (Array.isArray(r) ? r : (r as { rows: T[] }).rows) as T[];

/**
 * Conteos por faceta para la barra lateral de la biblioteca. Cada faceta de selección múltiple
 * cuenta sin su propio filtro (así se ven las otras opciones); etiquetas y características refinan.
 */
export async function libraryFacets(db: Db, user: SessionUser, sp: Record<string, string | undefined>, machineIds: string[]): Promise<LibraryFacets> {
  const ids = (omit: string[]) => {
    const q: Record<string, string | undefined> = { ...sp, cursor: undefined };
    for (const k of omit) q[k] = undefined;
    return db.select({ id: s.modelFiles.id }).from(s.modelFiles).leftJoin(s.fileVersions, eq(s.fileVersions.id, s.modelFiles.currentVersionId)).where(and(...libraryFilters(user, q)));
  };
  const facet = async (query: SQL) => rowsOf<Facet>(await db.execute(query)).map((r) => ({ value: String(r.value), n: Number(r.n) }));
  const count = (cond: SQL) => sql<number>`(count(*) filter (where ${cond}))::int`;
  const [formats, tags, categories, sources, collections, licenses, [flags], fitsRow] = await Promise.all([
    facet(sql`select format as value, count(*)::int as n from model_files where id in (${ids(['formats', 'format'])}) and coalesce(format,'')<>'' group by format order by n desc, format`),
    facet(sql`select tg as value, count(*)::int as n from model_files m, jsonb_array_elements_text(coalesce(m.tags,'[]'::jsonb)) tg where m.id in (${ids([])}) group by tg order by n desc, tg limit 80`),
    facet(sql`select ld.data->>'category' as value, count(distinct ld.model_id)::int as n from library_details ld where ld.model_id in (${ids(['category'])}) and coalesce(ld.data->>'category','')<>'' group by 1 order by n desc, 1 limit 40`),
    facet(sql`select le.source_id::text as value, count(distinct le.model_id)::int as n from library_entries le where le.model_id in (${ids(['sources', 'source'])}) group by 1`),
    facet(sql`select cm.collection_id::text as value, count(distinct cm.model_id)::int as n from library_collection_models cm where cm.model_id in (${ids(['collection'])}) group by 1`),
    facet(sql`select license as value, count(*)::int as n from model_files where id in (${ids(['license'])}) and coalesce(license,'')<>'' group by license order by n desc, license limit 20`),
    db.select({
      fav: count(sql`${s.modelFiles.favorite}`),
      photo: count(sql`exists(select 1 from photos p where p.model_file_id=${s.modelFiles.id} and p.deleted_at is null)`),
      turn: count(sql`${s.fileVersions.meta}->>'turnKey' is not null`),
      multicolor: count(sql`${s.fileVersions.meta}->'ams'->>'multicolor'='true'`),
      used: count(sql`exists(select 1 from quote_item_models qm where qm.model_file_id=${s.modelFiles.id})`),
    }).from(s.modelFiles).leftJoin(s.fileVersions, eq(s.fileVersions.id, s.modelFiles.currentVersionId)).where(and(...libraryFilters(user, { ...sp, cursor: undefined }))),
    machineIds.length
      ? db.select(Object.fromEntries(machineIds.map((id, i) => [`m${i}`, count(fitsMachine(sql`${id}::uuid`))]))).from(s.modelFiles).leftJoin(s.fileVersions, eq(s.fileVersions.id, s.modelFiles.currentVersionId)).where(and(...libraryFilters(user, { ...sp, cursor: undefined, fits: undefined })))
      : Promise.resolve([{}]),
  ]);
  const fits = machineIds.map((id, i) => ({ value: id, n: Number((fitsRow[0] as Record<string, number>)[`m${i}`] || 0) }));
  return { formats, tags, categories, sources, collections, licenses, fits, flags };
}
