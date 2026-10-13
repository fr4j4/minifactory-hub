import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { Mark } from '@/components/shell';
import { LoginForm } from './form';
import { getT } from '@/i18n/server';
import { LocaleSwitcher } from '@/components/locale-switcher';

export const dynamic = 'force-dynamic';
export async function generateMetadata() { return { title: (await getT())('auth.submit') }; }

// perfil de un jarrón: ancho de cada capa (de abajo hacia arriba)
const LAYERS = Array.from({ length: 30 }, (_, i) => { const t = i / 29; return 52 + 30 * Math.sin(t * Math.PI * 1.15 + 0.35) - 14 * t; });

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect('/');
  const t = await getT();
  const { next } = await searchParams;
  return (
    <main className="min-h-screen grid lg:grid-cols-[1.1fr_1fr]">
      {/* escena: una pieza imprimiéndose capa a capa en la cama */}
      <section aria-hidden className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-[var(--panel)] text-[var(--panel-ink)] p-10">
        <div className="absolute inset-0 opacity-60" style={{ backgroundImage: 'radial-gradient(rgba(255,255,255,.07) 1px, transparent 1.2px)', backgroundSize: '20px 20px' }} />
        <div className="absolute left-1/2 top-[55%] -translate-x-1/2 -translate-y-1/2 h-[420px] w-[420px] rounded-full bg-[var(--accent)] opacity-[.13] blur-[90px]" />
        <div className="relative flex items-center gap-3"><Mark className="h-10 w-10" /><span className="font-display text-xl font-semibold tracking-tight">MiniFactory</span></div>
        <div className="relative mx-auto w-[300px]">
          <div className="relative h-[290px] flex flex-col-reverse items-center gap-[3px] login-print">
            {LAYERS.map((w, i) => <span key={i} className="block h-[6.5px] rounded-[3px]" style={{ width: `${w}%`, background: `linear-gradient(90deg, #c13d0b, #ff5b1f ${30 + (i % 3) * 8}%, #ff9e6c 55%, #ff5b1f 80%, #9c310a)` }} />)}
          </div>
          <div className="absolute inset-x-0 bottom-0 h-[290px] login-climb pointer-events-none">
            <div className="absolute bottom-0 left-1/2 -ml-[11px] login-nozzle"><div className="h-4 w-[22px] rounded-t-[3px] bg-[#e9e5dc]" /><div className="mx-auto h-0 w-0 border-x-[6px] border-x-transparent border-t-[7px] border-t-[#e9e5dc]" /><div className="mx-auto mt-0.5 h-1.5 w-1.5 rounded-full bg-[var(--accent)] shadow-[0_0_10px_3px_rgba(255,91,31,.8)]" /></div>
          </div>
          <div className="mt-2 h-3 rounded-md bg-gradient-to-b from-[#3a3935] to-[#22211f] border-t border-white/15" />
          <div className="mt-1 h-px bg-white/10" />
        </div>
        <div className="relative max-w-md">
          <p className="font-display text-[2.6rem] leading-[1.02] font-semibold tracking-[-.03em]">{t('auth.heroLine1')}<br /><span className="text-[var(--accent)]">{t('auth.heroLine2')}</span></p>
          <p className="mt-4 text-sm text-white/70 max-w-sm">{t('auth.heroText')}</p>
        </div>
      </section>
      <section className="flex items-center justify-center p-5 sm:p-10">
        <div className="w-full max-w-sm">
          <div className="flex justify-end mb-4"><LocaleSwitcher /></div>
          <div className="flex items-center gap-3 mb-10 lg:hidden"><Mark className="h-10 w-10" /><span className="font-display text-xl font-semibold tracking-tight">MiniFactory</span></div>
          <div className="eyebrow mb-3 flex items-center gap-2"><span className="h-px w-6 bg-[var(--accent)]" />{t('auth.eyebrow')}</div>
          <h1 className="h1 mb-2">{t('auth.greeting')}</h1>
          <p className="muted text-sm mb-7">{t('auth.intro')}</p>
          <LoginForm next={next} demo={process.env.DEMO_HINT === '1'} />
        </div>
      </section>
    </main>
  );
}
