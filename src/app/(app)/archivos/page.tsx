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
    const t = await getT(), user = await pagePerm('archivos', 'V'), sp = await searchParams, db = await getDb();
    const conds = [eq(s.modelFiles.workspaceId, WORKSPACE_ID), isNull(s.modelFiles.deletedAt)];
    if (sp.q) {
        const q = '%' + sp.q.slice(0, 200) + '%';
        conds.push(or(ilike(s.modelFiles.name, q), ilike(s.modelFiles.origin, q), ilike(s.modelFiles.author, q), sql `${s.fileVersions.meta}->>'libraryDescription' ilike ${q}`, sql `${s.modelFiles.tags}::text ilike ${q}`, sql `exists(select 1 from library_entries le where le.model_id=${s.modelFiles.id} and le.path ilike ${q})`)!);
    }
    if (sp.tag)
        conds.push(sql `${s.modelFiles.tags} @> ${JSON.stringify([sp.tag])}::jsonb`);
    if (sp.folder)
        conds.push(inFolder(sp.folder));
    if (sp.fav)
        conds.push(eq(s.modelFiles.favorite, true));
    if (sp.format)
        conds.push(eq(s.modelFiles.format, sp.format));
    if (sp.license)
        conds.push(eq(s.modelFiles.license, sp.license));
    if (sp.source === 'internal')
        conds.push(sql `not exists(select 1 from library_entries le where le.model_id=${s.modelFiles.id})`);
    else if (sp.source && z.uuid().safeParse(sp.source).success)
        conds.push(sql `exists(select 1 from library_entries le where le.model_id=${s.modelFiles.id} and le.source_id=${sp.source}::uuid)`);
    if (sp.state === 'missing')
        conds.push(sql `exists(select 1 from library_entries le where le.model_id=${s.modelFiles.id} and le.state='missing')`);
    if (sp.state === 'local')
        conds.push(sql `${s.fileVersions.storageKey} <> ''`);
    if (sp.state === 'remote')
        conds.push(eq(s.fileVersions.storageKey, ''));
    if (sp.photo)
        conds.push(sql `exists(select 1 from photos p where p.model_file_id=${s.modelFiles.id} and p.deleted_at is null)`);
    if (sp.turn)
        conds.push(sql `${s.fileVersions.meta}->>'turnKey' is not null`);
    if (sp.collection && z.uuid().safeParse(sp.collection).success)
        conds.push(sql `exists(select 1 from library_collection_models cm where cm.model_id=${s.modelFiles.id} and cm.collection_id=${sp.collection}::uuid)`);
    const number = (k: string) => sp[k] !== undefined && Number.isFinite(Number(sp[k])) && Number(sp[k]) >= 0 ? Number(sp[k]) : undefined;
    const min = number('min'), max = number('max'), dim = number('dimension');
    if (min !== undefined)
        conds.push(sql `${s.fileVersions.size} >= ${min * 1048576}`);
    if (max !== undefined)
        conds.push(sql `${s.fileVersions.size} <= ${max * 1048576}`);
    if (dim !== undefined)
        conds.push(sql `greatest(${s.modelFiles.dimX},${s.modelFiles.dimY},${s.modelFiles.dimZ}) <= ${dim}`);
    const [{ total }] = await db.select({ total: sql<number> `count(*)::int` }).from(s.modelFiles).leftJoin(s.fileVersions, eq(s.fileVersions.id, s.modelFiles.currentVersionId)).where(and(...conds));
    if (sp.cursor) {
        try {
            const c = JSON.parse(Buffer.from(sp.cursor, 'base64url').toString());
            if (z.uuid().safeParse(c.id).success && Number.isFinite(Date.parse(c.at)))
                conds.push(or(sql `${s.modelFiles.updatedAt} < ${c.at}::timestamptz`, and(sql `${s.modelFiles.updatedAt} = ${c.at}::timestamptz`, lt(s.modelFiles.id, c.id)))!);
        }
        catch { }
    }
    const found = await db.select({ f: s.modelFiles, v: s.fileVersions, cursorAt: sql<string> `${s.modelFiles.updatedAt}::text` }).from(s.modelFiles).leftJoin(s.fileVersions, eq(s.fileVersions.id, s.modelFiles.currentVersionId)).where(and(...conds)).orderBy(desc(s.modelFiles.updatedAt), desc(s.modelFiles.id)).limit(LIMIT + 1);
    const rows = found.slice(0, LIMIT);
    const folders = await listFolders(db), colors = await tagColors(db);
    const tagResult = await db.execute(sql `select distinct jsonb_array_elements_text(coalesce(tags,'[]'::jsonb)) as tag from model_files where workspace_id=${WORKSPACE_ID}::uuid and deleted_at is null order by tag limit 500`);
    const tagRows = (Array.isArray(tagResult) ? tagResult : tagResult.rows) as {
        tag: string;
    }[];
    const sources = await db.select({ id: s.librarySources.id, name: s.librarySources.name, status: s.librarySources.status, last: s.librarySources.lastScanAt }).from(s.librarySources).where(and(eq(s.librarySources.workspaceId, WORKSPACE_ID), isNull(s.librarySources.deletedAt)));
    const collections = await db.select().from(s.libraryCollections).where(and(eq(s.libraryCollections.workspaceId, WORKSPACE_ID), isNull(s.libraryCollections.deletedAt)));
    const machines = await db.select({ name: s.machines.name, x: s.machines.volX, y: s.machines.volY, z: s.machines.volZ }).from(s.machines).where(and(eq(s.machines.workspaceId, WORKSPACE_ID), isNull(s.machines.deletedAt)));
    const versionIds = rows.flatMap(r => r.v ? [r.v.id] : []), modelIds = rows.map(r => r.f.id);
    const sliceCounts = new Map((versionIds.length ? await db.select({ id: s.sliceRuns.fileVersionId, n: sql<number> `count(*)::int` }).from(s.sliceRuns).where(inArray(s.sliceRuns.fileVersionId, versionIds)).groupBy(s.sliceRuns.fileVersionId) : []).map(r => [r.id, r.n]));
    const quoteCounts = new Map((modelIds.length ? await db.select({ id: s.quoteItemModels.modelFileId, n: sql<number> `count(*)::int` }).from(s.quoteItemModels).where(inArray(s.quoteItemModels.modelFileId, modelIds)).groupBy(s.quoteItemModels.modelFileId) : []).map(r => [r.id, r.n]));
    const fits = (f: typeof rows[number]['f']) => [f.dimX, f.dimY, f.dimZ].every(x => x !== null) && !['gcode', 'bgcode', 'gco'].includes(f.format || '') ? machines.filter(m => [f.dimX!, f.dimY!, f.dimZ!].sort((a, b) => b - a).every((n, i) => n <= [m.x, m.y, m.z].sort((a, b) => b - a)[i])).map(m => m.name) : [];
    const cards: FileCard[] = rows.map(({ f, v }) => ({ id: f.id, name: f.name, format: formatLabel(f.format || ''), versionId: v?.id || null, hasThumb: !!v?.thumbKey, hasTurn: !!v?.meta?.turnKey, dims: f.dimX !== null ? `${f.dimX.toFixed(1)} × ${f.dimY?.toFixed(1)} × ${f.dimZ?.toFixed(1)} mm` : '—', tags: f.tags || [], favorite: f.favorite, closed: f.closed, version: v?.number || 1, fits: fits(f), slices: v ? sliceCounts.get(v.id) || 0 : 0, quotes: quoteCounts.get(f.id) || 0, multicolor: !!v?.meta?.ams?.multicolor }));
    const query = (patch: Record<string, string | undefined>) => { const q = new URLSearchParams(); for (const [k, v] of Object.entries({ ...sp, ...patch }))
        if (v)
            q.set(k, v); return '/archivos?' + q; };
    const last = rows.at(-1)?.f;
    const vocabulary = tagRows.map(r => ({ tag: r.tag, n: 0 }));
    return <><PageHeader title={t('files.n3dFiles')} subtitle={t('library.results', { n: total })} actions={can(user, 'config', 'E') ? <Link className="btn-ghost" href="/archivos/fuentes">{t('library.sources')}</Link> : undefined}/>
 {sources.length > 0 && <div className="flex gap-2 flex-wrap mb-3 text-xs">{sources.map(src => <span className="badge" key={src.id}>{src.name} · {src.status} · {src.last ? new Date(src.last).toLocaleString() : t('library.never')}</span>)}</div>}
 {can(user, 'archivos', 'C') && <><Card className="mb-4"><Uploader intent={{ intent: 'model' }} accept=".zip,.stl,.3mf,.obj,.ply,.amf,.glb,.gltf,.step,.stp,.gcode,.gco,.bgcode,.png,.jpg,.jpeg,.webp,.pdf" label={t('files.dropYourModelsHereStl')} hint={t('files.upTo500MbPer')}/></Card><LibraryUrlImport /></>}
 <form className="card p-3 mb-4 grid gap-3 md:grid-cols-4" role="search"><input className="input md:col-span-2" name="q" defaultValue={sp.q} aria-label={t('files.searchByNameTagSource')} placeholder={t('files.searchByNameTagSource')}/>
 <select className="input" name="source" defaultValue={sp.source || ''} aria-label={t('library.source')}><option value="">{t('library.all')}</option><option value="internal">{t('library.internal')}</option>{sources.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
 <select className="input" name="format" defaultValue={sp.format || ''} aria-label={t('library.format')}><option value="">{t('library.format')}</option>{['stl', '3mf', 'obj', 'ply', 'glb', 'gltf', 'amf', 'step', 'stp', 'gcode', 'bgcode', 'png', 'jpg', 'pdf'].map(f => <option key={f}>{f}</option>)}</select>
 <select className="input" name="folder" defaultValue={sp.folder || ''} aria-label={t('files.folder')}><option value="">{t('files.folder')}</option>{folders.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}</select>
 <select className="input" name="tag" defaultValue={sp.tag || ''} aria-label={t('common.tag')}><option value="">{t('common.tag')}</option>{tagRows.map(r => <option key={r.tag}>{r.tag}</option>)}</select>
 <select className="input" name="state" defaultValue={sp.state || ''} aria-label={t('library.state')}><option value="">{t('library.state')}</option>{(['local', 'remote', 'missing'] as const).map(k => <option key={k} value={k}>{t(`library.${k}`)}</option>)}</select>
 <select className="input" name="collection" defaultValue={sp.collection || ''} aria-label={t('library.collection')}><option value="">{t('library.collection')}</option>{collections.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
 <input className="input" name="license" defaultValue={sp.license || ''} aria-label={t('library.license')} placeholder={t('library.license')}/>
 {(['min', 'max', 'dimension'] as const).map((k, i) => <input key={k} type="number" min="0" step="any" className="input" name={k} defaultValue={sp[k]} aria-label={t(['library.minSize', 'library.maxSize', 'library.maxDimension'][i] as any)} placeholder={t(['library.minSize', 'library.maxSize', 'library.maxDimension'][i] as any)}/>)}
 <label><input type="checkbox" name="fav" value="1" defaultChecked={!!sp.fav}/> {t('files.favorites')}</label><label><input type="checkbox" name="photo" value="1" defaultChecked={!!sp.photo}/> {t('library.hasPhoto')}</label><label><input type="checkbox" name="turn" value="1" defaultChecked={!!sp.turn}/> {t('library.hasTurn')}</label><div className="flex gap-2"><button className="btn-primary">{t('common.filter')}</button><Link className="btn-ghost" href="/archivos">{t('common.clearFilters')}</Link></div></form>
 <div className="flex gap-2 mb-3"><Link className="btn-ghost" href={query({ view: 'grid' })}>{t('library.grid')}</Link><Link className="btn-ghost" href={query({ view: 'table' })}>{t('library.table')}</Link><SaveLibraryView scope={`${user.workspaceId}:${user.id}`}/></div>
 {can(user, 'archivos', 'E') && <FolderManager folders={folders} tags={vocabulary.map(v => ({ ...v, color: colors.get(v.tag) || null }))}/>}
 {!rows.length ? <Card><Empty title={t('common.noMatches')}/></Card> : sp.view === 'table' ? <div className="card overflow-auto"><table className="w-full text-sm"><thead><tr>{['library.name', 'library.format', 'library.state', 'files.dimensions'].map(k => <th key={k} className="p-3 text-left">{t(k as any)}</th>)}</tr></thead><tbody>{rows.map(({ f, v }) => <tr key={f.id} className="border-t"><td className="p-3"><Link href={`/archivos/${f.id}`}>{f.name}</Link></td><td>{f.format}</td><td>{v?.storageKey ? t('library.local') : t('library.remote')} · {String(v?.meta?.status || '')}</td><td>{f.dimX ?? '—'} × {f.dimY ?? '—'} × {f.dimZ ?? '—'}</td></tr>)}</tbody></table></div> : <FileGrid canEdit={can(user, 'archivos', 'E')} vocabulary={vocabulary} cards={cards} tagColors={Object.fromEntries(colors)}/>}
 <nav className="flex justify-between mt-4" aria-label="Pagination">{sp.cursor ? <Link className="btn-ghost" href={query({ cursor: undefined })}>{t('library.previous')}</Link> : <span />}{found.length > LIMIT && last && <Link className="btn-primary" href={query({ cursor: Buffer.from(JSON.stringify({ at: rows.at(-1)!.cursorAt, id: last.id })).toString('base64url') })}>{t('library.next')}</Link>}</nav></>;
}
