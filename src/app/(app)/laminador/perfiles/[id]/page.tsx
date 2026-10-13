import { notFound } from 'next/navigation';
import { desc, eq } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader, Badge } from '@/components/ui';
import { ProfileEditor, TYPE_LABEL } from '@/components/profile-bits';
import { dmyHm } from '@/lib/format';

export const metadata = { title: 'Perfil de laminado' };

export default async function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await pagePerm('laminador', 'V'); const { id } = await params; const db = await getDb();
  const [p] = await db.select().from(s.slicerProfiles).where(eq(s.slicerProfiles.id, id));
  if (!p) notFound();
  const versions = await db.select().from(s.slicerProfileVersions).where(eq(s.slicerProfileVersions.profileId, id)).orderBy(desc(s.slicerProfileVersions.version));
  return (
    <>
      <PageHeader back={{ href: '/laminador', label: 'Laminador' }} title={p.name} subtitle={<span className="inline-flex gap-2 items-center"><Badge>{TYPE_LABEL[p.type as 'machine']}</Badge><span>v{p.version}</span><span>· base: {p.vendor} / {p.baseName}</span></span>} />
      <ProfileEditor canEdit={can(user, 'laminador', 'E')} p={{ id: p.id, type: p.type as any, name: p.name, baseName: p.baseName, changes: p.changes ?? {}, version: p.version, simulated: p.simulated, notes: p.notes }}
        versions={versions.map((v) => ({ version: v.version, note: v.note, createdAt: dmyHm(v.createdAt), keys: Object.keys(v.changes ?? {}).length }))} />
    </>
  );
}
