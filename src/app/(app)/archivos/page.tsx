import Link from 'next/link';
import { inFolder, listFolders, tagColors } from '@/lib/library/folders';
import { FolderManager } from '@/components/folder-manager';
import { and, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader, Badge, Empty, Card } from '@/components/ui';
import { Uploader } from '@/components/uploader';
import { FileGrid, type FileCard } from '@/components/file-grid';
import { formatLabel } from '@/lib/files';
import { num } from '@/lib/format';
import { getT } from '@/i18n/server';

export async function generateMetadata() { return { title: (await getT())('meta.files') }; }

const LIMIT = 200;
export default async function FilesPage({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string; folder?: string; fav?: string }> }) {
  const t = await getT();
  const user = await pagePerm('archivos', 'V'); const sp = await searchParams; const db = await getDb();
  const conds = [isNull(s.modelFiles.deletedAt)];
  if (sp.q) conds.push(or(ilike(s.modelFiles.name, `%${sp.q}%`), ilike(s.modelFiles.origin, `%${sp.q}%`), sql`${s.modelFiles.tags}::text ilike ${'%' + sp.q + '%'}`)!);
  if (sp.tag) conds.push(sql`${s.modelFiles.tags}::text ilike ${'%"' + sp.tag + '"%'}`);
  if (sp.folder) conds.push(inFolder(sp.folder));
  if (sp.fav) conds.push(eq(s.modelFiles.favorite, true));
  const rows = await db.select({ f: s.modelFiles, v: s.fileVersions }).from(s.modelFiles).leftJoin(s.fileVersions, eq(s.fileVersions.id, s.modelFiles.currentVersionId)).where(and(...conds)).orderBy(desc(s.modelFiles.favorite), desc(s.modelFiles.updatedAt)).limit(LIMIT);
  const all = await db.select({ tags: s.modelFiles.tags, folder: s.modelFiles.folder }).from(s.modelFiles).where(isNull(s.modelFiles.deletedAt));
  const tags = [...new Set(all.flatMap((a) => a.tags ?? []))].sort(); const folderRows = await listFolders(db); const folders = folderRows.map((f) => f.path); const colors = await tagColors(db);
  // insignias de uso: cabe en máquinas, laminados y presupuestos (una consulta por tipo, no por modelo)
  const machines = await db.select({ name: s.machines.name, x: s.machines.volX, y: s.machines.volY, z: s.machines.volZ }).from(s.machines).where(isNull(s.machines.deletedAt));
  const vIds = rows.map((r) => r.v?.id).filter(Boolean) as string[]; const fIds = rows.map((r) => r.f.id);
  const sliceCount = new Map((vIds.length ? await db.select({ id: s.sliceRuns.fileVersionId, n: sql<number>`count(*)::int` }).from(s.sliceRuns).where(inArray(s.sliceRuns.fileVersionId, vIds)).groupBy(s.sliceRuns.fileVersionId) : []).map((r) => [r.id, Number(r.n)]));
  const quoteCount = new Map((fIds.length ? await db.select({ id: s.quoteItemModels.modelFileId, n: sql<number>`count(distinct ${s.quoteItemModels.quoteItemId})::int` }).from(s.quoteItemModels).where(inArray(s.quoteItemModels.modelFileId, fIds)).groupBy(s.quoteItemModels.modelFileId) : []).map((r) => [r.id, Number(r.n)]));
  const fitsOf = (f: (typeof rows)[number]['f']) => !f.dimX || !f.dimY || !f.dimZ || f.format === 'gcode' ? [] : machines.filter((m) => { const d = [f.dimX!, f.dimY!, f.dimZ!].sort((p, q) => q - p), v = [m.x, m.y, m.z].sort((p, q) => q - p); return d.every((n, i) => n <= v[i]); }).map((m) => m.name);
  const cards: FileCard[] = rows.map(({ f, v }) => ({ id: f.id, name: f.name, format: formatLabel(f.format ?? ''), versionId: v?.id ?? null, hasThumb: !!v?.thumbKey, hasTurn: !!(v?.meta as any)?.turnKey, dims: f.dimX ? `${num(f.dimX, 1)}×${num(f.dimY, 1)}×${num(f.dimZ, 1)} mm${f.volumeCm3 ? ` · ${num(f.volumeCm3, 1)} cm³` : ''}` : '—', tags: f.tags ?? [], favorite: f.favorite, closed: f.closed, version: v?.number ?? 1, fits: fitsOf(f), slices: v ? sliceCount.get(v.id) ?? 0 : 0, quotes: quoteCount.get(f.id) ?? 0, multicolor: !!(v?.meta as any)?.ams?.multicolor }));
  const tagCount = new Map<string, number>(); for (const a of all) for (const tg of a.tags ?? []) tagCount.set(tg, (tagCount.get(tg) ?? 0) + 1);
  const vocabulary = [...tagCount.entries()].map(([tag, n]) => ({ tag, n })).sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag));
  return (
    <>
      <PageHeader title={t('files.n3dFiles')} subtitle={t('files.modelLibraryWithVersionsAutomati')} />
      {can(user, 'archivos', 'C') && <Card className="mb-4"><Uploader intent={{ intent: 'model' }} accept=".zip,.stl,.3mf,.obj,.ply,.amf,.glb,.step,.stp,.gcode,.gco,.bgcode,.png,.jpg,.jpeg,.webp,.pdf" label={t('files.dropYourModelsHereStl')} hint={t('files.upTo500MbPer')} testId="model-uploader" /></Card>}
      <form className="filter-bar flex flex-wrap gap-2 mb-4" role="search">
        <input name="q" defaultValue={sp.q} placeholder={t('files.searchByNameTagSource')} className="input sm:max-w-xs" aria-label={t('files.searchFiles')} />
        <select name="tag" defaultValue={sp.tag ?? ''} className="input sm:!w-44" aria-label={t('common.tag')}><option value="">{t('files.allTags')}</option>{tags.map((tt) => <option key={tt}>{tt}</option>)}</select>
        {folders.length > 0 && <select name="folder" defaultValue={sp.folder ?? ''} className="input sm:!w-44" aria-label={t('files.folder')}><option value="">{t('files.allFolders')}</option>{folders.map((tt) => <option key={tt}>{tt}</option>)}</select>}
        <label className="flex items-center gap-1.5 text-sm px-1"><input type="checkbox" name="fav" value="1" defaultChecked={!!sp.fav} /> {t('files.favorites')}</label>
        <button className="btn-ghost">{t('common.filter')}</button>
      </form>
      {can(user, 'archivos', 'E') && <FolderManager folders={folderRows} tags={vocabulary.map((v) => ({ ...v, color: colors.get(v.tag) ?? null }))} />}
      {rows.length === LIMIT && <p className="text-xs muted mb-3" role="status">{t('common.listCapped', { n: LIMIT })}</p>}
      {rows.length === 0 ? (sp.q || sp.tag || sp.folder || sp.fav ? <Card><Empty title={t('common.noMatches')} action={<Link className="btn-ghost" href="/archivos">{t('common.clearFilters')}</Link>} /></Card> : <Card><Empty title={t('files.noFiles')} hint={t('files.uploadAnStlOr3mf')} /></Card>) : (
        <FileGrid canEdit={can(user, 'archivos', 'E')} vocabulary={vocabulary} cards={cards} tagColors={Object.fromEntries(colors)} />
      )}
    </>
  );
}
