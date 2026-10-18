import { ModelDetails,RelatedModels,PhotoLinks } from '@/components/library-advanced';
import { modelAccess,photoAccess,assetAccess } from '@/lib/library/access';
import { PhotoCapture } from '@/components/photo-capture';
import { LibraryProcess, LibraryPhotoAssociate, LibraryMetadata, LibraryDuplicates } from '@/components/library-manager';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, desc, eq, ne, sql, inArray, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader, Card, Badge, StatusBadge, Table, Empty } from '@/components/ui';
import { ModelViewer } from '@/components/model-viewer';
import { GcodeViewer } from '@/components/gcode-viewer';
import { ImportProjectButton } from '@/components/import-project-button';
import { RepairButton } from '@/components/repair-button';
import { SlicePanel } from '@/components/slice-panel';
import { aiAvailableFor } from '@/lib/ai';
import { Uploader } from '@/components/uploader';
import { LinksEditor } from '@/components/links-editor';
import { AutoRefresh, DeleteFileButton, FileMetaForm, SetVersionButton } from '@/components/file-bits';
import { getCalcContext } from '@/lib/context';
import { formatLabel, kindOfExt } from '@/lib/files';
import { dmy, dur, grams, num } from '@/lib/format';
import { getT } from '@/i18n/server';
import { tOr } from '@/i18n/translate';
import { SourcePanel } from '@/components/source-panel';
import { LICENSE_LABEL } from '@/lib/library/source';
import { Icon } from '@/components/shell';

export async function generateMetadata() { return { title: (await getT())('meta.file') }; }

