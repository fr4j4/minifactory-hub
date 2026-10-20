'use client';
import { useActionState } from 'react';
import { loginAction } from '@/actions/auth';
import { useT } from '@/i18n/client';

export function LoginForm({ next, demo }: { next?: string; demo?: boolean }) {
  const [state, action, pending] = useActionState(loginAction, undefined); const t = useT();
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? '/'} />
      <label className="block"><span className="label">{t('auth.email')}</span><input name="email" type="email" required autoComplete="username" className="input" defaultValue={demo ? 'admin@minifactory.cl' : ''} autoFocus /></label>
      <label className="block"><span className="label">{t('auth.password')}</span><input name="password" type="password" required autoComplete="current-password" className="input" defaultValue={demo ? 'admin1234' : ''} /></label>
      {state?.error && <p role="alert" className="text-sm text-danger">{state.error}</p>}
      <button className="btn-primary w-full !min-h-[48px] !text-[15px] mt-2" disabled={pending}>{pending ? t('auth.submitting') : t('auth.submit')}</button>
    </form>
  );
}
