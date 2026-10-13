import { pagePerm } from '@/lib/auth';
import { canSeeCosts, canSetFinalPrice } from '@/lib/perm';
import { PageHeader } from '@/components/ui';
import { QuoteEditor, type QuoteState } from '@/components/quote-editor';
import { newItem } from '@/components/line-editor';
import { loadEditorData } from '@/lib/editor-data';
import { getSettings } from '@/lib/settings';
import { getDb, s } from '@/db';
import { eq } from 'drizzle-orm';

export const metadata = { title: 'Nuevo presupuesto' };

export default async function NewQuote({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await pagePerm('presupuestos', 'C'); const sp = await searchParams;
  const { ctx, customers, models, variants } = await loadEditorData(); const st = await getSettings(); const db = await getDb();
  const valid = new Date(Date.now() + st.quoteValidDays * 86400_000).toISOString().slice(0, 10);
  const items = [] as QuoteState['items'];
  // viene desde el visor/laminador: modelo + resultado del laminado ya cargado
  if (sp.file) {
    const m = models.find((x) => x.id === sp.file);
    if (m) {
      const copies = Math.max(1, Number(sp.copies ?? 1));
      const it = newItem(ctx, { kind: 'modelo', description: m.name, qty: copies, mode: 'auto', models: [{ modelFileId: m.id, fileVersionId: m.versionId, qty: 1, name: m.name }], machineId: sp.machine ?? undefined, materialId: sp.material ?? undefined });
      const mach = ctx.machines.find((x) => x.id === it.machineId); if (mach) it.processProfileId = mach.defaultProcessProfileId;
      const mat = ctx.materials.find((x) => x.id === it.materialId); if (mat) it.color = mat.colorName;
      if (sp.run) {
        const [r] = await db.select().from(s.sliceRuns).where(eq(s.sliceRuns.id, sp.run));
        if (r?.status === 'done') { const g = (r.filament ?? []).reduce((a, f) => a + f.g, 0); const h = (r.timeS ?? 0) / 3600; Object.assign(it, { gramsTotal: g, hoursTotal: h, unitGrams: g / copies, unitHours: h / copies, sliceRunId: r.id, processProfileId: r.processProfileId ?? it.processProfileId, origin: { grams: 'slicer', hours: 'slicer', runId: r.id, engine: `OrcaSlicer ${r.engineVersion}` } }); }
      }
      items.push(it);
    }
  }
  const initial: QuoteState = { customerId: sp.customer ?? null, customerName: '', customerPhone: '', source: '', title: '', urgency: 'normal', discount: 0, finalTotal: null, priceReason: '', notes: '', validUntil: valid, items, links: [] };
  const c = customers.find((x) => x.id === initial.customerId); if (c) { initial.customerName = c.name; initial.customerPhone = c.phone ?? ''; }
  return (<><PageHeader back={{ href: '/presupuestos', label: 'Presupuestos' }} title="Nuevo presupuesto" subtitle="Agrega uno o varios modelos. Se guarda solo como borrador mientras trabajas." />
    <QuoteEditor initial={initial} ctx={ctx} customers={customers} models={models} variants={variants} showCosts={canSeeCosts(user)} canPrice={canSetFinalPrice(user)} /></>);
}
