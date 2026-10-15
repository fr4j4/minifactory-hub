import Link from 'next/link';
import { getT } from '@/i18n/server';

export default async function NotFound() {
  const t = await getT();
  return (
    <main className="min-h-[60vh] flex items-center justify-center p-6">
      <div className="card p-6 max-w-lg text-center">
        <h1 className="h1 mb-2">{t('common.notFoundTitle')}</h1>
        <p className="muted text-sm mb-4">{t('common.notFoundBody')}</p>
        <Link href="/" className="btn-primary">{t('common.goHome')}</Link>
      </div>
    </main>
  );
}
