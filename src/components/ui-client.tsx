'use client';
import Link from 'next/link';
import { cn } from '@/lib/format';
import { useT } from '@/i18n/client';
import { Badge, statusTone } from './badge';

const LIVE = new Set(['imprimiendo', 'running', 'en_produccion', 'en_uso']);
const STATUS_KEYS = new Set(['recibido', 'en_produccion', 'post_proceso', 'listo', 'entregado', 'cancelado', 'borrador', 'enviado', 'aprobado', 'rechazado', 'vencido', 'reemplazado', 'en_cola', 'imprimiendo', 'pausado', 'terminado', 'fallido', 'disponible', 'mantenimiento', 'fuera_de_servicio', 'pausada', 'registrada', 'por_despachar', 'despachada', 'entregada', 'anulada', 'nueva', 'abierta', 'en_uso', 'agotada', 'descartada', 'activo', 'descontinuado', 'done', 'error', 'queued', 'running', 'pendiente', 'parcial', 'pagado']);
export function StatusBadge({ status }: { status: string }) {
  const t = useT();
  const label = STATUS_KEYS.has(status) ? t(`status.${status}` as 'status.listo') : status;
  return <Badge tone={statusTone(status)} className={cn('badge-led', LIVE.has(status) && 'before:animate-pulseDot')}>{label}</Badge>;
}

export function Tabs({ tabs, current }: { tabs: Array<{ href: string; label: string; key: string; count?: number }>; current: string }) {
  const t = useT();
  return (
    <nav className="flex gap-1 overflow-x-auto mb-5 p-1 rounded-2xl border border-[var(--line)] bg-[var(--card)] w-fit max-w-full" aria-label={t('common.sections')}>
      {tabs.map((tab) => (
        <Link key={tab.key} href={tab.href} aria-current={tab.key === current ? 'page' : undefined}
          className={cn('px-3.5 py-2 text-sm whitespace-nowrap rounded-xl min-h-[44px] md:min-h-[36px] flex items-center gap-1.5 transition-colors', tab.key === current ? 'bg-[var(--panel)] text-[var(--panel-ink)] font-medium dark:bg-slate-700' : 'muted hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800')}>
          {tab.label}{tab.count != null && <span className={cn('num text-[11px] rounded-full px-1.5 min-w-5 text-center', tab.key === current ? 'bg-[var(--accent)] text-[#17161a]' : 'bg-slate-200 dark:bg-slate-700')}>{tab.count}</span>}
        </Link>
      ))}
    </nav>
  );
}

export function Meter({ value, max, tone }: { value: number; max: number; tone?: 'ok' | 'warn' | 'bad' }) {
  const t = useT();
  const p = Math.max(0, Math.min(100, max > 0 ? (value / max) * 100 : 0));
  // barra de capas: segmentos como capas impresas sobre un riel tenue
  return <div className="relative h-2.5 rounded-[3px] overflow-hidden text-slate-200 dark:text-slate-800" role="progressbar" aria-label={t('common.level')} aria-valuenow={Math.round(p)} aria-valuemin={0} aria-valuemax={100}><div className="absolute inset-0 layers" /><div className={cn('absolute inset-y-0 left-0 layers transition-[width] duration-700', tone === 'bad' ? 'text-red-500' : tone === 'warn' ? 'text-amber-500' : 'text-[var(--accent)]')} style={{ width: `${p}%` }} /></div>;
}

