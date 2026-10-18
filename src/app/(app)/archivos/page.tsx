import {libraryFilters} from '@/lib/library/search';
import {NaturalSearch} from '@/components/library-advanced';
import { modelAccess, sourceAccess } from '@/lib/library/access';
import Link from 'next/link';
import { and, desc, eq, ilike, isNull, or, sql, lt, inArray } from 'drizzle-orm';
import { getDb, s, WORKSPACE_ID } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader, Card, Empty } from '@/components/ui';
import { FileGrid, type FileCard } from '@/components/file-grid';
import { FolderManager } from '@/components/folder-manager';
import { Uploader } from '@/components/uploader';
import { LibraryUrlImport, SaveLibraryView } from '@/components/library-manager';
import { inFolder, listFolders, tagColors } from '@/lib/library/folders';
import { formatLabel } from '@/lib/files';
import { getT } from '@/i18n/server';
import { z } from 'zod';
export async function generateMetadata() { return { title: (await getT())('meta.files') }; }
const LIMIT = 48;
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
    const machines = await db.select({ name: s.machines.name, x: s.machines.volX, y: s.machines.volY, z: s.machines.volZ }).from(s.machines).where(and(eq(s.machines.workspaceId, WORKSPACE_ID), isNull(s.machines.deletedAt)));
    const versionIds = rows.flatMap(r => r.v ? [r.v.id] : []), modelIds = rows.map(r => r.f.id);
    const sliceCounts = new Map((versionIds.length ? await db.select({ id: s.sliceRuns.fileVersionId, n: sql<number> `count(*)::int` }).from(s.sliceRuns).where(inArray(s.sliceRuns.fileVersionId, versionIds)).groupBy(s.sliceRuns.fileVersionId) : []).map(r => [r.id, r.n]));
    const quoteCounts = new Map((modelIds.length ? await db.select({ id: s.quoteItemModels.modelFileId, n: sql<number> `count(*)::int` }).from(s.quoteItemModels).where(inArray(s.quoteItemModels.modelFileId, modelIds)).groupBy(s.quoteItemModels.modelFileId) : []).map(r => [r.id, r.n]));
    const fits = (f: typeof rows[number]['f']) => [f.dimX, f.dimY, f.dimZ].every(x => x !== null) && !['gcode', 'bgcode', 'gco'].includes(f.format || '') ? machines.filter(m => [f.dimX!, f.dimY!, f.dimZ!].sort((a, b) => b - a).every((n, i) => n <= [m.x, m.y, m.z].sort((a, b) => b - a)[i])).map(m => m.name) : [];
    const coverRows=modelIds.length?await db.select({modelId:s.libraryPhotoLinks.modelId,data:s.libraryPhotoLinks.data,variants:s.photos.variants}).from(s.libraryPhotoLinks).innerJoin(s.photos,eq(s.photos.id,s.libraryPhotoLinks.photoId)).where(and(inArray(s.libraryPhotoLinks.modelId,modelIds),sql`${s.libraryPhotoLinks.data}->>'cover'='true'`,isNull(s.photos.deletedAt))).orderBy(desc(s.libraryPhotoLinks.updatedAt)):[];
    const cards: FileCard[] = rows.map(({ f, v }) => ({ id: f.id, name: f.name, cover:coverRows.find(c=>c.modelId===f.id)?.data.editedKey||coverRows.find(c=>c.modelId===f.id)?.variants?.['320'],format: formatLabel(f.format || ''), versionId: v?.id || null, hasThumb: !!v?.thumbKey, hasTurn: !!v?.meta?.turnKey, dims: f.dimX !== null ? `${f.dimX.toFixed(1)} × ${f.dimY?.toFixed(1)} × ${f.dimZ?.toFixed(1)} mm` : '—', tags: f.tags || [], favorite: f.favorite, closed: f.closed, version: v?.number || 1, fits: fits(f), slices: v ? sliceCounts.get(v.id) || 0 : 0, quotes: quoteCounts.get(f.id) || 0, multicolor: !!v?.meta?.ams?.multicolor }));
    const query = (patch: Record<string, string | undefined>) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries({ ...sp, ...patch }))
        if (v)
            q.set(k, v); return '/archivos?' + q; };
    const last = rows.at(-1)?.f;
    const vocabulary = tagRows.map(r => ({ tag: r.tag, n: 0 }));
    return <><PageHeader title={t('files.n3dFiles')} subtitle={t('library.results', { n: total })} actions={can(user, 'config', 'E') ? <Link className="btn-ghost" href="/archivos/fuentes">{t('library.sources')}</Link> : undefined}/>
 {sources.length > 0 && <div className="flex gap-2 flex-wrap mb-3 text-xs">{sources.map(src => <span className="badge" key={src.id}>{src.name} · {src.status} · {src.last ? new Date(src.last).toLocaleString() : t('library.never')}</span>)}</div>}
 {can(user, 'archivos', 'C') && <><Card className="mb-4"><Uploader intent={{ intent: 'model' }} accept=".zip,.stl,.3mf,.obj,.ply,.amf,.glb,.gltf,.step,.stp,.gcode,.gco,.bgcode,.png,.jpg,.jpeg,.webp,.pdf" label={t('files.dropYourModelsHereStl')} hint={t('files.upTo500MbPer')}/></Card><LibraryUrlImport /></>}
 {await (await import('@/lib/ai')).aiAvailableFor(user,'library.search')&&<NaturalSearch/>}
 <form className="card p-3 mb-4 grid gap-3 md:grid-cols-4" role="search"><input className="input md:col-span-2" name="q" defaultValue={sp.q} aria-label={t('files.searchByNameTagSource')} placeholder={t('files.searchByNameTagSource')}/>
 <select className="input" name="source" defaultValue={sp.source || ''} aria-label={t('library.source')}><option value="">{t('library.all')}</option><option value="internal">{t('library.internal')}</option>{sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
 <select className="input" name="format" defaultValue={sp.format || ''} aria-label={t('library.format')}><option value="">{t('library.format')}</option>{['stl', '3mf', 'obj', 'ply', 'glb', 'gltf', 'amf', 'step', 'stp', 'gcode', 'bgcode', 'png', 'jpg', 'pdf'].map(f => <option key={f}>{f}</option>)}</select>
 <select className="input" name="folder" defaultValue={sp.folder || ''} aria-label={t('files.folder')}><option value="">{t('files.folder')}</option>{folders.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}</select>
 <select className="input" name="tag" defaultValue={sp.tag || ''} aria-label={t('common.tag')}><option value="">{t('common.tag')}</option>{tagRows.map(r => <option key={r.tag}>{r.tag}</option>)}</select>
 <select className="input" name="state" defaultValue={sp.state || ''} aria-label={t('library.state')}><option value="">{t('library.state')}</option>{(['local', 'remote', 'missing'] as const).map(k => <option key={k} value={k}>{t(`library.${k}`)}</option>)}</select>
 <select className="input" name="collection" defaultValue={sp.collection || ''} aria-label={t('library.collection')}><option value="">{t('library.collection')}</option>{collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
 <input className="input" name="license" defaultValue={sp.license || ''} aria-label={t('library.license')} placeholder={t('library.license')}/>
 {(['min', 'max', 'dimension'] as const).map((k, i) => <input key={k} type="number" min="0" step="any" className="input" name={k} defaultValue={sp[k]} aria-label={t(['library.minSize', 'library.maxSize', 'library.maxDimension'][i] as any)} placeholder={t(['library.minSize', 'library.maxSize', 'library.maxDimension'][i] as any)}/>)}
 <details className="md:col-span-4"><summary>{t('library.advanced')}</summary><div className="grid md:grid-cols-4 gap-3 mt-3"><select className="input" name="sort" defaultValue={sp.sort||'updated'} aria-label={t('library.sort')}>{['updated','name','size','relevance','usage','favorites'].map(k=><option key={k} value={k}>{t(`library.${['updated','relevance','usage','favorites'].includes(k)?k:k+'Sort'}` as any)}</option>)}</select>
 <select className="input" name="closed" defaultValue={sp.closed||''} aria-label={t('library.closed')}><option value="">{t('library.closed')}</option>{['yes','no','unknown'].map(k=><option key={k} value={k}>{t(`library.${k==='yes'?'closed':k==='no'?'open':'unknown'}` as any)}</option>)}</select>
 <select className="input" name="processing" defaultValue={sp.processing||''} aria-label={t('library.processing')}><option value="">{t('library.processing')}</option>{['indexed','processing','ready','partial','error'].map(k=><option key={k}>{k}</option>)}</select>
 <label>{t('library.sources')}<select multiple name="sources" className="input" defaultValue={sp.sources?.split(',')||[]}>{sources.map(src=><option key={src.id} value={src.id}>{src.name}</option>)}</select></label>
 {['formats','anyTags','allTags','category','project','author','physical','dimX','dimY','dimZ','volumeMin','volumeMax','trianglesMin','trianglesMax','createdAfter','createdBefore'].map(k=><label key={k} className="text-xs">{t(`library.${k}` as any)}<input className="input" name={k} type={k.startsWith('created')?'date':'text'} defaultValue={sp[k]||''}/></label>)}
 <label><input type="checkbox" name="incomplete" value="1" defaultChecked={!!sp.incomplete}/> {t('library.incomplete')}</label><label><input type="checkbox" name="archived" value="1" defaultChecked={!!sp.archived}/> {t('library.archived')}</label>
 </div></details><label><input type="checkbox" name="fav" value="1" defaultChecked={!!sp.fav}/> {t('files.favorites')}</label><label><input type="checkbox" name="photo" value="1" defaultChecked={!!sp.photo}/> {t('library.hasPhoto')}</label><label><input type="checkbox" name="turn" value="1" defaultChecked={!!sp.turn}/> {t('library.hasTurn')}</label><div className="flex gap-2"><button className="btn-primary">{t('common.filter')}</button><Link className="btn-ghost" href="/archivos">{t('common.clearFilters')}</Link></div></form>
 <div className="flex gap-2 mb-3"><Link className="btn-ghost" href={query({ view: 'grid' })}>{t('library.grid')}</Link><Link className="btn-ghost" href={query({ view: 'table' })}>{t('library.table')}</Link><Link className="btn-ghost" href="/archivos/revision">{t('library.review')}</Link><SaveLibraryView scope={`${user.workspaceId}:${user.id}`}/></div>
 {can(user, 'archivos', 'E') && <FolderManager folders={folders} tags={vocabulary.map(v => ({ ...v, color: colors.get(v.tag) || null }))}/>}
 {!rows.length ? <Card><Empty title={t('common.noMatches')}/></Card> : sp.view === 'table' ? <div className="card overflow-auto"><table className="w-full text-sm"><thead><tr>{['library.name', 'library.format', 'library.state', 'files.dimensions'].map(k => <th key={k} className="p-3 text-left">{t(k as any)}</th>)}</tr></thead><tbody>{rows.map(({ f, v }) => <tr key={f.id} className="border-t"><td className="p-3"><Link href={`/archivos/${f.id}`}>{f.name}</Link></td><td>{f.format}</td><td>{v?.storageKey ? t('library.local') : t('library.remote')} · {String(v?.meta?.status || '')}</td><td>{f.dimX ?? '—'} × {f.dimY ?? '—'} × {f.dimZ ?? '—'}</td></tr>)}</tbody></table></div> : <FileGrid scope={`${user.workspaceId}:${user.id}`} canEdit={can(user, 'archivos', 'E')} vocabulary={vocabulary} cards={cards} tagColors={Object.fromEntries(colors)}/>}
 <nav className="flex justify-between mt-4" aria-label="Pagination">{sp.cursor ? <Link className="btn-ghost" href={query({ cursor: undefined })}>{t('library.previous')}</Link> : <span />}{found.length > LIMIT && last && <Link className="btn-primary" href={query({ cursor: Buffer.from(JSON.stringify({ at: rows.at(-1)!.cursorAt, id: last.id, sort:sp.sort||'updated' })).toString('base64url') })}>{t('library.next')}</Link>}</nav></>;
}
