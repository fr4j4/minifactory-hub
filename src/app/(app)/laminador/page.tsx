import Link from 'next/link';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader, Card, Table, Badge, StatusBadge, Tabs, Empty } from '@/components/ui';
import { NewProfileButton, ProfileRowActions } from '@/components/profile-bits';
import { CustomFilamentButton, ImportPresetsButton } from '@/components/slicing-setup';
import { slicingReadiness } from '@/lib/slicer/setup';
import { TYPE_LABEL } from '@/lib/slicer/params';
import { Comparator } from '@/components/comparator';
import { getCalcContext } from '@/lib/context';
import { orcaAvailable } from '@/lib/slicer/catalog';
import { engineVersion } from '@/lib/slicer/run';
import { dmyHm, dur, grams } from '@/lib/format';

export const metadata = { title: 'Laminador' };

export default async function SlicerPage({ searchParams }: { searchParams: Promise<{ tab?: string; file?: string }> }) {
  const user = await pagePerm('laminador', 'V'); const { tab = 'perfiles', file } = await searchParams; const db = await getDb();
  const ctx = await getCalcContext(); const engine = await engineVersion();
  const profs = await db.select().from(s.slicerProfiles).where(isNull(s.slicerProfiles.deletedAt)).orderBy(s.slicerProfiles.type, s.slicerProfiles.name);
  const runs = tab === 'corridas' ? await db.select({ r: s.sliceRuns, f: s.modelFiles.name }).from(s.sliceRuns).innerJoin(s.fileVersions, eq(s.fileVersions.id, s.sliceRuns.fileVersionId)).innerJoin(s.modelFiles, eq(s.modelFiles.id, s.fileVersions.modelFileId)).orderBy(desc(s.sliceRuns.createdAt)).limit(60) : [];
  const files = tab === 'comparar' ? (await db.select({ f: s.modelFiles, v: s.fileVersions }).from(s.modelFiles).innerJoin(s.fileVersions, eq(s.fileVersions.id, s.modelFiles.currentVersionId)).where(isNull(s.modelFiles.deletedAt)).orderBy(s.modelFiles.name)).filter((x) => !['gcode', 'gco', 'bgcode', 'png', 'jpg', 'jpeg', 'webp', 'pdf', 'svg', 'step', 'stp'].includes(x.v.format)).map((x) => ({ id: x.f.id, name: x.f.name, versionId: x.v.id })) : [];
  const ready = tab === 'perfiles' ? await slicingReadiness() : null;
  const machineProfiles = profs.filter((p) => p.type === 'machine').map((p) => ({ name: p.name, baseName: p.baseName }));
  const usedBy = (id: string, type: string) => type === 'machine' ? ctx.machines.filter((m) => m.machineProfileId === id).map((m) => m.name) : type === 'filament' ? ctx.materials.filter((m) => m.filamentProfileId === id).map((m) => m.label) : ctx.machines.filter((m) => m.defaultProcessProfileId === id).map((m) => m.name);
  return (
    <>
      <PageHeader title="Laminador" subtitle={<>Motor de laminado en el servidor: <b>{orcaAvailable() ? `OrcaSlicer ${engine}` : 'no instalado'}</b>. Tiempo y gramos del mismo motor que usa el programa de escritorio.</>}
        actions={<><Link href="/laminador/configurar" className="btn-primary" data-testid="setup-open">Configurar laminado</Link>{can(user, 'laminador', 'C') && tab === 'perfiles' && <ImportPresetsButton />}</>} />
      {!orcaAvailable() && <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm mb-4">OrcaSlicer no está instalado. Ejecuta <code>npm run orca:install</code> para habilitar el laminado automático. Mientras tanto puedes cotizar en modo semiautomático (G-code/3MF) o manual.</div>}
      <Tabs current={tab} tabs={[{ key: 'perfiles', label: 'Perfiles', href: '/laminador' }, { key: 'comparar', label: 'Comparador', href: '/laminador?tab=comparar' }, { key: 'corridas', label: 'Corridas', href: '/laminador?tab=corridas' }]} />
      {tab === 'perfiles' && (
        <div className="space-y-5">
          {ready && (ready.done.machines < ready.machines.length || ready.done.materials < ready.materials.length) && <Link href="/laminador/configurar" className="block rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-900 p-4 hover:border-amber-500" data-testid="setup-banner">
            <div className="font-medium">Falta configurar: {ready.machines.length - ready.done.machines} máquina(s) y {ready.materials.length - ready.done.materials} material(es) sin perfil.</div>
            <div className="text-sm muted mt-0.5">Abre la configuración guiada: eliges tu impresora y tus filamentos de una lista, sin JSON. →</div></Link>}
          <p className="text-sm muted max-w-3xl">Un perfil es <b>un perfil de fábrica de OrcaSlicer/Bambu Studio + tus cambios</b>. <b>Impresora</b>: qué máquina y boquilla. <b>Proceso</b>: la calidad (altura de capa, paredes, relleno, velocidades). <b>Filamento</b>: temperaturas, flujo y densidad del material.</p>
          {(['machine', 'process', 'filament'] as const).map((t) => (
            <Card key={t} title={`Perfiles de ${TYPE_LABEL[t].toLowerCase()}`} pad={false} actions={can(user, 'laminador', 'C') ? <span className="flex flex-wrap gap-2">{t === 'filament' && <CustomFilamentButton small label="+ Filamento personalizado" />}<NewProfileButton type={t} machines={machineProfiles} /></span> : undefined}>
              {profs.filter((p) => p.type === t).length === 0 ? <Empty title="Sin perfiles" hint="Crea uno a partir de un perfil de fábrica de OrcaSlicer." /> : (
                <Table><thead><tr><th className="th">Nombre</th><th className="th">Base de fábrica</th><th className="th">Cambios</th><th className="th">Versión</th><th className="th">Usado en</th><th className="th" /></tr></thead>
                  <tbody>{profs.filter((p) => p.type === t).map((p) => (
                    <tr key={p.id}><td className="td font-medium"><Link className="hover:underline" href={`/laminador/perfiles/${p.id}`}>{p.name}</Link> {p.simulated && <Badge tone="violet">Simulada</Badge>} {p.imported && <Badge>Importado</Badge>}</td>
                      <td className="td text-xs muted">{p.vendor} · {p.baseName}</td><td className="td tabular">{Object.keys(p.changes ?? {}).length}</td><td className="td tabular">v{p.version}</td>
                      <td className="td text-xs">{usedBy(p.id, t).join(', ') || <span className="muted">—</span>}</td>
                      <td className="td text-right whitespace-nowrap">{can(user, 'laminador', 'C') && <ProfileRowActions id={p.id} name={p.name} />}</td></tr>
                  ))}</tbody></Table>
              )}
            </Card>
          ))}
        </div>
      )}
      {tab === 'comparar' && (files.length ? <Comparator ctx={ctx} files={files} initialFile={file} /> : <Card><Empty title="Sube un modelo primero" hint="El comparador lamina un archivo STL/3MF/OBJ con varias combinaciones a la vez." action={<Link className="btn-primary" href="/archivos">Ir a Archivos 3D</Link>} /></Card>)}
      {tab === 'corridas' && (
        <Card pad={false}><Table><thead><tr><th className="th">Fecha</th><th className="th">Archivo</th><th className="th">Etiqueta</th><th className="th">Estado</th><th className="th text-right">Tiempo</th><th className="th text-right">Material</th><th className="th text-right">Copias</th><th className="th">Motor</th></tr></thead>
          <tbody>{runs.map(({ r, f }) => <tr key={r.id}><td className="td tabular">{dmyHm(r.createdAt)}</td><td className="td">{f}</td><td className="td text-xs muted">{(r.profileVersions as any)?.process?.[0]}</td><td className="td"><StatusBadge status={r.status} />{r.error && <div className="text-xs text-red-600 dark:text-red-400 max-w-xs">{r.error}</div>}</td><td className="td text-right tabular">{dur(r.timeS)}</td><td className="td text-right tabular">{grams((r.filament ?? []).reduce((a, x) => a + x.g, 0))}</td><td className="td text-right">{r.copies}</td><td className="td text-xs">Orca {r.engineVersion}{(r.result as any)?.cached && ' · caché'}</td></tr>)}</tbody></Table>
          {runs.length === 0 && <Empty title="Aún no hay corridas" />}</Card>
      )}
    </>
  );
}
