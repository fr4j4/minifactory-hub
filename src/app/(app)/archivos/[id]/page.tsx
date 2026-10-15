import Link from 'next/link';
import { notFound } from 'next/navigation';
import { and, asc, desc, eq, inArray, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader, Card, Badge, StatusBadge, Table, Empty } from '@/components/ui';
import { ModelViewer } from '@/components/model-viewer';
import { GcodeViewer } from '@/components/gcode-viewer';
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

export async function generateMetadata() { return { title: (await getT())('meta.file') }; }

export default async function FilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
  const t = await getT();
  const user = await pagePerm('archivos', 'V'); const { id } = await params; const { tab = 'visor' } = await searchParams;
  const db = await getDb();
  const [f] = await db.select().from(s.modelFiles).where(and(eq(s.modelFiles.id, id), isNull(s.modelFiles.deletedAt)));
  if (!f) notFound();
  const versions = await db.select().from(s.fileVersions).where(eq(s.fileVersions.modelFileId, id)).orderBy(desc(s.fileVersions.number));
  const cur = versions.find((v) => v.id === f.currentVersionId) ?? versions[0];
  const meta = (cur?.meta ?? {}) as Record<string, any>; const a = meta.analysis; const sm = meta.sliced; const kind = kindOfExt(f.format ?? '');
  const ctx = await getCalcContext();
  const machines = ctx.machines.filter((m) => m.tech === 'FDM' || m.tech === 'SLS').map((m) => ({ id: m.id, name: m.name, volX: m.volX, volY: m.volY, volZ: m.volZ }));
  const customers = await db.select({ id: s.customers.id, name: s.customers.name }).from(s.customers).where(isNull(s.customers.deletedAt)).orderBy(asc(s.customers.name));
  const links = await db.select().from(s.referenceLinks).where(and(eq(s.referenceLinks.ownerType, 'model_file'), eq(s.referenceLinks.ownerId, id)));
  const used = await db.select({ q: s.quotes }).from(s.quoteItemModels).innerJoin(s.quoteItems, eq(s.quoteItems.id, s.quoteItemModels.quoteItemId)).innerJoin(s.quotes, eq(s.quotes.id, s.quoteItems.quoteId)).where(eq(s.quoteItemModels.modelFileId, id)).limit(20);
  const photos = await db.select().from(s.photos).where(eq(s.photos.modelFileId, id)).orderBy(desc(s.photos.takenAt)).limit(12);
  const slicedRuns = cur ? await db.select().from(s.sliceRuns).where(eq(s.sliceRuns.fileVersionId, cur.id)).orderBy(desc(s.sliceRuns.createdAt)).limit(8) : [];
  const processing = meta.status === 'processing';
  const tabs = [['visor', t('files.n3dViewer')], ['laminar', t('files.sliceQuote')], ['versiones', t('files.versions', { versions: versions.length })], ['vinculos', t('files.linksReferences')]];
  const color = '#ff6a2b';
  const viewerMats = (await db.select().from(s.materials).where(and(isNull(s.materials.deletedAt), eq(s.materials.tech, 'fdm')))).map((m) => ({ id: m.id, label: `${m.manufacturer ? m.manufacturer + ' ' : ''}${m.type} ${m.colorName}`, hex: m.hex }));
  return (
    <>
      <PageHeader back={{ href: '/archivos', label: t('nav.files') }} title={f.name} subtitle={<span className="inline-flex flex-wrap items-center gap-2"><Badge>{formatLabel(f.format ?? '')}</Badge><span>v{cur?.number}</span>{f.origin && <span>· {f.origin}</span>}{f.license && <span>{t('files.license')} {f.license}</span>}</span>}
        actions={<>{cur && <a className="btn-ghost" href={`/api/files/v/${cur.id}/raw`} data-testid="download-file">{t('files.download')}</a>}{can(user, 'archivos', 'X') && <DeleteFileButton id={f.id} />}</>} />
      <AutoRefresh active={processing} />
      {meta.status === 'error' && <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-800 dark:text-red-200 mb-4" role="alert">{t('files.theFileCouldNotBe')} {meta.error}</div>}
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700 mb-4" aria-label={t('files.fileSections')}>
        {tabs.map(([k, l]) => <Link key={k} href={`/archivos/${id}?tab=${k}`} aria-current={tab === k ? 'page' : undefined} className={`px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px min-h-[44px] flex items-center ${tab === k ? 'border-brand-600 text-brand-700 dark:text-brand-300 font-medium' : 'border-transparent muted'}`}>{l}</Link>)}
      </nav>

      {tab === 'visor' && (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2 space-y-4">
            {!processing && cur && kind === 'malla' && meta.previewKey && <ModelViewer key={cur.id} versionId={cur.id} machines={machines} color={color} materials={viewerMats} analysis={a} />}
            {!processing && cur && kind === 'malla' && meta.gcodePreviewKey && <Card title={t('files.toolpathsFromTheGCode')}><GcodeViewer key={cur.id} src={`/api/files/v/${cur.id}/gcode`} /></Card>}
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
                {(!a.closed || a.invertedNormals || a.nonManifoldEdges > 0) && <p className="text-xs text-amber-700 dark:text-amber-300 mt-3">{t('files.warningAnOpenMeshOr')}</p>}
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
                {(sm.notes ?? []).map((n: string) => <p key={n} className="text-xs text-amber-700 dark:text-amber-300 mt-2">{tOr(t, n, n)}</p>)}
              </Card>
            )}
            {can(user, 'archivos', 'E') && <Card title={t('files.fileData')}><FileMetaForm f={{ id: f.id, name: f.name, folder: f.folder, tags: f.tags ?? [], license: f.license, origin: f.origin, author: f.author, customerId: f.customerId }} customers={customers} /></Card>}
          </div>
        </div>
      )}

      {tab === 'laminar' && cur && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card title={t('files.serverSideSlicing')} className="xl:col-span-2">
            {kind === 'malla' && f.format !== 'step' && f.format !== 'stp' ? (
              <SlicePanel fileVersionId={cur.id} ctx={ctx} fileId={f.id} fileName={f.name} canSlice={can(user, 'laminador', 'V')} ai={{ advisor: await aiAvailableFor(user, 'profile.advisor'), diagnose: await aiAvailableFor(user, 'profile.diagnose'), canEdit: can(user, 'laminador', 'E'), canCreate: can(user, 'laminador', 'C') }} />
            ) : <Empty title={t('files.thisFormatIsNotSliced')} hint={t('files.gCodeFilesAreAlready')} />}
          </Card>
          <div className="space-y-4">
            <Card title={t('files.previousSlicesOfThisVersion')}>
              {slicedRuns.length === 0 ? <p className="text-sm muted">{t('files.itHasNotBeenSliced')}</p> : <ul className="space-y-2 text-sm">{slicedRuns.map((r) => <li key={r.id} className="flex items-center justify-between gap-2"><span className="truncate">{r.label ?? t('files.slice')}</span><span className="tabular shrink-0">{r.status === 'done' ? `${dur(r.timeS)} · ${grams((r.filament ?? []).reduce((x, y) => x + y.g, 0))}` : <StatusBadge status={r.status} />}</span></li>)}</ul>}
            </Card>
            <Card title={t('files.doesItFitMyMachines')}><p className="text-sm muted">{t('files.useThe3dViewerTab')} {a ? `${num(a.dimX, 1)}×${num(a.dimY, 1)}×${num(a.dimZ, 1)} mm.` : t('files.noAnalysisYet')}</p></Card>
          </div>
        </div>
      )}

      {tab === 'versiones' && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card title={t('files.versionHistory')} className="xl:col-span-2" pad={false}>
            <Table><thead><tr><th className="th">{t('files.version')}</th><th className="th">{t('common.date')}</th><th className="th">{t('files.size')}</th><th className="th">{t('files.comment')}</th><th className="th" /></tr></thead>
              <tbody>{versions.map((v) => <tr key={v.id}><td className="td font-medium">v{v.number} {v.id === cur?.id && <Badge tone="green">{t('files.current')}</Badge>}</td><td className="td tabular">{dmy(v.createdAt)}</td><td className="td tabular">{num(v.size / 1024, 0)} KB</td><td className="td">{v.comment ?? '—'}</td><td className="td text-right whitespace-nowrap"><a className="btn-ghost btn-sm" href={`/api/files/v/${v.id}/raw`}>⬇</a> {v.id !== cur?.id && can(user, 'archivos', 'E') && <SetVersionButton modelId={f.id} versionId={v.id} />}</td></tr>)}</tbody></Table>
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
