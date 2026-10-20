import { Badge, Card, Table } from './ui';
import type { ProfileHealth } from '@/lib/slicer/performance';
import type { TFn, MessageKey } from '@/i18n/translate';
import { HEALTH } from '@/lib/slicer/performance';
import { rulesForCause } from '@/lib/ai/features/profile-advisor/kb';
import { PARAM_BY_KEY } from '@/lib/ai/features/profile-advisor/params';
import type { FailCode } from '@/lib/production/fail-causes';

const pct = (n: number | null, signed = false) => (n == null ? '—' : `${signed && n > 0 ? '+' : ''}${n.toFixed(0)} %`);

/** Ficha de desempeño (determinista, sin IA): se muestra siempre. */
export function ProfileHealthCard({ h, currentVersion, t }: { h: ProfileHealth; currentVersion: number; t: TFn }) {
  const rows = h.versions;
  const cur = rows.find((v) => v.version === currentVersion);
  // causa de falla más frecuente de la versión actual → reglas de la base de conocimiento (sin IA)
  const top = cur ? (Object.entries(cur.causes) as Array<[FailCode, number]>).sort((a, b) => b[1] - a[1])[0] : undefined;
  const tips = top && cur && cur.failed >= 2 ? rulesForCause(top[0]) : [];
  return (
    <Card title={t('advisor.perfTitle')} className="mt-6">
      <p className="text-xs muted mb-3">{t('advisor.perfIntro')}</p>
      {cur && cur.jobs >= HEALTH.minJobs && cur.successPct != null && cur.successPct < HEALTH.minSuccessPct && (
        <p className="text-sm rounded-lg border border-amber-300 bg-amber-50 text-amber-900 px-3 py-2 mb-3" role="status" data-testid="perf-degraded">
          {t('advisor.perfDegraded', { pct: Math.round(cur.successPct), jobs: cur.jobs, version: cur.version })}</p>
      )}
      {tips.length > 0 && top && (
        <div className="text-sm rounded-lg border border-[var(--line)] px-3 py-2 mb-3" data-testid="perf-tips">
          <div className="font-medium">{t('advisor.tipsTitle')}</div>
          <p className="text-xs muted">{t('advisor.tipsIntro', { cause: t(`queue.failCodes.${top[0]}` as MessageKey) })}</p>
          <ul className="list-disc pl-5 mt-1">{tips.flatMap((r) => r.moves).map((m) => <li key={m.key}>{t(m.dir === 'up' ? 'advisor.moveUp' : m.dir === 'down' ? 'advisor.moveDown' : 'advisor.moveSet')} <b>{PARAM_BY_KEY.get(m.key) ? t(PARAM_BY_KEY.get(m.key)!.label) : m.key}</b> {m.dir === 'set' ? m.value : m.step}</li>)}</ul>
        </div>
      )}
      {rows.length === 0 ? <p className="text-sm muted" data-testid="perf-empty">{t('advisor.perfEmpty')}</p> : (
        <Table>
          <thead><tr><th className="th">{t('advisor.perfVersion')}</th><th className="th">{t('advisor.perfJobs')}</th><th className="th">{t('advisor.perfSuccess')}</th><th className="th">{t('advisor.perfFailures')}</th><th className="th">{t('advisor.perfTime')}</th><th className="th">{t('advisor.perfGrams')}</th><th className="th">{t('advisor.perfCauses')}</th></tr></thead>
          <tbody data-testid="perf-rows">
            {rows.map((v) => (
              <tr key={v.version}>
                <td className="td num">v{v.version} {v.version === currentVersion && <Badge tone="blue">{t('advisor.perfCurrent')}</Badge>}</td>
                <td className="td num">{v.jobs}</td>
                <td className="td num">{pct(v.successPct)}</td>
                <td className="td num">{v.failed}</td>
                <td className="td num">{pct(v.timeDevPct, true)}</td>
                <td className="td num">{pct(v.gramsDevPct, true)}</td>
                <td className="td text-xs">{Object.entries(v.causes).map(([c, n]) => `${t(`queue.failCodes.${c}` as MessageKey)} ×${n}`).join(' · ') || '—'}</td>
              </tr>
            ))}
            {rows.length > 1 && <tr className="font-medium"><td className="td">{t('advisor.perfTotal')}</td><td className="td num">{h.total.jobs}</td><td className="td num">{pct(h.total.successPct)}</td><td className="td num">{h.total.failed}</td><td className="td num">{pct(h.total.timeDevPct, true)}</td><td className="td num">{pct(h.total.gramsDevPct, true)}</td><td className="td" /></tr>}
          </tbody>
        </Table>
      )}
    </Card>
  );
}
