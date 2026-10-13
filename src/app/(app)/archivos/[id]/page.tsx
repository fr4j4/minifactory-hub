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
import { Uploader } from '@/components/uploader';
import { LinksEditor } from '@/components/links-editor';
import { AutoRefresh, DeleteFileButton, FileMetaForm, SetVersionButton } from '@/components/file-bits';
import { getCalcContext } from '@/lib/context';
import { formatLabel, kindOfExt } from '@/lib/files';
import { dmy, dur, grams, num } from '@/lib/format';

export const metadata = { title: 'Archivo 3D' };

export default async function FilePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tab?: string }> }) {
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
  const tabs = [['visor', 'Visor 3D'], ['laminar', 'Laminar y cotizar'], ['versiones', `Versiones (${versions.length})`], ['vinculos', 'Vínculos y referencias']];
  const color = '#3b82f6';
  return (
    <>
      <PageHeader back={{ href: '/archivos', label: 'Archivos 3D' }} title={f.name} subtitle={<span className="inline-flex flex-wrap items-center gap-2"><Badge>{formatLabel(f.format ?? '')}</Badge><span>v{cur?.number}</span>{f.origin && <span>· {f.origin}</span>}{f.license && <span>· licencia {f.license}</span>}</span>}
        actions={<>{cur && <a className="btn-ghost" href={`/api/files/v/${cur.id}/raw`} data-testid="download-file">⬇ Descargar</a>}{can(user, 'archivos', 'X') && <DeleteFileButton id={f.id} />}</>} />
      <AutoRefresh active={processing} />
      {meta.status === 'error' && <div className="rounded-lg border border-red-300 bg-red-50 dark:bg-red-950/40 p-3 text-sm text-red-800 dark:text-red-200 mb-4" role="alert">No se pudo analizar el archivo: {meta.error}</div>}
      <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700 mb-4" aria-label="Secciones del archivo">
        {tabs.map(([k, l]) => <Link key={k} href={`/archivos/${id}?tab=${k}`} aria-current={tab === k ? 'page' : undefined} className={`px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px min-h-[44px] flex items-center ${tab === k ? 'border-brand-600 text-brand-700 dark:text-brand-300 font-medium' : 'border-transparent muted'}`}>{l}</Link>)}
      </nav>

      {tab === 'visor' && (
        <div className="grid gap-4 xl:grid-cols-3">
          <div className="xl:col-span-2 space-y-4">
            {!processing && cur && kind === 'malla' && meta.previewKey && <ModelViewer versionId={cur.id} machines={machines} color={color} analysis={a} />}
            {!processing && cur && kind === 'malla' && meta.gcodePreviewKey && <Card title="Trayectorias del G-code incluido en el 3MF"><GcodeViewer src={`/api/files/v/${cur.id}/gcode`} /></Card>}
            {!processing && cur && kind === 'gcode' && (meta.gcodePreviewKey ? <GcodeViewer src={`/api/files/v/${cur.id}/gcode`} /> : <Card><Empty title="Sin vista previa de capas" hint={sm?.notes?.[0] ?? 'Este G-code no se puede previsualizar.'} /></Card>)}
            {!processing && cur && kind === 'imagen' && (f.format === 'pdf' ? <iframe src={`/api/files/v/${cur.id}/raw`} className="w-full h-[70vh] card" title={f.name} /> : <img src={`/api/files/v/${cur.id}/thumb`} alt={f.name} className="card w-full" />)}
            {photos.length > 0 && <Card title="Fotos de lo fabricado con este modelo"><div className="grid grid-cols-3 sm:grid-cols-6 gap-2">{photos.map((p) => <img key={p.id} src={`/api/media/${p.variants?.['320'] ?? p.storageKey}`} alt={p.caption ?? 'Foto'} className="rounded aspect-square object-cover" />)}</div></Card>}
          </div>
          <div className="space-y-4">
            {a && (
              <Card title="Análisis automático">
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm" data-testid="analysis">
                  <dt className="muted">Dimensiones</dt><dd className="tabular font-medium">{num(a.dimX, 1)} × {num(a.dimY, 1)} × {num(a.dimZ, 1)} mm</dd>
                  <dt className="muted">Volumen</dt><dd className="tabular font-medium">{num(a.volumeCm3, 2)} cm³</dd>
                  <dt className="muted">Superficie</dt><dd className="tabular">{num(a.areaCm2, 1)} cm²</dd>
                  <dt className="muted">Triángulos</dt><dd className="tabular">{num(a.triangles, 0)}</dd>
                  <dt className="muted">Malla cerrada</dt><dd>{a.closed ? <Badge tone="green">Sí</Badge> : <Badge tone="amber">No ({a.openEdges} aristas abiertas)</Badge>}</dd>
                  <dt className="muted">Normales</dt><dd>{a.invertedNormals ? <Badge tone="amber">Invertidas</Badge> : <Badge tone="green">Correctas</Badge>}</dd>
                  <dt className="muted">Cuerpos</dt><dd className="tabular">{a.shells}</dd>
                  <dt className="muted">Voladizos &gt; 45°</dt><dd className="tabular">{num(a.overhangPct, 1)}% de la superficie</dd>
                </dl>
                {(!a.closed || a.invertedNormals || a.nonManifoldEdges > 0) && <p className="text-xs text-amber-700 dark:text-amber-300 mt-3">Atención: una malla abierta o con aristas no-múltiples puede laminar mal. Conviene repararla antes de imprimir.</p>}
              </Card>
            )}
            {sm && (
              <Card title="Datos del laminador en el archivo">
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm" data-testid="sliced-meta">
                  <dt className="muted">Laminador</dt><dd>{sm.slicer ?? '—'}</dd>
                  <dt className="muted">Tiempo</dt><dd className="tabular font-medium">{dur(sm.timeS)}</dd>
                  <dt className="muted">Material</dt><dd className="tabular font-medium">{grams(sm.totalG)}</dd>
                  <dt className="muted">Capas</dt><dd className="tabular">{sm.layers ?? '—'}</dd>
                  <dt className="muted">Altura de capa</dt><dd className="tabular">{sm.layerHeight ? `${sm.layerHeight} mm` : '—'}</dd>
                  <dt className="muted">Máquina</dt><dd>{sm.machine ?? '—'}</dd>
                </dl>
                {sm.filaments?.length > 1 && <ul className="text-sm mt-2">{sm.filaments.map((x: any, i: number) => <li key={i}>Color {i + 1}{x.color ? ` (${x.color})` : ''}: <b>{grams(x.g)}</b></li>)}</ul>}
                {(sm.notes ?? []).map((n: string) => <p key={n} className="text-xs text-amber-700 dark:text-amber-300 mt-2">{n}</p>)}
              </Card>
            )}
            {can(user, 'archivos', 'E') && <Card title="Datos del archivo"><FileMetaForm f={{ id: f.id, name: f.name, folder: f.folder, tags: f.tags ?? [], license: f.license, origin: f.origin, author: f.author, customerId: f.customerId }} customers={customers} /></Card>}
          </div>
        </div>
      )}

      {tab === 'laminar' && cur && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card title="Laminado en el servidor" className="xl:col-span-2">
            {kind === 'malla' && f.format !== 'step' && f.format !== 'stp' ? (
              <SlicePanel fileVersionId={cur.id} ctx={ctx} fileId={f.id} fileName={f.name} canSlice={can(user, 'laminador', 'V')} />
            ) : <Empty title="Este formato no se lamina en el servidor" hint="Los G-code ya vienen laminados (usa modo semiautomático en el presupuesto). Los STEP se convierten a malla antes de laminar." />}
          </Card>
          <div className="space-y-4">
            <Card title="Corridas anteriores de esta versión">
              {slicedRuns.length === 0 ? <p className="text-sm muted">Todavía no se ha laminado.</p> : <ul className="space-y-2 text-sm">{slicedRuns.map((r) => <li key={r.id} className="flex items-center justify-between gap-2"><span className="truncate">{r.label ?? 'Corrida'}</span><span className="tabular shrink-0">{r.status === 'done' ? `${dur(r.timeS)} · ${grams((r.filament ?? []).reduce((x, y) => x + y.g, 0))}` : <StatusBadge status={r.status} />}</span></li>)}</ul>}
            </Card>
            <Card title="¿Cabe en mis máquinas?"><p className="text-sm muted">Usa la pestaña Visor 3D: el visor dibuja el volumen de cada máquina y avisa si la pieza no cabe. Aquí: {a ? `${num(a.dimX, 1)}×${num(a.dimY, 1)}×${num(a.dimZ, 1)} mm.` : 'sin análisis aún.'}</p></Card>
          </div>
        </div>
      )}

      {tab === 'versiones' && (
        <div className="grid gap-4 xl:grid-cols-3">
          <Card title="Historial de versiones" className="xl:col-span-2" pad={false}>
            <Table><thead><tr><th className="th">Versión</th><th className="th">Fecha</th><th className="th">Tamaño</th><th className="th">Comentario</th><th className="th" /></tr></thead>
              <tbody>{versions.map((v) => <tr key={v.id}><td className="td font-medium">v{v.number} {v.id === cur?.id && <Badge tone="green">Actual</Badge>}</td><td className="td tabular">{dmy(v.createdAt)}</td><td className="td tabular">{num(v.size / 1024, 0)} KB</td><td className="td">{v.comment ?? '—'}</td><td className="td text-right whitespace-nowrap"><a className="btn-ghost btn-sm" href={`/api/files/v/${v.id}/raw`}>⬇</a> {v.id !== cur?.id && can(user, 'archivos', 'E') && <SetVersionButton modelId={f.id} versionId={v.id} />}</td></tr>)}</tbody></Table>
          </Card>
          {can(user, 'archivos', 'C') && <Card title="Subir una versión nueva"><Uploader intent={{ intent: 'model', modelFileId: f.id }} multiple={false} accept=".stl,.3mf,.obj,.ply,.amf,.glb,.step,.stp,.gcode" label="Arrastra el archivo actualizado" hint="Se guarda como v2, v3… y queda como versión actual." /></Card>}
        </div>
      )}

      {tab === 'vinculos' && (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card title="Links de referencia del modelo"><LinksEditor value={links.map((l) => ({ ...l }))} persist={{ ownerType: 'model_file', ownerId: f.id, revalidate: `/archivos/${id}` }} readOnly={!can(user, 'archivos', 'E')} /></Card>
          <Card title="Usado en presupuestos">{used.length === 0 ? <p className="text-sm muted">Aún no se usa en presupuestos.</p> : <ul className="space-y-2 text-sm">{used.map(({ q }) => <li key={q.id} className="flex items-center justify-between"><Link className="underline" href={`/presupuestos/${q.id}`}>{q.number} v{q.version} · {q.title ?? q.customerName}</Link><StatusBadge status={q.status} /></li>)}</ul>}</Card>
        </div>
      )}
    </>
  );
}
