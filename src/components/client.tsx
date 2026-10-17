'use client';
import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { cn } from '@/lib/format';
import { useT } from '@/i18n/client';
import { ModalDialog } from './ui/kit';

/* ───────── Toasts ───────── */
type Toast = { id: number; msg: string; tone: 'ok' | 'err' | 'info'; leaving?: boolean };
const ToastCtx = createContext<{ push: (msg: string, tone?: Toast['tone']) => void }>({ push: () => {} });
export const useToast = () => useContext(ToastCtx);
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);
  const push = useCallback((msg: string, tone: Toast['tone'] = 'ok') => {
    const id = Date.now() + Math.random(); setItems((x) => [...x, { id, msg, tone }]);
    // primero se desvanece y se pliega (150 ms), después se quita: así los de arriba bajan sin salto
    setTimeout(() => { setItems((x) => x.map((t) => (t.id === id ? { ...t, leaving: true } : t))); setTimeout(() => setItems((x) => x.filter((t) => t.id !== id)), 150); }, tone === 'err' ? 7000 : 3500);
  }, []);
  return (
    <ToastCtx.Provider value={{ push }}>
      {children}
      <div className="fixed z-[100] bottom-20 md:bottom-6 left-1/2 -translate-x-1/2 flex flex-col w-[min(92vw,420px)] pointer-events-none" role="status" aria-live="polite">
        {items.map((t) => <div key={t.id} className={cn('grid transition-[grid-template-rows,opacity] duration-150 ease-in', t.leaving ? 'grid-rows-[0fr] opacity-0' : 'grid-rows-[1fr] animate-rise')}><div className="min-h-0"><div className={cn('mt-2 rounded-lg px-4 py-3 text-sm shadow-lg pointer-events-auto border', t.tone === 'err' ? 'bg-red-600 text-white border-red-700' : t.tone === 'info' ? 'bg-slate-800 text-white border-slate-700' : 'bg-emerald-600 text-white border-emerald-700')}>{t.msg}</div></div></div>)}
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
/** Devuelve `v` y, cuando pasa a vacío, sigue devolviendo el último valor `ms` más: así un diálogo montado con `{x && …}` alcanza a animar su salida. */
export function useLinger<T>(v: T, ms = 160): T {
  const [shown, setShown] = useState(v);
  useEffect(() => { if (v) { setShown(v); return; } const id = setTimeout(() => setShown(v), ms); return () => clearTimeout(id); }, [v, ms]);
  return v || shown;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: ReactNode; wide?: boolean }) {
  const t = useT();
  return <ModalDialog open={open} onClose={onClose} title={title} wide={wide} closeLabel={t('common.close')}>{children}</ModalDialog>;
}

export function ConfirmButton({ children, onConfirm, message, className, disabled }: { children: ReactNode; onConfirm: () => void; message: string; className?: string; disabled?: boolean }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className={className ?? 'btn-ghost'} disabled={disabled} onClick={() => setOpen(true)}>{children}</button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('common.confirm')}>
        <p className="text-sm mb-4">{message}</p>
        <div className="flex justify-end gap-2"><button className="btn-ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</button><button className="btn-danger" onClick={() => { setOpen(false); onConfirm(); }}>{t('common.confirm')}</button></div>
      </Modal>
    </>
  );
}

/** Copia al portapapeles; sin contexto seguro (HTTP por IP de red local) navigator.clipboard no existe, así que se cae a execCommand. */
async function copyText(text: string): Promise<boolean> {
  try { if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(text); return true; } } catch { /* se prueba el respaldo */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:-9999px;opacity:0';
  document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0, text.length);
  try { return document.execCommand('copy'); } catch { return false; } finally { document.body.removeChild(ta); }
}

/** Botón que copia texto (mensajes de WhatsApp, enlaces). */
export function CopyButton({ text, label, className }: { text: string; label?: string; className?: string }) {
  const toast = useToast(); const t = useT();
  return <button type="button" className={className ?? 'btn-ghost btn-sm'} onClick={async () => { if (await copyText(text)) toast.push(t('common.copied')); else toast.push(t('common.copyFailed'), 'err'); }}>{label ?? t('common.copy')}</button>;
}

export function Autofocus() { return null; }

/** Selector con búsqueda sencilla (lista nativa + filtro). */
export function SearchSelect<T extends { id: string; label: string; sub?: string }>({ items, value, onChange, placeholder, allowEmpty = true, id }: { items: T[]; value: string | null; onChange: (id: string | null) => void; placeholder?: string; allowEmpty?: boolean; id?: string }) {
  const t = useT();
  return (
    <select id={id} className="input" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      {allowEmpty && <option value="">{placeholder ?? t('common.selectPlaceholder')}</option>}
      {items.map((i) => <option key={i.id} value={i.id}>{i.label}{i.sub ? ` · ${i.sub}` : ''}</option>)}
    </select>
  );
}
