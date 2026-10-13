import Link from 'next/link';
import { pagePerm } from '@/lib/auth';
import { canSeeCosts } from '@/lib/perm';
import { PageHeader, Card, Table, Tabs, Empty } from '@/components/ui';
import { reportData, REPORTS, type Col } from '@/lib/reports';
import { dmy, dur, money, num, pct } from '@/lib/format';

export const metadata = { title: 'Reportes' };
const cell = (v: any, c: Col) => v == null || v === '' ? '—' : c.fmt === 'money' ? money(Math.round(v)) : c.fmt === 'pct' ? pct(v, 0) : c.fmt === 'num' ? num(v, 1) : c.fmt === 'h' ? `${num(v, 1)} h` : c.fmt === 'kg' ? `${num(v, 2)} kg` : c.fmt === 'date' ? dmy(v) : String(v);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ r?: string; from?: string; to?: string }> }) {
  const user = await pagePerm('reportes', 'V'); const sp = await searchParams; const kind = REPORTS[sp.r ?? ''] ? sp.r! : 'ventas'; const costs = canSeeCosts(user);
  const to = sp.to ? new Date(sp.to + 'T23:59:59') : new Date(); const from = sp.from ? new Date(sp.from) : new Date(Date.now() - 90 * 86400_000);
  const list = Object.entries(REPORTS).filter(([, v]) => costs || !v.costs);
  const d = await reportData(kind, { from, to }, costs, user.role === 'ventas' ? user.id : undefined);
  const q = `from=${from.toISOString().slice(0, 10)}&to=${to.toISOString().slice(0, 10)}`;
  const moneyCol = d.columns.find((c) => c.fmt === 'money' && ['revenue', 'amount', 'final', 'net'].includes(c.key)); const max = moneyCol ? Math.max(1, ...d.rows.map((r) => Math.abs(r[moneyCol.key] ?? 0))) : 0;
  return (
    <>
      <PageHeader title="Reportes" subtitle={user.role === 'ventas' ? 'Solo tus ventas.' : 'Filtra por fechas y exporta a CSV, Excel o PDF.'} />
      <Tabs current={kind} tabs={list.map(([k, v]) => ({ key: k, label: v.title, href: `/reportes?r=${k}&${q}` }))} />
      <form className="flex flex-wrap items-end gap-2 mb-4"><input type="hidden" name="r" value={kind} /><label className="block"><span className="label">Desde</span><input type="date" name="from" defaultValue={from.toISOString().slice(0, 10)} className="input" /></label><label className="block"><span className="label">Hasta</span><input type="date" name="to" defaultValue={to.toISOString().slice(0, 10)} className="input" /></label><button className="btn-ghost">Aplicar</button>
        <div className="ml-auto flex gap-2 no-print"><a className="btn-ghost" href={`/api/export/${kind}?fmt=csv&${q}`} data-testid="export-csv">CSV</a><a className="btn-ghost" href={`/api/export/${kind}?fmt=xlsx&${q}`} data-testid="export-xlsx">Excel</a><a className="btn-ghost" href="#" data-print="1">PDF (imprimir)</a></div></form>
      <Card title={d.title} actions={<span className="text-xs muted">{d.question}</span>} pad={false}>
        {d.rows.length === 0 ? <Empty title="Sin datos en este período" hint="Amplía el rango de fechas." /> : (
          <Table><thead><tr>{d.columns.map((c) => <th key={c.key} className={`th ${['money', 'pct', 'num', 'h', 'kg'].includes(c.fmt ?? '') ? 'text-right' : ''}`}>{c.label}</th>)}{moneyCol && <th className="th w-40" />}</tr></thead>
            <tbody data-testid="report-rows">{d.rows.map((r, i) => <tr key={i}>{d.columns.map((c) => <td key={c.key} className={`td ${['money', 'pct', 'num', 'h', 'kg'].includes(c.fmt ?? '') ? 'text-right tabular' : ''}`}>{cell(r[c.key], c)}</td>)}{moneyCol && <td className="td"><div className="h-2 rounded bg-brand-500/70" style={{ width: `${Math.max(2, (Math.abs(r[moneyCol.key] ?? 0) / max) * 100)}%` }} /></td>}</tr>)}</tbody></Table>)}
        {d.summary && <div className="p-3 text-sm border-t border-slate-200 dark:border-slate-700 flex flex-wrap gap-4">{d.summary.map((x) => <span key={x.label}><span className="muted">{x.label}: </span><b className="tabular">{/^\d+$/.test(x.value) ? money(+x.value) : x.value}</b></span>)}</div>}
      </Card>
      <script dangerouslySetInnerHTML={{ __html: "document.querySelectorAll('[data-print]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();window.print()}))" }} />
    </>
  );
}
