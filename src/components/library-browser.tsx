'use client';
import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import { Plus, SlidersHorizontal, X } from 'lucide-react';
import { useT } from '@/i18n/client';
import { cn } from '@/lib/format';

/** Barra lateral de filtros: fija en escritorio y desplegable en móvil. */
export function FiltersPanel({ active, children }: { active: number; children: ReactNode }) {
  const t = useT(); const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-ghost md:hidden w-full mb-3 justify-center" aria-expanded={open} onClick={() => setOpen(!open)}>
        {open ? <X className="h-4 w-4" aria-hidden /> : <SlidersHorizontal className="h-4 w-4" aria-hidden />}
        {open ? t('library.hideFilters') : t('library.filters')}{active > 0 && <span className="badge !py-0 ml-1">{active}</span>}
      </button>
      <aside className={cn('md:block md:sticky md:top-4 md:max-h-[calc(100vh-2rem)] md:overflow-y-auto md:pr-1 [scrollbar-width:thin]', !open && 'max-md:hidden')} aria-label={t('library.filters')}>{children}</aside>
    </>
  );
}

/** Lista de opciones de una faceta con «Ver más» cuando son muchas. */
export function FacetItems({ items, limit = 8 }: { items: Array<{ key: string; href: string; label: string; n: number; on: boolean; swatch?: string | null }>; limit?: number }) {
  const t = useT(); const [all, setAll] = useState(false);
  const shown = all ? items : items.filter((x, i) => i < limit || x.on);
  return (
    <>
      <ul className="grid gap-0.5">
        {shown.map((x) => (
          <li key={x.key}>
            <Link href={x.href} scroll={false} aria-current={x.on ? 'true' : undefined} className={cn('flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm hover:bg-[var(--hover)] min-h-[36px] md:min-h-[30px]', x.on && 'bg-[var(--accent-soft)] font-medium')}>
              <span className={cn('h-3.5 w-3.5 shrink-0 rounded border grid place-items-center', x.on ? 'bg-[var(--accent)] border-[var(--accent)]' : 'border-[var(--line)]')} aria-hidden>{x.on && <svg viewBox="0 0 12 12" className="h-2.5 w-2.5"><path d="M2.5 6.2 5 8.5l4.5-5" fill="none" stroke="var(--on-accent)" strokeWidth="1.8" /></svg>}</span>
              {x.swatch && <span className="h-2 w-2 rounded-full shrink-0" style={{ background: x.swatch }} aria-hidden />}
              <span className="truncate flex-1">{x.label}</span>
              <span className="muted text-xs tabular">{x.n}</span>
            </Link>
          </li>
        ))}
      </ul>
      {items.length > limit && <button type="button" className="text-xs text-[var(--accent-ink)] hover:underline px-2 mt-1" onClick={() => setAll(!all)}>{all ? t('library.showLess') : t('library.showMore', { n: items.length - shown.length })}</button>}
    </>
  );
}

/** Select que envía su formulario al cambiar (orden). */
export function AutoSubmitSelect({ name, value, options, label }: { name: string; value: string; options: Array<{ value: string; label: string }>; label: string }) {
  return <select className="input md:!w-auto" name={name} defaultValue={value} aria-label={label} onChange={(e) => e.currentTarget.form?.requestSubmit()}>{options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>;
}

/** Panel plegable para subir archivos o importar por URL; no ocupa la pantalla mientras se explora. */
export function AddModelsPanel({ children }: { children: ReactNode }) {
  const t = useT(); const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" className="btn-primary" aria-expanded={open} onClick={() => setOpen(!open)}><Plus className="h-4 w-4" aria-hidden />{t('library.addModels')}</button>
      {open && <div className="basis-full order-last mt-3 grid gap-3">{children}</div>}
    </>
  );
}
