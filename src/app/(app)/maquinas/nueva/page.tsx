import { isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { PageHeader, Card } from '@/components/ui';
import { MachineForm } from '@/components/machine-bits';
import { getSettings } from '@/lib/settings';
import { getT } from '@/i18n/server';
import { rowNozzle } from '@/lib/slicer/catalog';
export async function generateMetadata() { return { title: (await getT())('meta.newMachine') }; }
export default async function NewMachine() {
  const t = await getT();
  await pagePerm('maquinas', 'C'); const db = await getDb(); const st = await getSettings(); const profs = await db.select().from(s.slicerProfiles).where(isNull(s.slicerProfiles.deletedAt));
  return (<><PageHeader back={{ href: '/maquinas', label: t('nav.machines') }} title={t('machines.newMachine')} /><Card><MachineForm materialTypes={[...new Set((await db.select({ t: s.materials.type }).from(s.materials).where(isNull(s.materials.deletedAt))).map((x) => x.t.trim().toUpperCase()))]} profiles={profs.map((p) => ({ id: p.id, name: p.name, type: p.type, nozzle: p.type === 'filament' ? null : rowNozzle(p) }))} kwh={st.rates.kwh} /></Card></>);
}
