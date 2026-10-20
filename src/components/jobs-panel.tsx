'use client';
import { retryJobAction } from '@/actions/jobs';
import { useAction } from './client';
import { useT } from '@/i18n/client';

export interface JobRow { id: string; kind: string; status: string; attempts: number; error: string | null; when: string }

/** Cola de procesos en segundo plano: cuántos hay en espera/ejecución y los que fallaron, con reintento. */
export function JobsPanel({ summary, failed }: { summary: { queued: number; running: number; error: number }; failed: JobRow[] }) {
  const t = useT(); const { run, pending } = useAction();
  return (
    <div className="mt-4 pt-3 border-t border-[var(--line)]" data-testid="jobs-panel">
      <h3 className="font-medium text-sm mb-1">{t('settings.jobsTitle')}</h3>
      <p className="muted text-xs mb-2" data-testid="jobs-summary">{t('settings.jobsSummary', { queued: summary.queued, running: summary.running, error: summary.error })}</p>
      {failed.length > 0 && <ul className="divide-y divide-[var(--line)]">{failed.map((j) => (
        <li key={j.id} className="py-2 flex items-center justify-between gap-3 text-sm"><span>{t(`settings.jobKind_${j.kind}` as 'settings.jobKind_file.process')} · {j.when}<span className="muted block text-xs break-all">{j.error}</span></span>
          <button className="btn-ghost btn-sm" disabled={pending} onClick={() => run(() => retryJobAction(j.id), { ok: t('settings.jobRetried') })} data-testid="job-retry">{t('settings.jobRetry')}</button></li>
      ))}</ul>}
    </div>
  );
}
