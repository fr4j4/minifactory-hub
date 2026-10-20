import Link from 'next/link';
import { and, desc, eq, ilike, isNull, or, inArray } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can, canSeeCosts } from '@/lib/perm';
import { PageHeader, Card, Table, StatusBadge, Empty, Badge, Stat } from '@/components/ui';
import { Tabs } from '@/components/ui-client';
import { QuoteViews } from '@/components/quote-list';
import { quoteBoard, quoteThumbs } from '@/lib/services/quote-board';
import { fillTemplate } from '@/lib/messages';
import { getSettings } from '@/lib/settings';
import { dmy, money, num } from '@/lib/format';
import { getT } from '@/i18n/server';

export async function generateMetadata() { return { title: (await getT())('meta.quotes') }; }

const LIMIT = 150;
export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ q?: string; st?: string }> }) {
  const t = await getT();
  const user = await pagePerm('presupuestos', 'V'); const sp = await searchParams; const db = await getDb();
  const conds = [isNull(s.quotes.deletedAt)];
  if (sp.q) conds.push(or(ilike(s.quotes.number, `%${sp.q}%`), ilike(s.quotes.customerName, `%${sp.q}%`), ilike(s.quotes.title, `%${sp.q}%`))!);
  if (sp.st) conds.push(eq(s.quotes.status, sp.st)); else conds.push(inArray(s.quotes.status, ['borrador', 'enviado', 'aprobado', 'rechazado', 'vencido']));
  const rows = await db.select().from(s.quotes).where(and(...conds)).orderBy(desc(s.quotes.createdAt)).limit(LIMIT);
  const costs = canSeeCosts(user); const board = await quoteBoard(); const thumbs = await quoteThumbs(rows.map((r) => r.id)); const st = await getSettings();
  const qs = (status: string) => { const p = new URLSearchParams(); if (sp.q) p.set('q', sp.q); if (status) p.set('st', status); const x = p.toString(); return `/presupuestos${x ? `?${x}` : ''}`; };
  const STATUSES = ['borrador', 'enviado', 'aprobado', 'rechazado', 'vencido'];
  const active = STATUSES.reduce((a, k) => a + (board.counts[k] ?? 0), 0);
  const now = Date.now();
  const validity = (q: (typeof rows)[number]) => { if (q.status !== 'enviado' && q.status !== 'borrador') return null; if (!q.validUntil) return null; const d = Math.ceil((new Date(`${q.validUntil}T23:59:59`).getTime() - now) / 86400_000); return { d, tone: d < 0 ? 'red' : d <= 3 ? 'amber' : 'gray' } as const; };
  const sentAgo = (q: (typeof rows)[number]) => (q.status === 'enviado' ? Math.floor((now - q.updatedAt.getTime()) / 86400_000) : null);

  const list = (
    <ul className="space-y-2" data-testid="quote-rows">{rows.map((q) => {
      const m = (q.calc as any)?.totals?.marginPct; const v = validity(q); const ago = sentAgo(q); const ids = thumbs.get(q.id) ?? [];
      const wa = fillTemplate(st.templates.whatsappQuote, { cliente: q.customerName ?? '', numero: q.number, total: money(q.total), vigencia: dmy(q.validUntil) });
      return (
        <li key={q.id} className="card p-3 flex items-center gap-3 flex-wrap sm:flex-nowrap">
          <Link href={`/presupuestos/${q.id}`} className="flex items-center gap-3 min-w-0 flex-1 max-sm:basis-full min-h-[56px]">
            <div className="flex -space-x-3 shrink-0 w-14" aria-hidden>{ids.length ? ids.map((id) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={id} src={`/api/files/v/${id}/thumb`} alt="" className="h-10 w-10 rounded-lg object-cover border-2 border-[var(--card)] bg-[var(--bg)]" />) : <span className="h-10 w-10 rounded-lg bg-[var(--bg)] border border-[var(--line)] flex flex-col justify-center items-center gap-[3px] px-2">{[50, 70, 90].map((w) => <span key={w} className="block h-[3px] rounded-full bg-[var(--muted)] opacity-30" style={{ width: `${w}%` }} />)}</span>}</div>
            <div className="min-w-0"><div className="font-medium truncate">{q.number}{q.version > 1 && <span className="muted"> v{q.version}</span>} <span className="muted font-normal">· {q.customerName ?? t('common.noCustomer')}</span></div><div className="text-xs muted truncate">{q.title ?? '—'}</div></div>
          </Link>
          <div className="flex items-center gap-2 text-xs shrink-0">
            {v && <Badge tone={v.tone}>{v.d < 0 ? t('quotes.expiredAgo', { n: -v.d }) : v.d === 0 ? t('quotes.expiresToday') : t('quotes.expiresIn', { n: v.d })}</Badge>}
            {ago != null && ago >= 1 && <span className="muted">{t('quotes.sentAgo', { n: ago })}</span>}
          </div>
          <div className="text-right shrink-0 ml-auto"><div className="tabular font-semibold">{money(q.total)}</div>{costs && m != null && <div className="text-xs muted">{t('common.margin')} {num(m, 0)}%</div>}</div>
          <StatusBadge status={q.status} />
          <div className="row-actions flex gap-1.5 shrink-0"><a className="btn-ghost btn-sm" href={`/api/quotes/${q.id}/pdf`} aria-label={`PDF ${q.number}`}>PDF</a>{q.customerPhone && <a className="btn-ghost btn-sm" target="_blank" rel="noopener noreferrer" href={`https://wa.me/${q.customerPhone.replace(/\D/g, '')}?text=${encodeURIComponent(wa)}`}>WhatsApp</a>}</div>
        </li>);
    })}</ul>
  );
  const kanban = (
    <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-5 items-start" data-testid="quotes-kanban">
      {STATUSES.map((k) => { const col = rows.filter((q) => q.status === k); return (
        <section key={k} aria-label={t(`status.${k}` as 'status.borrador')} className="card p-2.5 space-y-2 bg-[var(--bg)]">
          <h3 className="flex items-center justify-between text-sm font-semibold px-1"><span>{t(`status.${k}` as 'status.borrador')}</span><span className="muted tabular font-normal">{col.length} · {money(col.reduce((a, q) => a + q.total, 0))}</span></h3>
          {col.length === 0 ? <p className="text-xs muted px-1 py-3">{t('quotes.kanbanEmpty')}</p> : col.map((q) => { const v = validity(q); return (
            <Link key={q.id} href={`/presupuestos/${q.id}`} className="card p-2.5 block hover:border-[var(--accent)] min-h-[44px]" data-testid="quote-card">
              <div className="flex items-center justify-between gap-2 text-sm"><span className="font-medium truncate">{q.number}{q.version > 1 && <span className="muted"> v{q.version}</span>}</span><span className="tabular font-semibold">{money(q.total)}</span></div>
              <div className="text-xs muted truncate">{q.customerName ?? t('common.noCustomer')}{q.title ? ` · ${q.title}` : ''}</div>
              {v && <div className="mt-1"><Badge tone={v.tone}>{v.d < 0 ? t('quotes.expiredAgo', { n: -v.d }) : v.d === 0 ? t('quotes.expiresToday') : t('quotes.expiresIn', { n: v.d })}</Badge></div>}
            </Link>); })}
        </section>); })}
    </div>
  );
  const table = (
    <Card pad={false}><Table><thead><tr><th className="th">{t('common.noLabel')}</th><th className="th">{t('common.customer')}</th><th className="th">{t('quotes.title')}</th><th className="th text-right">{t('common.suggested')}</th><th className="th text-right">{t('common.total')}</th>{costs && <th className="th text-right">{t('common.margin')}</th>}<th className="th">{t('quotes.validUntil')}</th><th className="th">{t('common.status')}</th></tr></thead>
      <tbody>{rows.map((q) => { const m = (q.calc as any)?.totals?.marginPct; const diff = q.suggestedTotal ? ((q.total - q.suggestedTotal) / q.suggestedTotal) * 100 : 0; return (
        <tr key={q.id}><td className="td font-medium"><Link className="num hover:underline" href={`/presupuestos/${q.id}`}>{q.number}{q.version > 1 && <span className="muted"> v{q.version}</span>}</Link></td><td className="td">{q.customerName ?? '—'}</td><td className="td">{q.title ?? '—'}</td><td className="td text-right tabular muted">{money(q.suggestedTotal)}</td><td className="td text-right tabular font-medium">{money(q.total)} {Math.abs(diff) >= 1 && <span className={`text-xs ${diff < 0 ? 'text-amber-600' : 'text-blue-600'}`}>{diff > 0 ? '+' : ''}{num(diff, 0)}%</span>}</td>{costs && <td className="td text-right tabular">{m != null ? `${num(m, 0)}%` : '—'}</td>}<td className="td tabular">{dmy(q.validUntil)}</td><td className="td"><StatusBadge status={q.status} /></td></tr>); })}</tbody></Table></Card>
  );
  return (
    <>
      <PageHeader title={t('common.quotes')} subtitle={t('quotes.quoteSeveralModelsPerQuote')} actions={can(user, 'presupuestos', 'C') && <><Link href="/calculadora" className="btn-ghost">{t('quotes.quickCalculator')}</Link><Link href="/presupuestos/nuevo" className="btn-primary" data-testid="new-quote">{t('quotes.newQuote')}</Link></>} />
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-5 max-lg:[&>*:last-child:nth-child(odd)]:col-span-2" data-testid="quote-kpis">
        <Stat label={t('quotes.kpiOpen')} value={board.openCount} sub={money(board.openAmount)} />
        <Stat label={t('quotes.kpiDueSoon')} value={board.dueSoon} tone={board.dueSoon ? 'warn' : undefined} />
        <Stat label={t('quotes.kpiNoReply')} value={board.noReply} tone={board.noReply ? 'warn' : undefined} />
        <Stat label={t('quotes.kpiConversion')} value={board.conversionPct == null ? '—' : `${board.conversionPct}%`} />
        <Stat label={t('quotes.kpiApprovedMonth')} value={money(board.approvedMonth)} tone="good" />
      </div>
      <Tabs current={sp.st ?? ''} tabs={[{ key: '', href: qs(''), label: t('quotes.active'), count: active }, ...STATUSES.map((k) => ({ key: k, href: qs(k), label: t(`status.${k}` as 'status.borrador'), count: board.counts[k] ?? 0 }))]} />
      <form className="filter-bar flex flex-wrap gap-2 mb-4" role="search"><input name="q" defaultValue={sp.q} className="input sm:max-w-xs" placeholder={t('quotes.searchByNumberCustomerOr')} aria-label={t('quotes.searchQuotes')} />{sp.st && <input type="hidden" name="st" value={sp.st} />}<button className="btn-ghost">{t('common.filter')}</button></form>
      {rows.length === LIMIT && <p className="text-xs muted mb-3" role="status">{t('common.listCapped', { n: LIMIT })}</p>}
      {rows.length === 0 ? (sp.q || sp.st ? <Card><Empty title={t('common.noMatches')} action={<Link className="btn-ghost" href="/presupuestos">{t('common.clearFilters')}</Link>} /></Card> : <Card><Empty title={t('quotes.thereAreNoQuotes')} hint={t('quotes.createTheFirstOneUpload')} action={<Link className="btn-primary" href="/presupuestos/nuevo">{t('common.newQuote')}</Link>} /></Card>) : <QuoteViews list={list} table={table} kanban={kanban} />}
    </>
  );
}
