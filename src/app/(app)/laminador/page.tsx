import Link from 'next/link';
import { and, desc, eq, isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader, Card, Table, Badge, StatusBadge, Tabs, Empty } from '@/components/ui';
import { NewProfileButton, ProfileRowActions, ProfilesGuide } from '@/components/profile-bits';
import { CustomFilamentButton, ImportPresetsButton } from '@/components/slicing-setup';
import { slicingReadiness } from '@/lib/slicer/setup';
import { TYPE_EXPLAIN, TYPE_LABEL } from '@/lib/slicer/params';
import { Comparator } from '@/components/comparator';
import { getCalcContext } from '@/lib/context';
import { orcaAvailable, rowNozzle } from '@/lib/slicer/catalog';
import { engineVersion } from '@/lib/slicer/run';
import { dmyHm, dur, grams, num } from '@/lib/format';
import { getT } from '@/i18n/server';

export async function generateMetadata() { return { title: (await getT())('meta.slicer') }; }

export default async function SlicerPage({ searchParams }: { searchParams: Promise<{ tab?: string; file?: string; nozzle?: string; own?: string }> }) {
  const t = await getT();
  const user = await pagePerm('laminador', 'V'); const { tab = 'perfiles', file, nozzle: nozzleFilter, own } = await searchParams; const db = await getDb();
  const ctx = await getCalcContext(); const engine = await engineVersion();
  const profs = await db.select().from(s.slicerProfiles).where(isNull(s.slicerProfiles.deletedAt)).orderBy(s.slicerProfiles.type, s.slicerProfiles.name);
  const runs = tab === 'laminados' ? await db.select({ r: s.sliceRuns, f: s.modelFiles.name }).from(s.sliceRuns).innerJoin(s.fileVersions, eq(s.fileVersions.id, s.sliceRuns.fileVersionId)).innerJoin(s.modelFiles, eq(s.modelFiles.id, s.fileVersions.modelFileId)).orderBy(desc(s.sliceRuns.createdAt)).limit(60) : [];
  const files = tab === 'comparar' ? (await db.select({ f: s.modelFiles, v: s.fileVersions }).from(s.modelFiles).innerJoin(s.fileVersions, eq(s.fileVersions.id, s.modelFiles.currentVersionId)).where(isNull(s.modelFiles.deletedAt)).orderBy(s.modelFiles.name)).filter((x) => !['gcode', 'gco', 'bgcode', 'png', 'jpg', 'jpeg', 'webp', 'pdf', 'svg', 'step', 'stp'].includes(x.v.format)).map((x) => ({ id: x.f.id, name: x.f.name, versionId: x.v.id })) : [];
  const ready = tab === 'perfiles' ? await slicingReadiness() : null;
  const nz = new Map(profs.map((p) => [p.id, p.type === 'filament' ? null : rowNozzle(p)] as const));
  const machineProfiles = profs.filter((p) => p.type === 'machine').map((p) => ({ id: p.id, name: p.name, baseName: p.baseName, nozzle: nz.get(p.id) ?? null }));
  const nozzlesInUse = [...new Set([...nz.values()].filter(Boolean) as string[])].sort((a, b) => Number(a) - Number(b));
  const isOwn = (p: (typeof profs)[number]) => p.imported || Object.keys(p.changes ?? {}).length > 0;
  const shown = (kind: string) => profs.filter((p) => p.type === kind && (!own || isOwn(p)) && (!nozzleFilter || kind === 'filament' || !nz.get(p.id) || Number(nz.get(p.id)) === Number(nozzleFilter)));
  const usedBy = (id: string, type: string): Array<{ label: string; href: string }> => type === 'machine' ? ctx.machines.filter((m) => m.machineProfileId === id).map((m) => ({ label: `${m.name}${m.nozzle ? ` (${m.nozzle})` : ''}`, href: `/maquinas/${m.id}` })) : type === 'filament' ? ctx.materials.filter((m) => m.filamentProfileId === id).map((m) => ({ label: m.label, href: '/inventario' })) : ctx.machines.filter((m) => m.defaultProcessProfileId === id).map((m) => ({ label: m.name, href: `/maquinas/${m.id}` }));
  return (
    <>
      <PageHeader title={t('slicer.slicer')} subtitle={<>{t('slicer.engineLabel')} <b>{orcaAvailable() ? t('slicer.orcaslicer', { engine }) : t('slicer.notInstalled')}</b>. {t('slicer.engineNote')}</>}
        actions={<><Link href="/laminador/configurar" className="btn-primary" data-testid="setup-open">{t('slicer.setUpSlicing')}</Link>{can(user, 'laminador', 'C') && tab === 'perfiles' && <ImportPresetsButton />}</>} />
      {!orcaAvailable() && <div className="rounded-lg box-warn p-3 text-sm mb-4">{t('slicer.orcaMissing', { cmd: 'npm run orca:install' })}</div>}
      <Tabs current={tab} tabs={[{ key: 'perfiles', label: t('slicer.tabProfiles'), href: '/laminador' }, { key: 'comparar', label: t('slicer.tabComparator'), href: '/laminador?tab=comparar' }, { key: 'laminados', label: t('slicer.tabSlices'), href: '/laminador?tab=laminados' }]} />
      {tab === 'perfiles' && (
        <div className="space-y-5">
          {ready && (ready.done.machines < ready.machines.length || ready.done.materials < ready.materials.length) && <Link href="/laminador/configurar" className="block rounded-2xl box-warn p-4 hover:border-amber-500" data-testid="setup-banner">
            <div className="font-medium">{t('slicer.missingSetup', { machines: ready.machines.length - ready.done.machines, materials: ready.materials.length - ready.done.materials })}</div>
            <div className="text-sm muted mt-0.5">{t('slicer.opensTheGuidedSetupPick')}</div></Link>}
          <ProfilesGuide open={profs.length === 0} />
          <nav className="flex flex-wrap items-center gap-1.5" aria-label={t('slicer.ownFilter')} data-testid="own-filter">
            <span className="text-sm muted mr-1">{t('slicer.ownFilterLabel')}</span>
            {[['', t('slicer.ownAll')], ['1', t('slicer.ownMine')]].map(([k, l]) => <Link key={k} href={`/laminador?${new URLSearchParams({ ...(k ? { own: k } : {}), ...(nozzleFilter ? { nozzle: nozzleFilter } : {}) })}`} aria-current={(own ?? '') === k ? 'true' : undefined} className={`btn-sm rounded-lg px-2.5 border ${(own ?? '') === k ? 'bg-[var(--panel)] text-[var(--panel-ink)] border-transparent' : 'btn-ghost'}`}>{l}</Link>)}
          </nav>
          {nozzlesInUse.length > 1 && <nav className="flex flex-wrap items-center gap-1.5" aria-label={t('nozzle.filterByNozzle')} data-testid="nozzle-filter">
            <span className="text-sm muted mr-1">{t('nozzle.filterLabel')}</span>
            {[['', t('nozzle.all')], ...nozzlesInUse.map((n) => [n, t('nozzle.mm', { n: num(+n, 2) })])].map(([n, l]) => <Link key={n} href={n ? `/laminador?nozzle=${n}` : '/laminador'} aria-current={(nozzleFilter ?? '') === n ? 'true' : undefined} className={`num min-h-[36px] px-3 rounded-xl border text-sm inline-flex items-center ${(nozzleFilter ?? '') === n ? 'bg-[var(--panel)] text-[var(--panel-ink)] border-transparent dark:bg-slate-700' : 'border-[var(--line)] hover:bg-slate-100 dark:hover:bg-slate-800'}`}>{l}</Link>)}
          </nav>}
          {(['machine', 'process', 'filament'] as const).map((tt) => (
            <Card key={tt} title={t(TYPE_EXPLAIN[tt].title)} pad={false} actions={can(user, 'laminador', 'C') ? <span className="flex flex-wrap gap-2">{tt === 'filament' && <CustomFilamentButton small label={t('slicer.customFilament')} />}<NewProfileButton type={tt} machines={machineProfiles} /></span> : undefined}>
              <p className="px-4 pb-2 text-xs muted max-w-3xl">{t(TYPE_EXPLAIN[tt].what)}</p>
              {shown(tt).length === 0 ? <Empty title={nozzleFilter && tt !== 'filament' ? t('nozzle.noProfilesForNozzle', { n: num(+nozzleFilter, 2) }) : t('slicer.noProfiles')} hint={tt === 'process' ? t('nozzle.emptyTemplateHint') : t('slicer.createOneFromAnOrcaslicer')} /> : (
                <Table><thead><tr><th className="th">{t('common.name')}</th>{tt !== 'filament' && <th className="th">{t('nozzle.colNozzle')}</th>}<th className="th">{t('slicer.factoryBase')}</th><th className="th">{t('slicer.changes')}</th><th className="th">{t('slicer.version')}</th><th className="th">{t('slicer.usedIn')}</th><th className="th" /></tr></thead>
                  <tbody>{shown(tt).map((p) => (
                    <tr key={p.id}><td className="td font-medium"><Link className="hover:underline" href={`/laminador/perfiles/${p.id}`}>{p.name}</Link> {p.simulated && <Badge>{t('slicer.simulated')}</Badge>} {p.imported && <Badge>{t('slicer.imported')}</Badge>}</td>
                      {tt !== 'filament' && <td className="td tabular">{nz.get(p.id) ? t('nozzle.mm', { n: num(+nz.get(p.id)!, 2) }) : <span className="muted">—</span>}</td>}
                      <td className="td text-xs muted">{p.vendor} · {p.baseName}</td><td className="td tabular">{Object.keys(p.changes ?? {}).length === 0 ? <span className="muted">{t('nozzle.factoryTag')}</span> : Object.keys(p.changes ?? {}).length}</td><td className="td tabular">v{p.version}</td>
                      <td className="td text-xs">{usedBy(p.id, tt).length ? usedBy(p.id, tt).map((u, i) => <span key={u.href + u.label}>{i > 0 && ', '}<Link className="underline" href={u.href}>{u.label}</Link></span>) : <span className="muted">—</span>}</td>
                      <td className="td text-right whitespace-nowrap">{can(user, 'laminador', 'C') && <ProfileRowActions id={p.id} name={p.name} canDelete={can(user, 'laminador', 'X')} />}</td></tr>
                  ))}</tbody></Table>
              )}
            </Card>
          ))}
        </div>
      )}
      {tab === 'comparar' && (files.length ? <Comparator ctx={ctx} files={files} initialFile={file} /> : <Card><Empty title={t('slicer.uploadAModelFirst')} hint={t('slicer.theComparatorSlicesAnStl')} action={<Link className="btn-primary" href="/archivos">{t('slicer.goTo3dFiles')}</Link>} /></Card>)}
      {tab === 'laminados' && (
        <Card pad={false}><Table><thead><tr><th className="th">{t('common.date')}</th><th className="th">{t('slicer.file')}</th><th className="th">{t('common.tag')}</th><th className="th">{t('common.status')}</th><th className="th text-right">{t('common.time')}</th><th className="th text-right">{t('common.material')}</th><th className="th text-right">{t('slicer.copies')}</th><th className="th">{t('slicer.engine')}</th></tr></thead>
          <tbody>{runs.map(({ r, f }) => <tr key={r.id}><td className="td tabular">{dmyHm(r.createdAt)}</td><td className="td">{f}</td><td className="td text-xs muted">{(r.profileVersions as any)?.process?.[0]}</td><td className="td"><StatusBadge status={r.status} />{r.error && <div className="text-xs text-danger max-w-xs">{r.error}</div>}</td><td className="td text-right tabular">{dur(r.timeS)}</td><td className="td text-right tabular">{grams((r.filament ?? []).reduce((a, x) => a + x.g, 0))}</td><td className="td text-right">{r.copies}</td><td className="td text-xs">{t('slicer.orcaVersion', { version: r.engineVersion })}{(r.result as any)?.cached && t('slicer.cached')}</td></tr>)}</tbody></Table>
          {runs.length === 0 && <Empty title={t('slicer.noSlicesYet')} />}</Card>
      )}
    </>
  );
}
