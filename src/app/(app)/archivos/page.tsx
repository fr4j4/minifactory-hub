import {libraryFilters} from '@/lib/library/search';
import {libraryFacets} from '@/lib/library/facets';
import {NaturalSearch} from '@/components/library-advanced';
import { modelAccess, sourceAccess } from '@/lib/library/access';
import Link from 'next/link';
import { and, desc, eq, isNull, or, sql, lt, inArray } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader, Card, Empty } from '@/components/ui';
import { FileGrid, FileTable, type FileCard } from '@/components/file-grid';
import { FolderManager } from '@/components/folder-manager';
import { Uploader } from '@/components/uploader';
import { LibraryUrlImport, SaveLibraryView } from '@/components/library-manager';
import { AddModelsPanel, AutoSubmitSelect, FacetItems, FiltersPanel } from '@/components/library-browser';
import { listFolders, tagColors } from '@/lib/library/folders';
import { formatLabel } from '@/lib/files';
import { getT } from '@/i18n/server';
import { z } from 'zod';
import { LayoutGrid, List, Search, X } from 'lucide-react';
import type { ReactNode } from 'react';
export async function generateMetadata() { return { title: (await getT())('meta.files') }; }
const LIMIT = 48;
/** Claves de filtro que admiten varios valores separados por coma. */
const CSV = ['formats', 'allTags', 'anyTags', 'sources'] as const;
/** Filtros que viven en «Más filtros» (formulario); el resto se maneja con facetas. */
const MORE = ['folder', 'state', 'closed', 'processing', 'min', 'max', 'dimension', 'dimX', 'dimY', 'dimZ', 'volumeMin', 'volumeMax', 'trianglesMin', 'trianglesMax', 'createdAfter', 'createdBefore', 'author', 'project', 'physical', 'incomplete', 'archived'] as const;
const FLAGS = ['fav', 'photo', 'turn', 'multicolor', 'used'] as const;
export default async function FilesPage({ searchParams }: {
    searchParams: Promise<Record<string, string | undefined>>;
}) {
    const t = await getT(), user = await pagePerm('archivos', 'V'), rawSp = await searchParams, db = await getDb();
    const sp=Object.fromEntries(Object.entries(rawSp).map(([k,v])=>[k,Array.isArray(v)?v.join(','):v]));
    const conds=libraryFilters(user,sp);
    const [{ total }] = await db.select({ total: sql<number> `count(*)::int` }).from(s.modelFiles).leftJoin(s.fileVersions, eq(s.fileVersions.id, s.modelFiles.currentVersionId)).where(and(...conds));
    const sort=sp.sort==='relevance'?sql`ts_rank(to_tsvector('simple',coalesce(${s.modelFiles.name},'')),plainto_tsquery('simple',${sp.q||''}))`:sp.sort==='usage'?sql`(select count(*) from quote_item_models qm where qm.model_file_id=${s.modelFiles.id})`:sp.sort==='favorites'?sql`case when ${s.modelFiles.favorite} then 1 else 0 end`:sp.sort==='name'?sql`lower(${s.modelFiles.name})`:sp.sort==='size'?sql`coalesce(${s.fileVersions.size},-1)`:sql`${s.modelFiles.updatedAt}`;
    const direction=sp.sort==='name'?'asc':'desc';const type=sp.sort==='name'?'text':['size','favorites','usage','relevance'].includes(sp.sort||'')?'double precision':'timestamptz';
    if(sp.cursor){try{const c=JSON.parse(Buffer.from(sp.cursor,'base64url').toString());if(typeof c.at==='string'&&c.at.length<1000&&(type==='text'||type==='timestamptz'&&Number.isFinite(Date.parse(c.at))||type==='double precision'&&c.at.trim()!==''&&Number.isFinite(Number(c.at)))&&z.uuid().safeParse(c.id).success&&c.sort===(sp.sort||'updated'))conds.push(or(sql`${sort} ${sql.raw(direction==='asc'?'>':'<')} ${String(c.at)}::${sql.raw(type)}`,and(sql`${sort}=${String(c.at)}::${sql.raw(type)}`,lt(s.modelFiles.id,c.id)))!);}catch{}}
    const found=await db.select({f:s.modelFiles,v:s.fileVersions,cursorAt:sql<string>`${sort}::text`}).from(s.modelFiles).leftJoin(s.fileVersions,eq(s.fileVersions.id,s.modelFiles.currentVersionId)).where(and(...conds)).orderBy(sql`${sort} ${sql.raw(direction)}`,desc(s.modelFiles.id)).limit(LIMIT+1);
    const rows = found.slice(0, LIMIT);
    const folders = await listFolders(db,modelAccess(user)), colors = await tagColors(db);
    const tagResult = await db.execute(sql `select distinct jsonb_array_elements_text(coalesce(tags,'[]'::jsonb)) as tag from model_files where workspace_id=${WORKSPACE_ID}::uuid and deleted_at is null and ${modelAccess(user)} order by tag limit 500`);
    const tagRows = (Array.isArray(tagResult) ? tagResult : tagResult.rows) as {
        tag: string;
    }[];
    const sources = await db.select({ id: s.librarySources.id, name: s.librarySources.name, status: s.librarySources.status, last: s.librarySources.lastScanAt }).from(s.librarySources).where(and(sourceAccess(user),eq(s.librarySources.workspaceId, WORKSPACE_ID), isNull(s.librarySources.deletedAt)));
    const collections = await db.select().from(s.libraryCollections).where(and(eq(s.libraryCollections.workspaceId, WORKSPACE_ID), isNull(s.libraryCollections.deletedAt)));
    const machines = await db.select({ id: s.machines.id, name: s.machines.name, x: s.machines.volX, y: s.machines.volY, z: s.machines.volZ }).from(s.machines).where(and(eq(s.machines.workspaceId, WORKSPACE_ID), isNull(s.machines.deletedAt)));
    const facets = await libraryFacets(db, user, sp, machines.map(m => m.id));
    const versionIds = rows.flatMap(r => r.v ? [r.v.id] : []), modelIds = rows.map(r => r.f.id);
    const sliceCounts = new Map((versionIds.length ? await db.select({ id: s.sliceRuns.fileVersionId, n: sql<number> `count(*)::int` }).from(s.sliceRuns).where(inArray(s.sliceRuns.fileVersionId, versionIds)).groupBy(s.sliceRuns.fileVersionId) : []).map(r => [r.id, r.n]));
    const quoteCounts = new Map((modelIds.length ? await db.select({ id: s.quoteItemModels.modelFileId, n: sql<number> `count(*)::int` }).from(s.quoteItemModels).where(inArray(s.quoteItemModels.modelFileId, modelIds)).groupBy(s.quoteItemModels.modelFileId) : []).map(r => [r.id, r.n]));
    const fits = (f: typeof rows[number]['f']) => [f.dimX, f.dimY, f.dimZ].every(x => x !== null) && !['gcode', 'bgcode', 'gco'].includes(f.format || '') ? machines.filter(m => [f.dimX!, f.dimY!, f.dimZ!].sort((a, b) => b - a).every((n, i) => n <= [m.x, m.y, m.z].sort((a, b) => b - a)[i])).map(m => m.name) : [];
    const coverRows=modelIds.length?await db.select({modelId:s.libraryPhotoLinks.modelId,data:s.libraryPhotoLinks.data,variants:s.photos.variants}).from(s.libraryPhotoLinks).innerJoin(s.photos,eq(s.photos.id,s.libraryPhotoLinks.photoId)).where(and(inArray(s.libraryPhotoLinks.modelId,modelIds),sql`${s.libraryPhotoLinks.data}->>'cover'='true'`,isNull(s.photos.deletedAt))).orderBy(desc(s.libraryPhotoLinks.updatedAt)):[];
    const cards: FileCard[] = rows.map(({ f, v }) => { const cover = coverRows.find(c=>c.modelId===f.id); return { id: f.id, name: f.name, cover:cover?.data.editedKey||cover?.variants?.['320'],format: formatLabel(f.format || ''), versionId: v?.id || null, hasThumb: !!v?.thumbKey, hasTurn: !!v?.meta?.turnKey, dims: f.dimX !== null ? `${f.dimX.toFixed(1)} × ${f.dimY?.toFixed(1)} × ${f.dimZ?.toFixed(1)} mm` : '—', tags: f.tags || [], favorite: f.favorite, closed: f.closed, version: v?.number || 1, fits: fits(f), slices: v ? sliceCounts.get(v.id) || 0 : 0, quotes: quoteCounts.get(f.id) || 0, multicolor: !!v?.meta?.ams?.multicolor, size: v?.size ?? null, updatedAt: f.updatedAt.toISOString(), author: f.author, license: f.license, remote: !!v && !v.storageKey }; });
    // Enlaces: cada clic en una faceta vuelve a la primera página
    const query = (patch: Record<string, string | undefined>) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries({ ...sp, cursor: undefined, ...patch }))
        if (v)
            q.set(k, v); return '/archivos?' + q; };
    const csv = (k: string) => (sp[k] || '').split(',').map(x => x.trim()).filter(Boolean);
    const toggleCsv = (k: string, value: string) => { const cur = csv(k); return query({ [k]: (cur.includes(value) ? cur.filter(x => x !== value) : [...cur, value]).join(',') || undefined }); };
    const toggleOne = (k: string, value: string) => query({ [k]: sp[k] === value ? undefined : value });
    const last = rows.at(-1)?.f;
    const tagCount = new Map(facets.tags.map(f => [f.value, f.n]));
    const vocabulary = tagRows.map(r => ({ tag: r.tag, n: tagCount.get(r.tag) || 0 }));
    const sourceName = new Map(sources.map(x => [x.id, x.name])), collectionName = new Map(collections.map(c => [c.id, c.name])), machineName = new Map(machines.map(m => [m.id, m.name]));
    // Chips de filtros activos (uno por valor en las claves de varios valores)
    const label = (k: string) => ({ q: t('common.search' as any), format: t('library.format'), formats: t('library.format'), allTags: t('library.tagsFacet'), tag: t('library.tagsFacet'), anyTags: t('library.anyTags'), category: t('library.category'), source: t('library.source'), sources: t('library.source'), collection: t('library.collection'), license: t('library.license'), fits: t('library.fitsIn'), fav: t('files.favorites'), photo: t('library.hasPhoto'), turn: t('library.hasTurn'), multicolor: t('files.badgeMulticolor'), used: t('library.usedInQuotes'), author: t('library.authorName') } as Record<string, string>)[k] || (MORE.includes(k as any) ? (k === 'min' ? t('library.minSize') : k === 'max' ? t('library.maxSize') : k === 'dimension' ? t('library.maxDimension') : k === 'folder' ? t('files.folder') : t(`library.${k}` as any)) : k);
    const pretty = (k: string, v: string) => k === 'sources' || k === 'source' ? (v === 'internal' ? t('library.internal') : sourceName.get(v) || v) : k === 'collection' ? collectionName.get(v) || v : k === 'fits' ? machineName.get(v) || v : (FLAGS as readonly string[]).includes(k) || k === 'incomplete' || k === 'archived' ? '' : v;
    const chips: Array<{ key: string; text: string; href: string }> = [];
    for (const [k, v] of Object.entries(sp)) {
        if (!v || ['cursor', 'sort', 'view'].includes(k)) continue;
        if ((CSV as readonly string[]).includes(k)) for (const one of csv(k)) chips.push({ key: k + one, text: `${label(k)}: ${pretty(k, one)}`, href: toggleCsv(k, one) });
        else { const p = pretty(k, v); chips.push({ key: k, text: p ? `${label(k)}: ${p}` : label(k), href: query({ [k]: undefined }) }); }
    }
    const hidden = (omit: readonly string[]) => Object.entries(sp).filter(([k, v]) => v && k !== 'cursor' && !omit.includes(k)).map(([k, v]) => <input key={k} type="hidden" name={k} value={v}/>);
    const sortOptions = ['updated', 'name', 'size', 'relevance', 'usage', 'favorites'].map(k => ({ value: k, label: t(`library.${['updated','relevance','usage','favorites'].includes(k)?k:k+'Sort'}` as any) }));
    const view = sp.view === 'table' ? 'table' : 'grid';
    const Section = ({ title, children }: { title: string; children: ReactNode }) => <section className="py-3 border-b border-[var(--line)] last:border-0"><h3 className="eyebrow mb-1.5 px-2">{title}</h3>{children}</section>;
    const flagItems = FLAGS.map(k => ({ key: k, href: toggleOne(k, '1'), label: label(k), n: facets.flags[k], on: !!sp[k] })).filter(x => x.n > 0 || x.on);
    const activeCount = chips.length;
    return <><PageHeader title={t('files.n3dFiles')} subtitle={t('library.results', { n: total })} actions={<>{can(user, 'config', 'E') && <Link className="btn-ghost" href="/archivos/fuentes">{t('library.sources')}</Link>}<Link className="btn-ghost" href="/archivos/revision">{t('library.review')}</Link></>}/>
 {can(user, 'archivos', 'C') && <div className="flex flex-wrap items-center gap-2 mb-4"><AddModelsPanel><Card><Uploader intent={{ intent: 'model' }} accept=".zip,.stl,.3mf,.obj,.ply,.amf,.glb,.gltf,.step,.stp,.gcode,.gco,.bgcode,.png,.jpg,.jpeg,.webp,.pdf" label={t('files.dropYourModelsHereStl')} hint={t('files.upTo500MbPer')}/></Card><LibraryUrlImport /></AddModelsPanel>{sources.length > 0 && <div className="flex gap-1.5 flex-wrap text-xs">{sources.map(src => <span className="badge badge-led" key={src.id} title={src.last ? new Date(src.last).toLocaleString() : t('library.never')}>{src.name} · {src.status}</span>)}</div>}</div>}
 {await (await import('@/lib/ai')).aiAvailableFor(user,'library.search')&&<NaturalSearch/>}
 <div className="grid md:grid-cols-[15rem_minmax(0,1fr)] xl:grid-cols-[16.5rem_minmax(0,1fr)] gap-5 items-start">
 <FiltersPanel active={activeCount}>
  {facets.fits.some(f => f.n > 0 || sp.fits === f.value) && <Section title={t('library.fitsIn')}><FacetItems items={facets.fits.filter(f => f.n > 0 || sp.fits === f.value).map(f => ({ key: f.value, href: toggleOne('fits', f.value), label: machineName.get(f.value) || f.value, n: f.n, on: sp.fits === f.value }))}/></Section>}
  {facets.categories.length > 0 && <Section title={t('library.category')}><FacetItems items={facets.categories.map(f => ({ key: f.value, href: toggleOne('category', f.value), label: f.value, n: f.n, on: sp.category === f.value }))}/></Section>}
  <Section title={t('library.tagsFacet')}>{facets.tags.length ? <FacetItems limit={10} items={facets.tags.map(f => ({ key: f.value, href: toggleCsv('allTags', f.value), label: f.value, n: f.n, on: csv('allTags').includes(f.value), swatch: colors.get(f.value) || null }))}/> : <p className="muted text-xs px-2">{t('library.noFacetData')}</p>}</Section>
  {facets.formats.length > 0 && <Section title={t('library.format')}><FacetItems items={facets.formats.map(f => ({ key: f.value, href: toggleCsv('formats', f.value), label: formatLabel(f.value), n: f.n, on: csv('formats').includes(f.value) }))}/></Section>}
  {flagItems.length > 0 && <Section title={t('library.attributes')}><FacetItems items={flagItems}/></Section>}
  {facets.sources.length > 0 && <Section title={t('library.source')}><FacetItems items={facets.sources.filter(f => sourceName.has(f.value)).map(f => ({ key: f.value, href: toggleCsv('sources', f.value), label: sourceName.get(f.value)!, n: f.n, on: csv('sources').includes(f.value) }))}/></Section>}
  {facets.collections.length > 0 && <Section title={t('library.collection')}><FacetItems items={facets.collections.filter(f => collectionName.has(f.value)).map(f => ({ key: f.value, href: toggleOne('collection', f.value), label: collectionName.get(f.value)!, n: f.n, on: sp.collection === f.value }))}/></Section>}
  {facets.licenses.length > 1 && <Section title={t('library.license')}><FacetItems items={facets.licenses.map(f => ({ key: f.value, href: toggleOne('license', f.value), label: f.value, n: f.n, on: sp.license === f.value }))}/></Section>}
  <details className="py-3" open={MORE.some(k => !!sp[k])}><summary className="eyebrow px-2 cursor-pointer">{t('library.moreFilters')}</summary>
   <form className="grid gap-2.5 mt-3 px-1 text-xs">{hidden(MORE)}
    <label className="grid gap-1">{t('files.folder')}<select className="input" name="folder" defaultValue={sp.folder || ''}><option value="">—</option>{folders.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}</select></label>
    <label className="grid gap-1">{t('library.state')}<select className="input" name="state" defaultValue={sp.state || ''}><option value="">—</option>{(['local', 'remote', 'missing'] as const).map(k => <option key={k} value={k}>{t(`library.${k}`)}</option>)}</select></label>
    <label className="grid gap-1">{t('library.closed')}<select className="input" name="closed" defaultValue={sp.closed||''}><option value="">—</option>{['yes','no','unknown'].map(k=><option key={k} value={k}>{t(`library.${k==='yes'?'closed':k==='no'?'open':'unknown'}` as any)}</option>)}</select></label>
    <label className="grid gap-1">{t('library.processing')}<select className="input" name="processing" defaultValue={sp.processing||''}><option value="">—</option>{['indexed','processing','ready','partial','error'].map(k=><option key={k}>{k}</option>)}</select></label>
    <div className="grid grid-cols-2 gap-2">{(['min', 'max'] as const).map((k, i) => <label key={k} className="grid gap-1">{t(['library.minSize', 'library.maxSize'][i] as any)}<input type="number" min="0" step="any" className="input" name={k} defaultValue={sp[k]}/></label>)}</div>
    <label className="grid gap-1">{t('library.maxDimension')}<input type="number" min="0" step="any" className="input" name="dimension" defaultValue={sp.dimension}/></label>
    <div className="grid grid-cols-3 gap-2">{(['dimX', 'dimY', 'dimZ'] as const).map(k => <label key={k} className="grid gap-1">{k.slice(-1).toUpperCase()}<input type="number" min="0" step="any" className="input" name={k} defaultValue={sp[k]} aria-label={t(`library.${k}`)}/></label>)}</div>
    <div className="grid grid-cols-2 gap-2">{(['volumeMin','volumeMax','trianglesMin','trianglesMax'] as const).map(k => <label key={k} className="grid gap-1">{t(`library.${k}` as any)}<input type="number" min="0" step="any" className="input" name={k} defaultValue={sp[k]}/></label>)}</div>
    <div className="grid grid-cols-2 gap-2">{(['createdAfter','createdBefore'] as const).map(k => <label key={k} className="grid gap-1">{t(`library.${k}` as any)}<input type="date" className="input" name={k} defaultValue={sp[k]}/></label>)}</div>
    {(['author','project','physical'] as const).map(k => <label key={k} className="grid gap-1">{k === 'author' ? t('library.authorName') : t(`library.${k}` as any)}<input className="input" name={k} defaultValue={sp[k]||''}/></label>)}
    <label className="flex items-center gap-2"><input type="checkbox" name="incomplete" value="1" defaultChecked={!!sp.incomplete}/> {t('library.incomplete')}</label><label className="flex items-center gap-2"><input type="checkbox" name="archived" value="1" defaultChecked={!!sp.archived}/> {t('library.archived')}</label>
    <button className="btn-primary btn-sm">{t('common.filter')}</button>
   </form>
  </details>
 </FiltersPanel>
 <div className="min-w-0">
  <form className="flex flex-wrap md:flex-nowrap items-center gap-2 mb-3" role="search">{hidden(['q', 'sort'])}
   <div className="relative flex-1 min-w-[12rem]"><Search className="h-4 w-4 muted absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden/><input className="input !pl-9" type="search" name="q" defaultValue={sp.q} aria-label={t('files.searchByNameTagSource')} placeholder={t('library.searchPlaceholder')}/></div>
   <AutoSubmitSelect name="sort" value={sp.sort || 'updated'} options={sortOptions} label={t('library.sortBy')}/>
   <div className="flex rounded-xl border border-[var(--line)] overflow-hidden shrink-0" role="group" aria-label={t('library.table') + ' / ' + t('library.grid')}>
    <Link href={query({ view: undefined })} aria-current={view === 'grid' ? 'page' : undefined} aria-label={t('library.grid')} title={t('library.grid')} className={`px-3 min-h-[44px] md:min-h-[38px] grid place-items-center ${view === 'grid' ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'hover:bg-[var(--hover)]'}`}><LayoutGrid className="h-4 w-4" aria-hidden/></Link>
    <Link href={query({ view: 'table' })} aria-current={view === 'table' ? 'page' : undefined} aria-label={t('library.table')} title={t('library.table')} className={`px-3 min-h-[44px] md:min-h-[38px] grid place-items-center border-l border-[var(--line)] ${view === 'table' ? 'bg-[var(--accent-soft)] text-[var(--accent-ink)]' : 'hover:bg-[var(--hover)]'}`}><List className="h-4 w-4" aria-hidden/></Link>
   </div>
   <SaveLibraryView scope={`${user.workspaceId}:${user.id}`}/>
  </form>
  {chips.length > 0 && <div className="flex flex-wrap items-center gap-1.5 mb-3" aria-label={t('library.activeFilters')}>{chips.map(c => <Link key={c.key} href={c.href} scroll={false} className="badge !py-1 bg-[var(--accent-soft)] border-[var(--accent-line)] hover:border-[var(--accent)]">{c.text}<X className="h-3 w-3" aria-hidden/></Link>)}<Link href="/archivos" className="text-xs text-[var(--accent-ink)] hover:underline ml-1">{t('library.clearAll')}</Link></div>}
  {!rows.length ? <Card><Empty title={t('common.noMatches')}/></Card> : view === 'table' ? <FileTable cards={cards} sortHrefs={Object.fromEntries(['name', 'size', 'updated'].map(k => [k, query({ sort: k })]))} sort={sp.sort || 'updated'}/> : <FileGrid scope={`${user.workspaceId}:${user.id}`} canEdit={can(user, 'archivos', 'E')} vocabulary={vocabulary} cards={cards} tagColors={Object.fromEntries(colors)}/>}
  <nav className="flex justify-between mt-4" aria-label="Pagination">{sp.cursor ? <Link className="btn-ghost" href={query({ cursor: undefined })}>{t('library.firstPage')}</Link> : <span />}{found.length > LIMIT && last && <Link className="btn-primary" href={query({ cursor: Buffer.from(JSON.stringify({ at: rows.at(-1)!.cursorAt, id: last.id, sort:sp.sort||'updated' })).toString('base64url') })}>{t('library.next')}</Link>}</nav>
  {can(user, 'archivos', 'E') && <div className="mt-6"><FolderManager folders={folders} tags={vocabulary.map(v => ({ ...v, color: colors.get(v.tag) || null }))}/></div>}
 </div>
 </div></>;
}
