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
import { getT } from '@/i18n/server';

export async function generateMetadata() { return { title: (await getT())('meta.slicer') }; }

export default async function SlicerPage({ searchParams }: { searchParams: Promise<{ tab?: string; file?: string }> }) {
  const t = await getT();
  const user = await pagePerm('laminador', 'V'); const { tab = 'perfiles', file } = await searchParams; const db = await getDb();
  const ctx = await getCalcContext(); const engine = await engineVersion();
  const profs = await db.select().from(s.slicerProfiles).where(isNull(s.slicerProfiles.deletedAt)).orderBy(s.slicerProfiles.type, s.slicerProfiles.name);
  const runs = tab === 'laminados' ? await db.select({ r: s.sliceRuns, f: s.modelFiles.name }).from(s.sliceRuns).innerJoin(s.fileVersions, eq(s.fileVersions.id, s.sliceRuns.fileVersionId)).innerJoin(s.modelFiles, eq(s.modelFiles.id, s.fileVersions.modelFileId)).orderBy(desc(s.sliceRuns.createdAt)).limit(60) : [];
  const files = tab === 'comparar' ? (await db.select({ f: s.modelFiles, v: s.fileVersions }).from(s.modelFiles).innerJoin(s.fileVersions, eq(s.fileVersions.id, s.modelFiles.currentVersionId)).where(isNull(s.modelFiles.deletedAt)).orderBy(s.modelFiles.name)).filter((x) => !['gcode', 'gco', 'bgcode', 'png', 'jpg', 'jpeg', 'webp', 'pdf', 'svg', 'step', 'stp'].includes(x.v.format)).map((x) => ({ id: x.f.id, name: x.f.name, versionId: x.v.id })) : [];
  const ready = tab === 'perfiles' ? await slicingReadiness() : null;
  const machineProfiles = profs.filter((p) => p.type === 'machine').map((p) => ({ name: p.name, baseName: p.baseName }));
  const usedBy = (id: string, type: string) => type === 'machine' ? ctx.machines.filter((m) => m.machineProfileId === id).map((m) => m.name) : type === 'filament' ? ctx.materials.filter((m) => m.filamentProfileId === id).map((m) => m.label) : ctx.machines.filter((m) => m.defaultProcessProfileId === id).map((m) => m.name);
  return (
    <>
      <PageHeader title={t('slicer.slicer')} subtitle={<>{t('slicer.engineLabel')} <b>{orcaAvailable() ? t('slicer.orcaslicer', { engine }) : t('slicer.notInstalled')}</b>. {t('slicer.engineNote')}</>}
        actions={<><Link href="/laminador/configurar" className="btn-primary" data-testid="setup-open">{t('slicer.setUpSlicing')}</Link>{can(user, 'laminador', 'C') && tab === 'perfiles' && <ImportPresetsButton />}</>} />
      {!orcaAvailable() && <div className="rounded-lg border border-amber-300 bg-amber-50 dark:bg-amber-950/40 p-3 text-sm mb-4">{t('slicer.orcaMissing', { cmd: 'npm run orca:install' })}</div>}
      <Tabs current={tab} tabs={[{ key: 'perfiles', label: t('slicer.tabProfiles'), href: '/laminador' }, { key: 'comparar', label: t('slicer.tabComparator'), href: '/laminador?tab=comparar' }, { key: 'laminados', label: t('slicer.tabSlices'), href: '/laminador?tab=laminados' }]} />
      {tab === 'perfiles' && (
        <div className="space-y-5">
          {ready && (ready.done.machines < ready.machines.length || ready.done.materials < ready.materials.length) && <Link href="/laminador/configurar" className="block rounded-2xl border border-amber-300 bg-amber-50 dark:bg-amber-950/40 dark:border-amber-900 p-4 hover:border-amber-500" data-testid="setup-banner">
            <div className="font-medium">{t('slicer.missingSetup', { machines: ready.machines.length - ready.done.machines, materials: ready.materials.length - ready.done.materials })}</div>
            <div className="text-sm muted mt-0.5">{t('slicer.opensTheGuidedSetupPick')}</div></Link>}
          <p className="text-sm muted max-w-3xl">{t('slicer.profileExplain')}</p>
          {(['machine', 'process', 'filament'] as const).map((tt) => (
            <Card key={tt} title={t('slicer.profiles', { type: t(TYPE_LABEL[tt]).toLowerCase() })} pad={false} actions={can(user, 'laminador', 'C') ? <span className="flex flex-wrap gap-2">{tt === 'filament' && <CustomFilamentButton small label={t('slicer.customFilament')} />}<NewProfileButton type={tt} machines={machineProfiles} /></span> : undefined}>
              {profs.filter((p) => p.type === tt).length === 0 ? <Empty title={t('slicer.noProfiles')} hint={t('slicer.createOneFromAnOrcaslicer')} /> : (
                <Table><thead><tr><th className="th">{t('common.name')}</th><th className="th">{t('slicer.factoryBase')}</th><th className="th">{t('slicer.changes')}</th><th className="th">{t('slicer.version')}</th><th className="th">{t('slicer.usedIn')}</th><th className="th" /></tr></thead>
                  <tbody>{profs.filter((p) => p.type === tt).map((p) => (
                    <tr key={p.id}><td className="td font-medium"><Link className="hover:underline" href={`/laminador/perfiles/${p.id}`}>{p.name}</Link> {p.simulated && <Badge tone="violet">{t('slicer.simulated')}</Badge>} {p.imported && <Badge>{t('slicer.imported')}</Badge>}</td>
                      <td className="td text-xs muted">{p.vendor} · {p.baseName}</td><td className="td tabular">{Object.keys(p.changes ?? {}).length}</td><td className="td tabular">v{p.version}</td>
                      <td className="td text-xs">{usedBy(p.id, tt).join(', ') || <span className="muted">—</span>}</td>
                      <td className="td text-right whitespace-nowrap">{can(user, 'laminador', 'C') && <ProfileRowActions id={p.id} name={p.name} />}</td></tr>
                  ))}</tbody></Table>
              )}
            </Card>
          ))}
        </div>
      )}
      {tab === 'comparar' && (files.length ? <Comparator ctx={ctx} files={files} initialFile={file} /> : <Card><Empty title={t('slicer.uploadAModelFirst')} hint={t('slicer.theComparatorSlicesAnStl')} action={<Link className="btn-primary" href="/archivos">{t('slicer.goTo3dFiles')}</Link>} /></Card>)}
      {tab === 'laminados' && (
        <Card pad={false}><Table><thead><tr><th className="th">{t('common.date')}</th><th className="th">{t('slicer.file')}</th><th className="th">{t('common.tag')}</th><th className="th">{t('common.status')}</th><th className="th text-right">{t('common.time')}</th><th className="th text-right">{t('common.material')}</th><th className="th text-right">{t('slicer.copies')}</th><th className="th">{t('slicer.engine')}</th></tr></thead>
          <tbody>{runs.map(({ r, f }) => <tr key={r.id}><td className="td tabular">{dmyHm(r.createdAt)}</td><td className="td">{f}</td><td className="td text-xs muted">{(r.profileVersions as any)?.process?.[0]}</td><td className="td"><StatusBadge status={r.status} />{r.error && <div className="text-xs text-red-600 dark:text-red-400 max-w-xs">{r.error}</div>}</td><td className="td text-right tabular">{dur(r.timeS)}</td><td className="td text-right tabular">{grams((r.filament ?? []).reduce((a, x) => a + x.g, 0))}</td><td className="td text-right">{r.copies}</td><td className="td text-xs">{t('slicer.orcaVersion', { version: r.engineVersion })}{(r.result as any)?.cached && t('slicer.cached')}</td></tr>)}</tbody></Table>
          {runs.length === 0 && <Empty title={t('slicer.noSlicesYet')} />}</Card>
      )}
    </>
  );
}
