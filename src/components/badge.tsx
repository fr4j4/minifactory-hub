import { cn } from '@/lib/format';
import type { ReactNode } from 'react';

export const TONES: Record<string, string> = {
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
