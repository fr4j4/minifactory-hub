'use client';
import { useEffect } from 'react';
import { useT } from '@/i18n/client';

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const t = useT();
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div role="alert" className="card p-6 max-w-lg mx-auto mt-10 text-center">
      <h1 className="h1 mb-2">{t('common.errorTitle')}</h1>
      <p className="muted text-sm mb-4">{t('common.errorBody')}</p>
      {error.digest && <p className="num text-xs muted mb-4">ref: {error.digest}</p>}
      <button className="btn-primary" onClick={reset}>{t('common.retry')}</button>
    </div>
  );
}
