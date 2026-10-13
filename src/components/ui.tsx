import Link from 'next/link';
import { cn } from '@/lib/format';
import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions, back, eyebrow }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string }; eyebrow?: ReactNode }) {
  return (
    <div className="mb-5 md:mb-7">
      {back && <Link href={back.href} className="eyebrow hover:text-[var(--accent-ink)] inline-flex items-center gap-1.5 mb-2 min-h-[28px]"><span aria-hidden>←</span> {back.label}</Link>}
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

const TONES: Record<string, string> = {
  gray: 'bg-slate-100/70 text-slate-700 border-slate-200 dark:bg-slate-800/60 dark:text-slate-200 dark:border-slate-700',
  blue: 'bg-sky-50 text-sky-800 border-sky-200 dark:bg-sky-950/50 dark:text-sky-200 dark:border-sky-900',
  green: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-200 dark:border-emerald-900',
  amber: 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950/50 dark:text-amber-200 dark:border-amber-900',
  red: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950/50 dark:text-red-200 dark:border-red-900',
  violet: 'bg-brand-50 text-brand-800 border-brand-200 dark:bg-brand-950/60 dark:text-brand-200 dark:border-brand-900',
};
export function Badge({ tone = 'gray', children, className }: { tone?: keyof typeof TONES; children: ReactNode; className?: string }) {
  return <span className={cn('badge', TONES[tone], className)}>{children}</span>;
}
export const statusTone = (st: string): keyof typeof TONES => ({
  recibido: 'blue', en_produccion: 'violet', post_proceso: 'amber', listo: 'green', entregado: 'gray', cancelado: 'red',
  borrador: 'gray', enviado: 'blue', aprobado: 'green', rechazado: 'red', vencido: 'amber', reemplazado: 'gray',
  en_cola: 'blue', imprimiendo: 'violet', pausado: 'amber', terminado: 'green', fallido: 'red',
  disponible: 'green', mantenimiento: 'amber', fuera_de_servicio: 'red', pausada: 'amber',
  registrada: 'blue', por_despachar: 'amber', despachada: 'violet', entregada: 'green', anulada: 'red',
  nueva: 'green', abierta: 'blue', en_uso: 'violet', agotada: 'red', descartada: 'gray',
  activo: 'green', descontinuado: 'gray', done: 'green', error: 'red', queued: 'gray', running: 'violet',
  pendiente: 'amber', parcial: 'blue', pagado: 'green',
} as Record<string, keyof typeof TONES>)[st] ?? 'gray';

export const STATUS_LABEL: Record<string, string> = {
  recibido: 'Recibido', en_produccion: 'En producción', post_proceso: 'Post-proceso', listo: 'Listo', entregado: 'Entregado', cancelado: 'Cancelado',
  borrador: 'Borrador', enviado: 'Enviado', aprobado: 'Aprobado', rechazado: 'Rechazado', vencido: 'Vencido', reemplazado: 'Reemplazado',
  en_cola: 'En cola', imprimiendo: 'Imprimiendo', pausado: 'Pausado', terminado: 'Terminado', fallido: 'Fallido',
  disponible: 'Disponible', mantenimiento: 'En mantenimiento', fuera_de_servicio: 'Fuera de servicio', pausada: 'Pausada',
  registrada: 'Registrada', por_despachar: 'Por despachar', despachada: 'Despachada', entregada: 'Entregada', anulada: 'Anulada',
  nueva: 'Nueva', abierta: 'Abierta', en_uso: 'En uso', agotada: 'Agotada', descartada: 'Descartada', activo: 'Activo', descontinuado: 'Descontinuado',
  done: 'Listo', error: 'Error', queued: 'En cola', running: 'Laminando', pendiente: 'Pendiente', parcial: 'Parcial', pagado: 'Pagado',
};
const LIVE = new Set(['imprimiendo', 'running', 'en_produccion', 'en_uso']);
export function StatusBadge({ status }: { status: string }) { return <Badge tone={statusTone(status)} className={cn('badge-led', LIVE.has(status) && 'before:animate-pulseDot')}>{STATUS_LABEL[status] ?? status}</Badge>; }

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
      <div className={cn('num text-[1.55rem] leading-tight font-medium mt-1.5', tone === 'bad' && 'text-red-600 dark:text-red-400', tone === 'good' && 'text-emerald-600 dark:text-emerald-400', tone === 'warn' && 'text-amber-600 dark:text-amber-400')}>{value}</div>
      {sub && <div className="text-xs muted mt-0.5">{sub}</div>}
    </div>
  );
}

export function Field({ label, children, hint, className }: { label: string; children: ReactNode; hint?: ReactNode; className?: string }) {
  return <label className={cn('block', className)}><span className="label">{label}</span>{children}{hint && <span className="text-xs muted mt-1 block">{hint}</span>}</label>;
}

export function Table({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('overflow-x-auto', className)}><table className="w-full border-collapse">{children}</table></div>;
}

export function Tabs({ tabs, current }: { tabs: Array<{ href: string; label: string; key: string; count?: number }>; current: string }) {
  return (
    <nav className="flex gap-1 overflow-x-auto mb-5 p-1 rounded-2xl border border-[var(--line)] bg-[var(--card)] w-fit max-w-full" aria-label="Secciones">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === current ? 'page' : undefined}
          className={cn('px-3.5 py-2 text-sm whitespace-nowrap rounded-xl min-h-[44px] md:min-h-[36px] flex items-center gap-1.5 transition-colors', t.key === current ? 'bg-[var(--panel)] text-[var(--panel-ink)] font-medium dark:bg-slate-700' : 'muted hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800')}>
          {t.label}{t.count != null && <span className={cn('num text-[11px] rounded-full px-1.5 min-w-5 text-center', t.key === current ? 'bg-[var(--accent)] text-[#17161a]' : 'bg-slate-200 dark:bg-slate-700')}>{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Meter({ value, max, tone }: { value: number; max: number; tone?: 'ok' | 'warn' | 'bad' }) {
  const p = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  // barra de capas: segmentos como capas impresas sobre un riel tenue
  return <div className="relative h-2.5 rounded-[3px] overflow-hidden text-slate-200 dark:text-slate-800" role="progressbar" aria-label="Nivel" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}><div className="absolute inset-0 layers" /><div className={cn('absolute inset-y-0 left-0 layers transition-[width] duration-700', tone === 'bad' ? 'text-red-500' : tone === 'warn' ? 'text-amber-500' : 'text-[var(--accent)]')} style={{ width: `${p}%` }} /></div>;
}

export function Swatch({ hex, className }: { hex: string; className?: string }) { return <span className={cn('inline-block h-3.5 w-3.5 rounded-full border border-black/20 align-[-2px]', className)} style={{ background: hex }} aria-hidden />; }
