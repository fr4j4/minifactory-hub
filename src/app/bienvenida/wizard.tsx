'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { checkTokenAction, createAccountAction, finishSetupAction, saveSetupStepAction, skipSetupStepAction } from '@/actions/setup';
import { useT } from '@/i18n/client';
import type { SetupStep } from '@/lib/setup';

const TZ = ['America/Santiago', 'America/Argentina/Buenos_Aires', 'America/Lima', 'America/Bogota', 'America/Mexico_City', 'Europe/Madrid', 'UTC'];
const strength = (p: string) => { let n = 0; if (p.length >= 10) n++; if (p.length >= 14) n++; if (/[A-Z]/.test(p) && /\d/.test(p)) n++; if (/[^A-Za-z0-9]/.test(p)) n++; return Math.min(2, n >= 4 ? 2 : n >= 2 ? 1 : 0); };

export function CreateAccountWizard() {
  const t = useT(); const router = useRouter();
  const [step, setStep] = useState(0); const [err, setErr] = useState(''); const [pending, start] = useTransition();
  const [v, setV] = useState({ token: '', lang: 'es-CL', currency: 'CLP', timezone: 'America/Santiago', name: '', email: '', password: '', shopName: '' });
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((o) => ({ ...o, [k]: e.target.value }));
  const labels = [t('setup.step0'), t('setup.step1'), t('setup.step2'), t('setup.step3')];
  const next = () => {
    setErr('');
    if (step === 0) return start(async () => { const r = await checkTokenAction(v.token); if (r.error) setErr(r.error); else setStep(1); });
    if (step === 2 && v.password.length < 10) return setErr(t('setup.weakPassword'));
    if (step === 3) return start(async () => { const r = await createAccountAction(v); if (r.error) setErr(r.error); else router.refresh(); });
    setStep(step + 1);
  };
  const st = strength(v.password);
  return (
    <form onSubmit={(e) => { e.preventDefault(); next(); }} className="space-y-5">
      <ol className="flex gap-1.5" aria-label="progreso">{labels.map((l, i) => <li key={i} aria-current={i === step ? 'step' : undefined} className={`flex-1 h-1.5 rounded-full ${i <= step ? 'bg-[var(--accent)]' : 'bg-[var(--line)]'}`} title={l} />)}</ol>
      <h2 className="text-lg font-semibold">{labels[step]}</h2>
      {step === 0 && <><p className="muted text-sm">{t('setup.step0Hint')}</p><label className="block"><span className="label">{t('setup.token')}</span><input className="input font-mono tracking-widest uppercase" autoFocus autoComplete="off" required value={v.token} onChange={set('token')} /></label></>}
      {step === 1 && <div className="grid gap-4 sm:grid-cols-3">
        <label className="block"><span className="label">{t('setup.language')}</span><select className="input" value={v.lang} onChange={set('lang')}><option value="es-CL">Español</option><option value="en-US">English</option></select></label>
        <label className="block"><span className="label">{t('setup.currency')}</span><select className="input" value={v.currency} onChange={set('currency')}><option>CLP</option><option>USD</option><option>EUR</option></select></label>
        <label className="block"><span className="label">{t('setup.timezone')}</span><select className="input" value={v.timezone} onChange={set('timezone')}>{TZ.map((z) => <option key={z}>{z}</option>)}</select></label></div>}
      {step === 2 && <div className="space-y-4">
        <label className="block"><span className="label">{t('setup.yourName')}</span><input className="input" required autoFocus autoComplete="name" value={v.name} onChange={set('name')} /></label>
        <label className="block"><span className="label">{t('setup.email')}</span><input type="email" className="input" required autoComplete="username" value={v.email} onChange={set('email')} /></label>
        <label className="block"><span className="label">{t('setup.password')}</span><input type="password" className="input" required minLength={10} autoComplete="new-password" value={v.password} onChange={set('password')} /><span className="muted text-xs">{t('setup.passwordHint')} {v.password && t('setup.strength', { level: t(`setup.strength${st}` as 'setup.strength0') })}</span></label></div>}
      {step === 3 && <label className="block"><span className="label">{t('setup.shopName')}</span><input className="input" required autoFocus value={v.shopName} onChange={set('shopName')} /></label>}
      {err && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <div className="flex justify-between">
        {step > 0 && step < 4 ? <button type="button" className="btn" onClick={() => setStep(step - 1)}>{t('setup.back')}</button> : <span />}
        <button className="btn-primary" disabled={pending}>{step === 3 ? (pending ? t('setup.creating') : t('setup.create')) : step === 0 ? t('setup.verify') : t('setup.next')}</button>
      </div>
    </form>
  );
}

interface StepRow { id: SetupStep; state: string; href: string | null }
export function StepsPanel({ steps, shop }: { steps: StepRow[]; shop: { legalName: string; taxId: string; address: string; phone: string; email: string; brandColor: string } }) {
  const t = useT(); const router = useRouter(); const [pending, start] = useTransition();
  const [open, setOpen] = useState<SetupStep | null>(null); const [err, setErr] = useState('');
  const [f, setF] = useState({ ...shop });
  const run = (fn: () => Promise<{ error?: string }>) => start(async () => { const r = await fn(); if (r.error) setErr(r.error); else { setErr(''); setOpen(null); router.refresh(); } });
  const badge = (s: string) => s === 'hecho' ? t('setup.done') : s === 'omitido' ? t('setup.skipped') : t('setup.pending');
  return (
    <div className="space-y-4">
      <div><h2 className="text-lg font-semibold">{t('setup.stepsTitle')}</h2><p className="muted text-sm">{t('setup.stepsIntro')}</p></div>
      <ul className="divide-y divide-[var(--line)] card">
        {steps.map((s) => (
          <li key={s.id} className="p-3">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0"><div className="font-medium">{t(`setup.${s.id}` as 'setup.fiscal')}</div><div className="muted text-xs">{badge(s.state)}</div></div>
              <div className="flex gap-2 shrink-0">
                {s.href ? <Link href={s.href} className="btn" target="_blank">{t('setup.open')}</Link> : <button className="btn" onClick={() => setOpen(open === s.id ? null : s.id)}>{t('setup.save')}…</button>}
                {s.href && s.state !== 'hecho' && <button className="btn" disabled={pending} onClick={() => run(() => saveSetupStepAction(s.id, {}))}>{t('setup.markDone')}</button>}
                {s.state === 'pendiente' && <button className="btn" disabled={pending} onClick={() => run(() => skipSetupStepAction(s.id))}>{t('setup.skip')}</button>}
              </div>
            </div>
            {open === s.id && s.id === 'fiscal' && (
              <form className="mt-3 grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); run(() => saveSetupStepAction('fiscal', { legalName: f.legalName, taxId: f.taxId, address: f.address, phone: f.phone, email: f.email })); }}>
                {(['legalName', 'taxId', 'address', 'phone', 'email'] as const).map((k) => <label key={k} className="block"><span className="label">{t(`setup.${k === 'email' ? 'contactEmail' : k}` as 'setup.legalName')}</span><input className="input" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>)}
                <div className="sm:col-span-2"><button className="btn-primary" disabled={pending}>{t('setup.save')}</button></div>
              </form>)}
            {open === s.id && s.id === 'brand' && (
              <form className="mt-3 flex items-end gap-3" onSubmit={(e) => { e.preventDefault(); run(() => saveSetupStepAction('brand', { brandColor: f.brandColor })); }}>
                <label className="block"><span className="label">{t('setup.brandColor')}</span><input type="color" className="h-10 w-20 rounded" value={f.brandColor} onChange={(e) => setF({ ...f, brandColor: e.target.value })} /></label>
                <button className="btn-primary" disabled={pending}>{t('setup.save')}</button>
              </form>)}
          </li>))}
      </ul>
      {err && <p role="alert" className="text-sm text-red-600 dark:text-red-400">{err}</p>}
      <form action={finishSetupAction} className="flex justify-end"><button className="btn-primary">{t('setup.finish')}</button></form>
    </div>
  );
}
