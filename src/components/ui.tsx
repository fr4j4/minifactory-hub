import Link from 'next/link';
import { cn } from '@/lib/format';
import type { ReactNode } from 'react';

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-4 md:mb-6">
      {back && <Link href={back.href} className="text-sm muted hover:underline inline-block mb-1">← {back.label}</Link>}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0"><h1 className="h1 truncate">{title}</h1>{subtitle && <p className="muted text-sm mt-0.5">{subtitle}</p>}</div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}

export function Card({ title, actions, children, className, pad = true }: { title?: ReactNode; actions?: ReactNode; children: ReactNode; className?: string; pad?: boolean }) {
  return (
    <section className={cn('card', className)}>
      {(title || actions) && <header className="flex items-center justify-between gap-2 px-4 pt-3.5 pb-1"><h2 className="text-sm font-semibold">{title}</h2>{actions}</header>}
      <div className={pad ? 'p-4' : ''}>{children}</div>
    </section>
  );
}

const TONES: Record<string, string> = {
  gray: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-200 dark:border-slate-700',
  blue: 'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800',
  green: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-200 dark:border-emerald-800',
  amber: 'bg-amber-50 text-amber-900 border-amber-200 dark:bg-amber-950 dark:text-amber-200 dark:border-amber-800',
  red: 'bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800',
  violet: 'bg-violet-50 text-violet-800 border-violet-200 dark:bg-violet-950 dark:text-violet-200 dark:border-violet-800',
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
export function StatusBadge({ status }: { status: string }) { return <Badge tone={statusTone(status)}>{STATUS_LABEL[status] ?? status}</Badge>; }

export function Empty({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="text-center py-12 px-4">
      <div className="mx-auto mb-3 h-12 w-12 rounded-full bg-slate-100 dark:bg-slate-800 grid place-items-center text-slate-400" aria-hidden>◌</div>
      <p className="font-medium">{title}</p>{hint && <p className="muted text-sm mt-1 max-w-md mx-auto">{hint}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Stat({ label, value, sub, tone }: { label: string; value: ReactNode; sub?: ReactNode; tone?: 'good' | 'bad' | 'warn' }) {
  return (
    <div className="card p-4">
      <div className="text-xs muted">{label}</div>
      <div className={cn('text-2xl font-semibold tabular mt-1', tone === 'bad' && 'text-red-600 dark:text-red-400', tone === 'good' && 'text-emerald-600 dark:text-emerald-400', tone === 'warn' && 'text-amber-600 dark:text-amber-400')}>{value}</div>
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
    <nav className="flex gap-1 overflow-x-auto border-b border-slate-200 dark:border-slate-700 mb-4" aria-label="Secciones">
      {tabs.map((t) => (
        <Link key={t.key} href={t.href} aria-current={t.key === current ? 'page' : undefined}
          className={cn('px-3 py-2.5 text-sm whitespace-nowrap border-b-2 -mb-px min-h-[44px] flex items-center gap-1.5', t.key === current ? 'border-brand-600 text-brand-700 dark:text-brand-300 font-medium' : 'border-transparent muted hover:text-slate-900 dark:hover:text-white')}>
          {t.label}{t.count != null && <span className="badge bg-slate-100 dark:bg-slate-800 border-transparent">{t.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Meter({ value, max, tone }: { value: number; max: number; tone?: 'ok' | 'warn' | 'bad' }) {
  const p = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  return <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden" role="progressbar" aria-label="Nivel" aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}><div className={cn('h-full rounded-full', tone === 'bad' ? 'bg-red-500' : tone === 'warn' ? 'bg-amber-500' : 'bg-brand-600')} style={{ width: `${p}%` }} /></div>;
}

export function Swatch({ hex, className }: { hex: string; className?: string }) { return <span className={cn('inline-block h-3.5 w-3.5 rounded-full border border-black/20 align-[-2px]', className)} style={{ background: hex }} aria-hidden />; }
