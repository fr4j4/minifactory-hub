import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader, Badge } from '@/components/ui';
import { ProfileEditor } from '@/components/profile-bits';
import { TYPE_LABEL } from '@/lib/slicer/params';
import { dmyHm, num } from '@/lib/format';
import { getT } from '@/i18n/server';
import { profileHealth } from '@/lib/slicer/performance';
import { ProfileHealthCard } from '@/components/profile-health';
import { rowNozzle } from '@/lib/slicer/catalog';
import { profileUsage } from '@/lib/slicer/usage';
import { Icon } from '@/components/shell';

export async function generateMetadata() { return { title: (await getT())('meta.slicingProfile') }; }

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const t = await getT();
  const user = await pagePerm('laminador', 'V'); const { id } = await params; const db = await getDb();
  const [p] = await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.id, id));
  if (!p) notFound();
  const versions = await db.select().from(s.slicerProfileVersions).where(eq(s.slicerProfileVersions.profileId, id)).orderBy(desc(s.slicerProfileVersions.version));
  const health = p.type === 'machine' ? null : await profileHealth(id);
  const use = await profileUsage(db, id); const nozzle = p.type === 'filament' ? null : rowNozzle(p);
  return (
    <>
      <PageHeader back={{ href: '/laminador', label: t('nav.slicer') }} title={p.name} actions={<a className="btn-ghost" href={`/api/profiles/${p.id}/export`} data-testid="profile-export" title={t('slicer.toOpenItInBambu')}><Icon name="download" className="h-4 w-4" />{t('slicer.exportForBambuStudio')}</a>} subtitle={<span className="inline-flex gap-2 items-center"><Badge>{t(TYPE_LABEL[p.type as 'machine'])}</Badge><span>v{p.version}</span>{nozzle && <Badge tone="blue">{t('nozzle.nozzleMm', { n: num(+nozzle, 2) })}</Badge>}<span>{t('slicer.baseInfo', { vendor: p.vendor, name: p.baseName })}</span></span>} />
      <ProfileEditor canEdit={can(user, 'laminador', 'E')} usedBy={use.blocking.map((x) => t(`nozzle.use.${x.kind}`, { name: x.name }))} p={{ id: p.id, type: p.type as any, name: p.name, vendor: p.vendor, nozzle, baseName: p.baseName, changes: p.changes ?? {}, version: p.version, simulated: p.simulated, notes: p.notes }}
        versions={versions.map((v) => ({ version: v.version, note: v.note, createdAt: dmyHm(v.createdAt), keys: Object.keys(v.changes ?? {}).length }))} />
      {health && <ProfileHealthCard h={health} currentVersion={p.version} t={t} />}
    </>
  );
}
