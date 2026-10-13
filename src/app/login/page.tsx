import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { LoginForm } from './form';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Ingresar' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (await getSession()) redirect('/');
  const { next } = await searchParams;
  return (
    <main className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center gap-3 mb-6 justify-center">
          <img src="/icon.svg" alt="" width={44} height={44} className="rounded-xl" />
          <div><div className="text-xl font-semibold leading-tight">MiniFactory</div><div className="text-sm muted">Gestión de tu taller de impresión 3D</div></div>
        </div>
        <LoginForm next={next} demo={process.env.DEMO_HINT === '1'} />
      </div>
    </main>
  );
}
