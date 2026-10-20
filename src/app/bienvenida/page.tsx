import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { hasUsers, needsSetup, SETUP_LINKS, SETUP_STEPS } from '@/lib/setup';
import { getSettings } from '@/lib/settings';
import { getT } from '@/i18n/server';
import { LocaleSwitcher } from '@/components/locale-switcher';
import { Mark } from '@/components/shell';
import { CreateAccountWizard, StepsPanel } from './wizard';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: (await getT())('setup.meta') }; }

export default async function Welcome() {
  const t = await getT();
  if (!(await needsSetup())) redirect(await getSession() ? '/' : '/login');
  const phaseA = !(await hasUsers());
  const user = phaseA ? null : await getSession();
  if (!phaseA && (!user || user.role !== 'admin')) redirect('/login');
  const st = await getSettings();
  return (
    <main className="min-h-screen flex items-start justify-center p-5 sm:p-10">
      <div className="w-full max-w-xl">
        <div className="flex items-center justify-between mb-8"><div className="flex items-center gap-3"><Mark className="h-10 w-10" /><span className="font-display text-xl font-semibold tracking-tight">MiniFactory</span></div><LocaleSwitcher /></div>
        <div className="eyebrow mb-3 flex items-center gap-2"><span className="h-px w-6 bg-[var(--accent)]" />{t('setup.eyebrow')}</div>
        <h1 className="h1 mb-2">{t('setup.title')}</h1>
        <p className="muted text-sm mb-7">{t('setup.intro')}</p>
        {phaseA
          ? <CreateAccountWizard />
          : <StepsPanel mode={st.setup.mode ?? null} steps={SETUP_STEPS.map((id) => ({ id, state: st.setup.steps[id] ?? 'pendiente', href: (SETUP_LINKS as Record<string, string>)[id] ?? null }))} shop={{ legalName: st.shop.legalName, taxId: st.shop.taxId, address: st.shop.address, phone: st.shop.phone, email: st.shop.email, brandColor: st.shop.brandColor }} />}
      </div>
    </main>
  );
}
