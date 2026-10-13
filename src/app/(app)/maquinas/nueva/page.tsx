import { isNull } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { PageHeader, Card } from '@/components/ui';
import { MachineForm } from '@/components/machine-bits';
import { getSettings } from '@/lib/settings';
import { rowNozzle } from '@/lib/slicer/catalog';
export const metadata = { title: 'Nueva máquina' };
export default async function NewMachine() {
  await pagePerm('maquinas', 'C'); const db = await getDb(); const st = await getSettings(); const profs = await db.select().from(s.slicerProfiles).where(isNull(s.slicerProfiles.deletedAt));
  return (<><PageHeader back={{ href: '/maquinas', label: 'Máquinas' }} title="Nueva máquina" /><Card><MachineForm profiles={profs.map((p) => ({ id: p.id, name: p.name, type: p.type, nozzle: p.type === 'filament' ? null : rowNozzle(p) }))} kwh={st.rates.kwh} /></Card></>);
}
