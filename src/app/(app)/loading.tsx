import { getT } from '@/i18n/server';

/** Esqueleto mostrado mientras carga cualquier pantalla de la aplicación. */
export default async function Loading() {
  const t = await getT();
  return (
    <div role="status" aria-live="polite" aria-busy="true" className="animate-pulse space-y-5">
      <span className="sr-only">{t('common.loading')}</span>
      <div className="h-3 w-24 rounded bg-[var(--line)]" />
      <div className="h-8 w-64 max-w-full rounded bg-[var(--line)]" />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <div key={i} className="card h-28" />)}</div>
      <div className="card h-64" />
    </div>
  );
}
