import Link from 'next/link';
import { cn } from '@/lib/format';
export { Badge, statusTone } from './badge';
export { StatusBadge, Tabs, Meter } from './ui-client';
import { Meter } from './ui-client';
import type { ReactNode } from 'react';
import { Icon } from '@/components/shell';

export function PageHeader({ title, subtitle, actions, back, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string }; eyebrow?: ReactNode }) {
  return (
    <div className="mb-5 md:mb-7">
      {back && <Link href={back.href} className="eyebrow hover:text-[var(--accent-ink)] inline-flex items-center gap-1.5 mb-2 min-h-[28px]"><Icon name="arrow-left" className="h-4 w-4" /> {back.label}</Link>}
      {!back && eyebrow && <div className="eyebrow mb-2 flex items-center gap-2"><span className="h-px w-6 bg-[var(--accent)]" aria-hidden />{eyebrow}</div>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0"><h1 className="h1 md:truncate pb-0.5">{title}</h1>{subtitle && <p className="muted text-[13px] md:text-sm mt-1.5 max-w-2xl max-md:line-clamp-2">{subtitle}</p>}</div>
        {/* en móvil: una fila que se desplaza, con la acción principal primero */}
        {actions && <div className="flex items-center gap-2 max-md:w-[calc(100%+1.5rem)] max-md:flex-nowrap max-md:overflow-x-auto max-md:-mx-3 max-md:px-3 [scrollbar-width:none] md:flex-wrap max-md:[&>*]:shrink-0 max-md:[&>.btn-primary]:order-first">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cn('card min-w-0', className)}>
      {(title || actions) && <header className="flex items-center justify-between gap-2 px-4 pt-4 pb-1.5">{title ? <h2 className="font-display text-[15px] font-semibold tracking-[-.01em] flex items-center gap-2"><span className="h-3 w-[3px] rounded-full bg-[var(--accent)]" aria-hidden />{title}</h2> : <span />}{actions}</header>}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-10 px-4">
      {/* la capa de arriba es la que se está imprimiendo */}
      <div className="mx-auto mb-4 w-14 space-y-1" aria-hidden>{[40, 64, 88, 100].map((w) => <div key={w} className={cn('h-1.5 rounded-full mx-auto', w === 40 ? 'bg-[var(--accent)] opacity-80' : 'bg-slate-300 dark:bg-slate-700 opacity-70')} style={{ width: `${w}%` }} />)}</div>
      <p className="font-display text-lg font-semibold tracking-tight">{title}</p>{hint && <p className="muted text-sm mt-1 max-w-md mx-auto">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone, meter }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'warn'; meter?: { value: number; max: number } }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--card)] p-3 md:p-3.5">
      <div className="eyebrow !text-[10px] !tracking-[.12em] leading-tight min-h-[2lh] md:min-h-0">{label}</div>
      <div className={cn('num text-[1.3rem] md:text-[1.55rem] leading-tight font-medium mt-1.5', tone === 'bad' && 'text-danger', tone === 'good' && 'text-ok', tone === 'warn' && 'text-amber-600 dark:text-amber-400')}>{value}</div>
      {sub && <div className="text-xs muted mt-0.5">{sub}</div>}
      {meter && <div className="mt-2"><Meter value={meter.value} max={meter.max} /></div>}
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return <label className={cn('block', className)}><span className="label">{label}</span>{children}{hint && <span className="text-xs muted mt-1 block">{hint}</span>}</label>;
}

/** tabIndex permite desplazar con el teclado una tabla más ancha que la pantalla. */
export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('overflow-x-auto', className)} tabIndex={0}><table className="w-full border-collapse">{children}</table></div>;
}

export function Swatch({ hex, className }: { hex: string; className?: string }) { return <span className={cn('inline-block h-3.5 w-3.5 rounded-full border border-black/20 align-[-2px]', className)} style={{ background: hex }} aria-hidden />; }
