import Link from 'next/link';
import { cn } from '@/lib/format';
export { Badge, statusTone } from './badge';
export { StatusBadge, Tabs, Meter } from './ui-client';
import type { ReactNode } from 'react';
import { Icon } from '@/components/shell';

export function PageHeader({ title, subtitle, actions, back, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string }; eyebrow?: ReactNode }) {
  return (
    <div className="mb-5 md:mb-7">
      {back && <Link href={back.href} className="eyebrow hover:text-[var(--accent-ink)] inline-flex items-center gap-1.5 mb-2 min-h-[28px]"><Icon name="arrow-left" className="h-4 w-4" /> {back.label}</Link>}
      {!back && eyebrow && <div className="eyebrow mb-2 flex items-center gap-2"><span className="h-px w-6 bg-[var(--accent)]" aria-hidden />{eyebrow}</div>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0"><h1 className="h1 truncate pb-0.5">{title}</h1>{subtitle && <p className="muted text-sm mt-1.5 max-w-2xl">{subtitle}</p>}</div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cn('card min-w-0', className)}>
      {(title || actions) && <header className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-1"><h2 className="text-[13px] font-semibold tracking-tight flex items-center gap-2"><span className="h-3 w-[3px] rounded-full bg-[var(--accent)]" aria-hidden />{title}</h2>{actions}</header>}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-12 px-4">
      <div className="mx-auto mb-4 w-14 space-y-1 opacity-70" aria-hidden>{[40, 64, 88, 100].map((w) => <div key={w} className="h-1.5 rounded-full mx-auto bg-slate-300 dark:bg-slate-700" style={{ width: `${w}%` }} />)}</div>
      <p className="font-display text-lg font-semibold tracking-tight">{title}</p>{hint && <p className="muted text-sm mt-1 max-w-md mx-auto">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div className="rounded-xl border border-[var(--line)] bg-[var(--bg)]/40 p-3.5">
      <div className="eyebrow !text-[10px] !tracking-[.12em]">{label}</div>
      <div className={cn('num text-[1.55rem] leading-tight font-medium mt-1.5', tone === 'bad' && 'text-danger', tone === 'good' && 'text-ok', tone === 'warn' && 'text-amber-600 dark:text-amber-400')}>{value}</div>
      {sub && <div className="text-xs muted mt-0.5">{sub}</div>}
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return <label className={cn('block', className)}><span className="label">{label}</span>{children}{hint && <span className="text-xs muted mt-1 block">{hint}</span>}</label>;
}

/** `label` nombra la región desplazable para lectores de pantalla; sin él no se declara región. */
export function Table({ children, className, label }: { children: ReactNode; className?: string; label?: string }) {
  return <div className={cn('overflow-x-auto', className)} tabIndex={0} role={label ? 'region' : undefined} aria-label={label}><table className="w-full border-collapse">{children}</table></div>;
}

export function Swatch({ hex, className }: { hex: string; className?: string }) { return <span className={cn('inline-block h-3.5 w-3.5 rounded-full border border-black/20 align-[-2px]', className)} style={{ background: hex }} aria-hidden />; }
