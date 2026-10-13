'use client';
import { useActionState } from 'react';
import { loginAction } from '@/actions/auth';

export function LoginForm({ next, demo }: { next?: string; demo?: boolean }) {
  const [state, action, pending] = useActionState(loginAction, undefined);
  return (
    <form action={action} className="card p-5 space-y-4">
      <input type="hidden" name="next" value={next ?? '/'} />
      <label className="block"><span className="label">Correo</span><input name="email" type="email" required autoComplete="username" className="input" defaultValue={demo ? 'admin@minifactory.cl' : ''} autoFocus /></label>
      <label className="block"><span className="label">Contraseña</span><input name="password" type="password" required autoComplete="current-password" className="input" defaultValue={demo ? 'admin1234' : ''} /></label>
      {state?.error && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{state.error}</p>}
      <button className="btn-primary w-full" disabled={pending}>{pending ? 'Ingresando…' : 'Ingresar'}</button>
    </form>
  );
}
