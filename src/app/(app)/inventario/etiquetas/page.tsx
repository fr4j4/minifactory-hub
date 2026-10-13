import QRCode from 'qrcode';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { PageHeader } from '@/components/ui';
import { PrintButton } from '@/components/print-button';

export const metadata = { title: 'Etiquetas QR' };
export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ fmt?: string }> }) {
  await pagePerm('inventario', 'V'); const { fmt = 'termica' } = await searchParams; const db = await getDb();
  const rows = await db.select({ sp: s.spools, m: s.materials }).from(s.spools).innerJoin(s.materials, eq(s.materials.id, s.spools.materialId)).where(and(isNull(s.spools.deletedAt), ne(s.spools.status, 'descartada'))).orderBy(asc(s.spools.code));
  const qrs = await Promise.all(rows.map((r) => QRCode.toDataURL(`MF:${r.sp.code}`, { margin: 0, width: 160 })));
  const thermal = fmt === 'termica';
  return (
    <>
      <div className="no-print"><PageHeader back={{ href: '/inventario?tab=bobinas', label: 'Bobinas' }} title="Etiquetas QR" subtitle="Térmica 40×30 mm o una hoja A4 con varias etiquetas." actions={<><a className={`btn-ghost ${thermal ? '!bg-[var(--panel)] !text-[var(--panel-ink)] dark:!bg-slate-700' : ''}`} href="?fmt=termica">Térmica 40×30</a><a className={`btn-ghost ${!thermal ? '!bg-[var(--panel)] !text-[var(--panel-ink)] dark:!bg-slate-700' : ''}`} href="?fmt=a4">Hoja A4</a><PrintButton /></>} /></div>
      <style>{thermal ? '@page{size:40mm 30mm;margin:0}' : '@page{size:A4;margin:10mm}'}</style>
      <div className={thermal ? '' : 'grid grid-cols-4 gap-2'} data-testid="labels">
        {rows.map((r, i) => (
          <div key={r.sp.id} className="bg-white text-black border border-slate-300 flex items-center gap-1.5 p-1.5" style={thermal ? { width: '40mm', height: '30mm', pageBreakAfter: 'always', breakAfter: 'page' } : { height: '30mm' }}>
            <img src={qrs[i]} alt="" style={{ width: '22mm', height: '22mm' }} />
            <div className="leading-tight overflow-hidden" style={{ fontSize: '8pt' }}><b style={{ fontSize: '10pt' }}>{r.sp.code}</b><br />{r.m.type}<br />{r.m.colorName}<br />{Math.round(r.sp.initialG)} g</div>
          </div>))}
      </div>
    </>
  );
}