export default async function FilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const t = await getT();
  const user = await pagePerm('archivos', 'V'); const { id } = await params; const { tab = 'visor' } = await searchParams;
  const db = await getDb();
  const [f] = await db.select().from(s.modelFiles).where(and(modelAccess(user),eq(s.modelFiles.id, id), isNull(s.modelFiles.deletedAt)));
  if (!f) notFound();
  const versions = await db.select().from(s.fileVersions).where(eq(s.fileVersions.modelFileId, id)).orderBy(desc(s.fileVersions.number));
  const cur = versions.find((v) => v.id === f.currentVersionId) ?? versions[0];
  const meta = (cur?.meta ?? {}) as Record<string, any>; const a = meta.analysis; const sm = meta.sliced; const kind = kindOfExt(f.format ?? '');
  const ctx = await getCalcContext();
  const machines = ctx.machines.filter((m) => m.tech === 'FDM' || m.tech === 'SLS').map((m) => ({ id: m.id, name: m.name, volX: m.volX, volY: m.volY, volZ: m.volZ }));
  const customers = await db.select({ id: s.customers.id, name: s.customers.name }).from(s.customers).where(isNull(s.customers.deletedAt)).orderBy(asc(s.customers.name));
  const links = await db.select().from(s.referenceLinks).where(and(eq(s.referenceLinks.ownerType, 'model_file'), eq(s.referenceLinks.ownerId, id)));
  const used = await db.select({ q: s.quotes }).from(s.quoteItemModels).innerJoin(s.quoteItems, eq(s.quoteItems.id, s.quoteItemModels.quoteItemId)).innerJoin(s.quotes, eq(s.quotes.id, s.quoteItems.quoteId)).where(eq(s.quoteItemModels.modelFileId, id)).limit(20);
  const photos = await db.select().from(s.photos).where(and(photoAccess(user),eq(s.photos.modelFileId, id),isNull(s.photos.deletedAt))).orderBy(desc(s.photos.takenAt)).limit(12);
  const slicedRuns = cur ? await db.select().from(s.sliceRuns).where(eq(s.sliceRuns.fileVersionId, cur.id)).orderBy(desc(s.sliceRuns.createdAt)).limit(8) : [];
  const processing = meta.status === 'processing';
  const galleryPhotos = await db.select({id:s.photos.id,caption:s.photos.caption,variants:s.photos.variants}).from(s.photos).where(and(photoAccess(user),eq(s.photos.workspaceId,user.workspaceId),isNull(s.photos.deletedAt))).limit(100);
  const locations = await db.select({entry:s.libraryEntries,source:s.librarySources.name}).from(s.libraryEntries).innerJoin(s.librarySources,eq(s.librarySources.id,s.libraryEntries.sourceId)).where(eq(s.libraryEntries.modelId,id));
  const [details]=await db.select().from(s.libraryDetails).where(eq(s.libraryDetails.modelId,id));
  const photoLinks=await db.select().from(s.libraryPhotoLinks).where(and(eq(s.libraryPhotoLinks.modelId,id),sql`exists(select 1 from photos where photos.id=${s.libraryPhotoLinks.photoId} and ${photoAccess(user)})`));
  const assets=await db.select().from(s.libraryAssets).where(and(eq(s.libraryAssets.modelId,id),assetAccess(user)));
  const tabs = [['visor', t('files.n3dViewer')], ['laminar', t('files.sliceQuote')], ['versiones', t('files.versions', { versions: versions.length })], ['vinculos', t('files.linksReferences')]];
  const color = '#ff6a2b';
  const [srcRow] = f.sourceId ? await db.select().from(s.modelSources).where(eq(s.modelSources.id, f.sourceId)) : [];
  const duplicates = f.hash ? await db.select({id:s.modelFiles.id,name:s.modelFiles.name}).from(s.modelFiles).where(and(modelAccess(user),eq(s.modelFiles.workspaceId,user.workspaceId),eq(s.modelFiles.hash,f.hash),ne(s.modelFiles.id,f.id),isNull(s.modelFiles.deletedAt))).limit(20) : [];
  const aiSimilarityOk=await (await import('@/lib/ai')).aiAvailableFor(user,'library.similarity');
  const aiTagsOk = await (await import('@/lib/ai')).aiAvailableFor(user, 'files.tag');
  const viewerMats = (await db.select().from(s.materials).where(and(isNull(s.materials.deletedAt), eq(s.materials.tech, 'fdm')))).map((m) => ({ id: m.id, label: `${m.manufacturer ? m.manufacturer + ' ' : ''}${m.type} ${m.colorName}`, hex: m.hex }));
  return (
    <>
      <PageHeader back={{ href: '/archivos', label: t('nav.files') }} title={f.name} subtitle={<span className="inline-flex flex-wrap items-center gap-2"><Badge>{formatLabel(f.format ?? '')}</Badge><span>v{cur?.number}</span>{f.origin && <span>· {f.origin}</span>}{f.license && <span>{t('files.license')} {f.license}</span>}</span>}
        actions={<>{cur && <a className="btn-ghost" href={`/api/files/v/${cur.id}/raw`} data-testid="download-file"><Icon name="download" className="h-4 w-4" />{t('files.download')}</a>}{can(user, 'archivos', 'X') && <DeleteFileButton id={f.id} />}</>} />
      <AutoRefresh active={processing} />
      {can(user,'archivos','E')&&<ModelDetails modelId={id} data={details?.data} versionId={cur?.id} assets={assets}/>}
      {(details?.data.description||meta.libraryDescription)&&<Card><p>{String(details?.data.description||meta.libraryDescription)}</p></Card>}
      {aiSimilarityOk && can(user,'archivos','E') && <RelatedModels modelId={id}/>}
      {aiTagsOk && can(user,'archivos','E') && <LibraryMetadata modelId={id}/>}
      {duplicates.length>0 && can(user,'archivos','E') && <LibraryDuplicates modelId={id} duplicates={duplicates}/>}
      {cur && !cur.storageKey && !processing && can(user,'archivos','E') && <LibraryProcess id={cur.id}/>}
      {locations.length>0 && <Card title={t('library.source')}><ul className="text-sm space-y-1">{locations.map(l=><li key={l.entry.id}>{l.source} · {l.entry.path} · {l.entry.state}</li>)}</ul></Card>}
      {can(user,'galeria','C')&&<Card title={t('library.photos')}><PhotoCapture intent={{intent:'photo',modelFileId:id}}/>{galleryPhotos.length>0&&can(user,'galeria','E')&&<LibraryPhotoAssociate modelId={id} photos={galleryPhotos}/>}</Card>}
      {can(user,'galeria','E')&&<PhotoLinks modelId={id} photos={[...new Map([...photos,...galleryPhotos].map(p=>[p.id,p])).values()]} links={photoLinks} versions={versions}/>}
      {cur?.thumbKey && <div className="flex gap-2 my-3"><a className="btn-ghost" href={`/api/library/preview/${cur.id}?kind=gif`}>{t('library.gif')}</a><a className="btn-ghost" href={`/api/library/preview/${cur.id}?kind=views`}>{t('library.views')}</a><a className="btn-ghost" href={`/api/library/preview/${cur.id}?kind=technical`}>{t('library.technicalViews')}</a></div>}
      {meta.status === 'error' && <div className="rounded-lg box-danger p-3 text-sm text-red-800 dark:text-red-200 mb-4" role="alert">{t('files.theFileCouldNotBe')} {meta.error}</div>}
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700 mb-4" aria-label={t('files.fileSections')}>
        {tabs.map(([k, l]) => <Link key={k} href={`/archivos/${id}?tab=${k}`} aria-current={tab === k ? 'page' : undefined} className={`px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px min-h-[44px] flex items-center ${tab === k ? 'border-[var(--accent)] text-[var(--accent-ink)] font-medium' : 'border-transparent muted'}`}>{l}</Link>)}
      </nav>

      {tab === 'visor' && (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2 min-w-0 space-y-4">
            {!processing && cur && !!meta.previewKey && kind === 'malla' && meta.previewKey && <ModelViewer key={cur.id} versionId={cur.id} machines={machines} color={color} materials={viewerMats} analysis={a} />}
            {!processing && f.format === '3mf' && can(user, 'laminador', 'C') && cur && <div className="mt-3"><ImportProjectButton versionId={cur.id} /><p className="text-xs muted mt-1">{t('files.importProjectHint')}</p></div>}
            {!processing && (meta as any).ams?.multicolor && <div className="card p-3 mt-3 text-sm" data-testid="ams-card"><div className="font-medium mb-1.5">{t('files.amsTitle', { n: (meta as any).ams.filaments.filter((x: any) => x.used).length })}</div><ul className="flex flex-wrap gap-2">{(meta as any).ams.filaments.filter((x: any) => x.used).map((x: any) => <li key={x.index} className="badge border-[var(--line)]"><span className="inline-block h-3.5 w-3.5 rounded-full border border-black/20" style={{ background: x.color }} aria-hidden />{t('files.amsSlot', { n: x.index })}{x.type ? ` · ${x.type}` : ''}</li>)}</ul>{(meta as any).ams.painted && <p className="muted text-xs mt-1.5">{t('files.amsPainted')}</p>}<p className="muted text-xs mt-1.5">{t('files.amsHint')}</p></div>}
            {!processing && cur && !!meta.previewKey && kind === 'malla' && meta.gcodePreviewKey && <Card title={t('files.toolpathsFromTheGCode')}><GcodeViewer key={cur.id} src={`/api/files/v/${cur.id}/gcode`} /></Card>}
            {!processing && cur && kind === 'gcode' && (meta.gcodePreviewKey ? <GcodeViewer key={cur.id} src={`/api/files/v/${cur.id}/gcode`} /> : <Card><Empty title={t('files.noLayerPreview')} hint={sm?.notes?.[0] ?? t('files.thisGCodeCannotBe')} /></Card>)}
            {!processing && cur && kind === 'imagen' && (f.format === 'pdf' ? <iframe src={`/api/files/v/${cur.id}/raw`} className="w-full h-[70vh] card" title={f.name} /> : <img src={`/api/files/v/${cur.id}/thumb`} alt={f.name} className="card w-full" />)}
            {photos.length > 0 && <Card title={t('files.photosOfWhatWasMade')}><div className="grid grid-cols-3 sm:grid-cols-6 gap-2">{photos.map((p) => <img key={p.id} src={`/api/media/${p.variants?.['320'] ?? p.storageKey}`} alt={p.caption ?? t('files.photo')} className="rounded aspect-square object-cover" />)}</div></Card>}
          </div>
          <div className="space-y-4">
            {a && (
              <Card title={t('files.automaticAnalysis')}>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm" data-testid="analysis">
                  <dt className="muted">{t('files.dimensions')}</dt><dd className="tabular font-medium">{num(a.dimX, 1)} × {num(a.dimY, 1)} × {num(a.dimZ, 1)} mm</dd>
                  <dt className="muted">{t('files.volume')}</dt><dd className="tabular font-medium">{num(a.volumeCm3, 2)} cm³</dd>
                  <dt className="muted">{t('files.surfaceArea')}</dt><dd className="tabular">{num(a.areaCm2, 1)} cm²</dd>
                  <dt className="muted">{t('files.triangles')}</dt><dd className="tabular">{num(a.triangles, 0)}</dd>
                  <dt className="muted">{t('files.watertightMesh')}</dt><dd>{a.closed ? <Badge tone="green">{t('common.yesLabel')}</Badge> : <Badge tone="amber">{t('files.notClosed', { edges: a.openEdges })}</Badge>}</dd>
                  <dt className="muted">{t('files.normals')}</dt><dd>{a.invertedNormals ? <Badge tone="amber">{t('files.flipped')}</Badge> : <Badge tone="green">{t('files.correct')}</Badge>}</dd>
                  <dt className="muted">{t('files.bodies')}</dt><dd className="tabular">{a.shells}</dd>
                  <dt className="muted">{t('files.overhangs45')}</dt><dd className="tabular">{num(a.overhangPct, 1)}{t('files.ofTheSurface')}</dd>
                </dl>
                {(!a.closed || a.invertedNormals || a.nonManifoldEdges > 0) && <div className="mt-3"><p className="text-xs text-warn">{t('files.warningAnOpenMeshOr')}</p>{can(user, 'archivos', 'E') && kind === 'malla' && <RepairButton versionId={cur!.id} />}</div>}
              </Card>
            )}
            {sm && (
              <Card title={t('files.slicerDataInTheFile')}>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm" data-testid="sliced-meta">
                  <dt className="muted">{t('files.slicer')}</dt><dd>{sm.slicer ?? '—'}</dd>
                  <dt className="muted">{t('common.time')}</dt><dd className="tabular font-medium">{dur(sm.timeS)}</dd>
                  <dt className="muted">{t('common.material')}</dt><dd className="tabular font-medium">{grams(sm.totalG)}</dd>
                  <dt className="muted">{t('common.layers')}</dt><dd className="tabular">{sm.layers ?? '—'}</dd>
                  <dt className="muted">{t('files.layerHeight')}</dt><dd className="tabular">{sm.layerHeight ? `${sm.layerHeight} mm` : '—'}</dd>
                  <dt className="muted">{t('common.machine')}</dt><dd>{sm.machine ?? '—'}</dd>
                </dl>
                {sm.filaments?.length > 1 && <ul className="text-sm mt-2">{sm.filaments.map((x: any, i: number) => <li key={i}>{t('files.colorN', { n: i + 1 })}{x.color ? ` (${x.color})` : ''}: <b>{grams(x.g)}</b></li>)}</ul>}
                {(sm.notes ?? []).map((n: string) => <p key={n} className="text-xs text-warn mt-2">{tOr(t, n, n)}</p>)}
              </Card>
            )}
            <Card title={t('files.sourceTitle')}><SourcePanel modelFileId={f.id} canEdit={can(user, 'archivos', 'E')} aiTags={aiTagsOk} source={srcRow ? { url: srcRow.url, provider: srcRow.provider, title: srcRow.title, authorName: srcRow.authorName, licenseCode: srcRow.licenseCode, licenseLabel: LICENSE_LABEL[srcRow.licenseCode as keyof typeof LICENSE_LABEL] ?? srcRow.licenseCode, commercialUse: srcRow.commercialUse, status: srcRow.fetchStatus, downloads: (srcRow.stats as any)?.downloads, likes: (srcRow.stats as any)?.likes, tags: srcRow.tags ?? [], images: (srcRow.images ?? []).map((x) => x.storageKey ? `/api/media/${x.storageKey}` : x.url) } : null} /></Card>
            {can(user, 'archivos', 'E') && <Card title={t('files.fileData')}><FileMetaForm f={{ id: f.id, name: f.name, folder: f.folder, tags: f.tags ?? [], license: f.license, origin: f.origin, author: f.author, customerId: f.customerId }} customers={customers} /></Card>}
          </div>
        </div>
      )}

      {tab === 'laminar' && cur && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card title={t('files.serverSideSlicing')} className="xl:col-span-2">
            {kind === 'malla' && f.format !== 'step' && f.format !== 'stp' ? (
              <><div className="flex justify-end mb-2"><Link className="btn-ghost btn-sm" href={`/archivos/${f.id}/estudio`} data-testid="open-studio">{t('studio.open')}</Link></div>
              <SlicePanel amsColors={meta.ams?.multicolor ? (meta.ams.filaments as Array<{ color: string; used: boolean }>).map((x) => x.color) : undefined} defaultOrient={f.autoOrient} fileVersionId={cur.id} ctx={ctx} fileId={f.id} fileName={f.name} canSlice={can(user, 'laminador', 'V')} ai={{ advisor: await aiAvailableFor(user, 'profile.advisor'), diagnose: await aiAvailableFor(user, 'profile.diagnose'), canEdit: can(user, 'laminador', 'E'), canCreate: can(user, 'laminador', 'C') }} /></>
            ) : <Empty title={t('files.thisFormatIsNotSliced')} hint={t('files.gCodeFilesAreAlready')} />}
          </Card>
          <div className="space-y-4">
            <Card title={t('files.previousSlicesOfThisVersion')}>
              {slicedRuns.length === 0 ? <p className="text-sm muted">{t('files.itHasNotBeenSliced')}</p> : <ul className="space-y-2 text-sm">{slicedRuns.map((r) => <li key={r.id} className="flex items-center justify-between gap-2"><span className="truncate min-w-0">{r.label ?? t('files.slice')}</span><span className="tabular shrink-0">{r.status === 'done' ? `${dur(r.timeS)} · ${grams((r.filament ?? []).reduce((x, y) => x + y.g, 0))}` : <StatusBadge status={r.status} />}</span></li>)}</ul>}
            </Card>
            <Card title={t('files.doesItFitMyMachines')}><p className="text-sm muted">{t('files.useThe3dViewerTab')} {a ? `${num(a.dimX, 1)}×${num(a.dimY, 1)}×${num(a.dimZ, 1)} mm.` : t('files.noAnalysisYet')}</p></Card>
          </div>
        </div>
      )}

      {tab === 'versiones' && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card title={t('files.versionHistory')} className="xl:col-span-2" pad={false}>
            <Table><thead><tr><th className="th">{t('files.version')}</th><th className="th">{t('common.date')}</th><th className="th">{t('files.size')}</th><th className="th">{t('files.comment')}</th><th className="th" /></tr></thead>
              <tbody>{versions.map((v) => <tr key={v.id}><td className="td font-medium">{v.thumbKey&&<img className="w-24" src={`/api/files/v/${v.id}/thumb`} alt={`v${v.number}`}/>}v{v.number} {v.id === cur?.id && <Badge tone="green">{t('files.current')}</Badge>}</td><td className="td tabular">{dmy(v.createdAt)}</td><td className="td tabular">{num(v.size / 1024, 0)} KB</td><td className="td">{v.comment ?? '—'}<p className="text-xs break-all">{v.sha256}</p><p>{v.meta?.analysis?.dimX ?? '—'} × {v.meta?.analysis?.dimY ?? '—'} × {v.meta?.analysis?.dimZ ?? '—'} mm</p></td><td className="td text-right whitespace-nowrap"><a className="btn-ghost btn-sm" href={`/api/files/v/${v.id}/raw`} aria-label={t('files.download')} title={t('files.download')}><Icon name="download" className="h-4 w-4" /></a> {v.id !== cur?.id && can(user, 'archivos', 'E') && <SetVersionButton modelId={f.id} versionId={v.id} />}</td></tr>)}</tbody></Table>
          </Card>
          {can(user, 'archivos', 'C') && <Card title={t('files.uploadANewVersion')}><Uploader intent={{ intent: 'model', modelFileId: f.id }} multiple={false} accept=".stl,.3mf,.obj,.ply,.amf,.glb,.step,.stp,.gcode" label={t('files.dropTheUpdatedFile')} hint={t('files.itIsSavedAsV2')} /></Card>}
        </div>
      )}

      {tab === 'vinculos' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title={t('files.referenceLinksForTheModel')}><LinksEditor value={links.map((l) => ({ ...l }))} persist={{ ownerType: 'model_file', ownerId: f.id, revalidate: `/archivos/${id}` }} readOnly={!can(user, 'archivos', 'E')} /></Card>
          <Card title={t('files.usedInQuotes')}>{used.length === 0 ? <p className="text-sm muted">{t('files.notUsedInAnyQuote')}</p> : <ul className="space-y-2 text-sm">{used.map(({ q }) => <li key={q.id} className="flex items-center justify-between"><Link className="underline" href={`/presupuestos/${q.id}`}>{q.number} v{q.version} · {q.title ?? q.customerName}</Link><StatusBadge status={q.status} /></li>)}</ul>}</Card>
        </div>
      )}
    </>
  );
}
