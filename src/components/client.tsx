'use client';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { cn } from '@/lib/format';

/* ───────── Toasts ───────── */
type Toast = { id: number; msg: string; tone: 'ok' | 'err' | 'info' };
const ToastCtx = createContext<{ push: (msg: string, tone?: Toast['tone']) => void }>({ push: () => {} });
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((msg: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random(); setItems((x) => [...x, { id, msg, tone }]);
    setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), tone === 'err' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed z-[100] bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 flex flex-col gap-2 w-[min(92vw,420px)] pointer-events-none" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={cn('rounded-lg px-4 py-3 text-sm shadow-lg pointer-events-auto border', t.tone === 'err' ? 'bg-red-600 text-white border-red-700' : t.tone === 'info' ? 'bg-slate-800 text-white border-slate-700' : 'bg-emerald-600 text-white border-emerald-700')}>{t.msg}</div>)}
      </div>
    </ToastCtx.Provider>
  );
}

export type Res<T = unknown> = { ok: true; data: T } | { ok: false; error: string };

/** Ejecuta una acción de servidor, muestra errores y refresca la página al terminar. */
export function useAction() {
  const router = useRouter(); const toast = useToast(); const [pending, start] = useTransition();
  const run = useCallback(async <T,>(fn: () => Promise<Res<T>>, o: { ok?: string; refresh?: boolean; onOk?: (d: T) => void } = {}) => {
    return new Promise<Res<T>>((resolve) => {
      start(async () => {
        const r = await fn();
        if (r.ok) { if (o.ok) toast.push(o.ok); if (o.refresh !== false) router.refresh(); o.onOk?.(r.data); } else toast.push(r.error, 'err');
        resolve(r);
      });
    });
  }, [router, toast]);
  return { run, pending };
}

/* ───────── Modal ───────── */
export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    const prev = document.activeElement as HTMLElement | null;
    setTimeout(() => ref.current?.querySelector<HTMLElement>('input,select,textarea,button')?.focus(), 30);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = ''; prev?.focus?.(); };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end md:items-center justify-center bg-black/50 p-0 md:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} role="dialog" aria-modal="true" aria-label={title} className={cn('bg-[var(--card)] w-full rounded-t-2xl md:rounded-2xl shadow-2xl max-h-[92vh] overflow-y-auto border border-slate-200 dark:border-slate-700', wide ? 'md:max-w-3xl' : 'md:max-w-lg')}>
        <div className="sticky top-0 bg-inherit flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700 z-10">
          <h2 className="font-semibold">{title}</h2>
          <button onClick={onClose} aria-label="Cerrar" className="btn-ghost btn-sm !px-2.5">✕</button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function ConfirmButton({ children, onConfirm, message, className, disabled }: { children: ReactNode; onConfirm: () => void; message: string; className?: string; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className ?? 'btn-ghost'} disabled={disabled} onClick={() => setOpen(true)}>{children}</button>
      <Modal open={open} onClose={() => setOpen(false)} title="Confirmar">
        <p className="text-sm mb-4">{message}</p>
        <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>Cancelar</button><button className="btn-danger" onClick={() => { setOpen(false); onConfirm(); }}>Confirmar</button></div>
      </Modal>
    </>
  );
}

/** Botón que copia texto (mensajes de WhatsApp, enlaces). */
export function CopyButton({ text, label = 'Copiar', className }: { text: string; label?: string; className?: string }) {
  const toast = useToast();
  return <button type="button" className={className ?? 'btn-ghost btn-sm'} onClick={async () => { try { await navigator.clipboard.writeText(text); toast.push('Copiado al portapapeles'); } catch { toast.push('No se pudo copiar', 'err'); } }}>{label}</button>;
}

export function Autofocus() { return null; }

/** Selector con búsqueda sencilla (lista nativa + filtro). */
export function SearchSelect<T extends { id: string; label: string; sub?: string }>({ items, value, onChange, placeholder, allowEmpty = true, id }: { items: T[]; value: string | null; onChange: (id: string | null) => void; placeholder?: string; allowEmpty?: boolean; id?: string }) {
  return (
    <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {allowEmpty && <option value="">{placeholder ?? '— Seleccionar —'}</option>}
      {items.map((i) => <option key={i.id} value={i.id}>{i.label}{i.sub ? ` · ${i.sub}` : ''}</option>)}
    </select>
  );
}
