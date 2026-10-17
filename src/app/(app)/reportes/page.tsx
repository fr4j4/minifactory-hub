import Link from 'next/link';
import { pagePerm } from '@/lib/auth';
import { PageHeader, Card, Table, Tabs, Empty, Stat, Meter } from '@/components/ui';
import { reportAllowed, reportData, reportRange, REPORTS, type Col } from '@/lib/reports';
import { getSettings } from '@/lib/settings';
import { dmy, dur, money, num, pct } from '@/lib/format';
import { getT } from '@/i18n/server';
import { DateInput } from '@/components/date-input';

export async function generateMetadata() { return { title: (await getT())('meta.reports') }; }
const cell = (v: any, c: Col) => v == null || v === '' ? '—' : c.fmt === 'money' ? money(Math.round(v)) : c.fmt === 'pct' ? pct(v, 0) : c.fmt === 'num' ? num(v, 1) : c.fmt === 'h' ? `${num(v, 1)} h` : c.fmt === 'kg' ? `${num(v, 2)} kg` : c.fmt === 'date' ? dmy(v) : String(v);

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ r?: string; from?: string; to?: string }> }) {
  const t = await getT();
  const user = await pagePerm('reportes', 'V'); const sp = await searchParams;
  await getSettings(); // fija la zona del taller antes de calcular el rango por defecto
  const { from, to } = reportRange(sp.from, sp.to, 90);
  const list = Object.entries(REPORTS).filter(([k]) => reportAllowed(user, k)); const kind = reportAllowed(user, sp.r ?? '') ? sp.r! : list[0][0];
  const d = await reportData(kind, { from, to }, user);
  const q = `from=${from}&to=${to}`;
  const moneyCol = d.columns.find((c) => c.fmt === 'money' && ['revenue', 'amount', 'final', 'net'].includes(c.key)); const max = moneyCol ? Math.max(1, ...d.rows.map((r) => Math.abs(r[moneyCol.key] ?? 0))) : 0;
  return (
    <>
      <PageHeader title={t('reports.reports')} subtitle={user.role === 'ventas' ? t('reports.onlyYourSales') : t('reports.filterByDateAndExport')} />
      <Tabs current={kind} tabs={list.map(([k, v]) => ({ key: k, label: t(v.title), href: `/reportes?r=${k}&${q}` }))} />
      <form className="max-sm:grid max-sm:grid-cols-2 flex flex-wrap items-end gap-2 mb-4"><input type="hidden" name="r" value={kind} /><label className="block"><span className="label">{t('reports.from')}</span><DateInput name="from" defaultValue={from} /></label><label className="block"><span className="label">{t('reports.toLabel')}</span><DateInput name="to" defaultValue={to} /></label><button className="btn-ghost max-sm:col-span-2">{t('reports.apply')}</button>
        <div className="sm:ml-auto max-sm:col-span-2 flex gap-2 no-print overflow-x-auto [scrollbar-width:none] [&>*]:shrink-0"><a className="btn-ghost" href={`/api/export/${kind}?fmt=csv&${q}`} data-testid="export-csv">{t('reports.csv')}</a><a className="btn-ghost" href={`/api/export/${kind}?fmt=xlsx&${q}`} data-testid="export-xlsx">{t('reports.excel')}</a><a className="btn-ghost" href="#" data-print="1">{t('reports.pdfPrint')}</a></div></form>
      {/* resumen arriba: la respuesta antes que el detalle */}
      {d.summary && <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4" data-testid="report-summary">{d.summary.map((x) => <Stat key={x.label} label={x.label} value={/^\d+$/.test(x.value) ? money(+x.value) : x.value} />)}</div>}
      <Card title={d.title} actions={<span className="text-xs muted">{d.question}</span>} pad={false}>
        {d.rows.length === 0 ? <Empty title={t('reports.noDataInThisPeriod')} hint={t('reports.widenTheDateRange')} /> : (
          <Table><thead><tr>{d.columns.map((c) => <th key={c.key} className={`th ${['money', 'pct', 'num', 'h', 'kg'].includes(c.fmt ?? '') ? 'text-right' : ''}`}>{c.label}</th>)}{moneyCol && <th className="th w-48" />}</tr></thead>
            <tbody data-testid="report-rows">{d.rows.map((r, i) => <tr key={i}>{d.columns.map((c) => <td key={c.key} className={`td ${['money', 'pct', 'num', 'h', 'kg'].includes(c.fmt ?? '') ? 'text-right tabular' : c.fmt === 'date' || c.key === 'month' ? 'tabular' : ''}`}>{cell(r[c.key], c)}</td>)}{moneyCol && <td className="td"><Meter value={Math.abs(r[moneyCol.key] ?? 0)} max={max} decorative /></td>}</tr>)}</tbody></Table>)}
      </Card>
      <script dangerouslySetInnerHTML={{ __html: "document.querySelectorAll('[data-print]').forEach(a=>a.addEventListener('click',e=>{e.preventDefault();window.print()}))" }} />
    </>
  );
}
