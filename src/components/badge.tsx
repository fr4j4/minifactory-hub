import { cn } from '@/lib/format';
import type { ReactNode } from 'react';

export const TONES: Record<string, string> = {
  gray: 'bg-slate-100/70 text-slate-700 dark:bg-slate-800/60 dark:text-slate-200',
  blue: 'bg-sky-100/80 text-sky-800 dark:bg-sky-950/50 dark:text-sky-200',
  green: 'bg-emerald-100/80 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200',
  amber: 'bg-amber-100/80 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  red: 'bg-red-100/80 text-red-800 dark:bg-red-950/50 dark:text-red-200',
  violet: 'bg-[var(--accent-soft)] text-[var(--accent-ink)]',
};
export function Badge({ tone = 'gray', children, className }: { tone?: keyof typeof TONES; children: ReactNode; className?: string }) {
  return <span className={cn('badge border-transparent', TONES[tone], className)}>{children}</span>;
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
