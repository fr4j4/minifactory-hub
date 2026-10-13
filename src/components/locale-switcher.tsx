'use client';
import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setLocaleAction } from '@/actions/locale';
import { LOCALES, LOCALE_NAMES } from '@/i18n/config';
import { useI18n } from '@/i18n/client';

export function LocaleSwitcher({ className }: { className?: string }) {
  const { locale, t } = useI18n(); const router = useRouter(); const [pending, start] = useTransition();
  return (
    <label className={className}>
      <span className="sr-only">{t('common.language')}</span>
      <select className="input !py-1 text-sm" value={locale} disabled={pending} onChange={(e) => start(async () => { await setLocaleAction(e.target.value); router.refresh(); })}>
        {LOCALES.map((l) => <option key={l} value={l} lang={l}>{LOCALE_NAMES[l]}</option>)}
      </select>
    </label>
  );
}
