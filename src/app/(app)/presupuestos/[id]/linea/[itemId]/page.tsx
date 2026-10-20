import { notFound } from 'next/navigation';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { canSeeCosts } from '@/lib/perm';
import { PageHeader, Card } from '@/components/ui';
import { LineDetail } from '@/components/line-detail';
import { loadQuote } from '@/lib/services/quotes';
import { getT } from '@/i18n/server';

export async function generateMetadata() { return { title: (await getT())('quotes.viewDetails') }; }
/** «Ver detalles» de una línea del presupuesto, como página propia (se puede compartir el enlace internamente). */
export default async function LineaPage({ params }: { params: Promise<{ id: string; itemId: string }> }) {
  const { id, itemId } = await params; const t = await getT();
  const user = await pagePerm('presupuestos', 'V'); const db = await getDb(); const costs = canSeeCosts(user);
  const d = await loadQuote(id); if (!d) notFound();
  const { quote: q, items } = d; const it = items.find((x) => x.id === itemId); if (!it) notFound();
  const lt = ((q.calc as any)?.lines ?? []) as Array<{ id: string; marginPct: number | null }>; const l = lt.find((x) => x.id === it.id);
  const mats = new Map((await db.select().from(s.materials)).map((m) => [m.id, `${m.manufacturer ? m.manufacturer + ' ' : ''}${m.type} ${m.colorName}`]));
  const machs = new Map((await db.select({ id: s.machines.id, name: s.machines.name }).from(s.machines)).map((m) => [m.id, m.name]));
  const procs = new Map((await db.select({ id: s.slicerProfiles.id, name: s.slicerProfiles.name }).from(s.slicerProfiles)).map((m) => [m.id, m.name]));
  return (<>
    <PageHeader back={{ href: `/presupuestos/${q.id}`, label: q.number }} title={it.description || t('quotes.part')} subtitle={`${q.number} · ${it.qty} ×`} />
    <Card><LineDetail item={{ mode: it.mode, gramsTotal: it.gramsTotal, hoursTotal: it.hoursTotal, qty: it.qty, prepMinutes: it.prepMinutes, postMinutes: it.postMinutes, postSupplies: it.postSupplies, shipping: it.shipping, color: it.color, material: it.materialId ? mats.get(it.materialId) ?? null : null, machine: it.machineId ? machs.get(it.machineId) ?? null : null, quality: it.processProfileId ? procs.get(it.processProfileId) ?? null : null, origin: (it.origin ?? {}) as any, breakdown: costs ? ((it.costBreakdown ?? null) as any) : null, marginPct: costs ? l?.marginPct ?? null : null }} /></Card>
  </>);
}
