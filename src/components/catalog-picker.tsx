'use client';
import { useEffect, useRef, useState } from 'react';
import { useT } from '@/i18n/client';
import { tempRange } from '@/lib/catalog/map';
import type { CatalogFilament, CatalogVariant, Page } from '@/lib/catalog/ofd';

export type PickedLine = CatalogFilament; export type PickedColor = CatalogVariant;
const get = async <T,>(url: string): Promise<T> => { const r = await fetch(url, { credentials: 'same-origin' }); if (!r.ok) throw new Error(String(r.status)); return r.json() as Promise<T>; };
const path = (k: string) => k.split('/').map(encodeURIComponent).join('/');

/** Busca una línea en el catálogo de filamentos (API paginada) y deja marcar sus colores. */
export function CatalogPicker({ onApply, linkedName, onUnlink }: { onApply: (line: PickedLine, colors: PickedColor[]) => void; linkedName?: string | null; onUnlink?: () => void }) {
  const t = useT(); const [q, setQ] = useState(''); const [res, setRes] = useState<PickedLine[] | null>(null); const [busy, setBusy] = useState(false);
  const [sel, setSel] = useState<PickedLine | null>(null); const [colors, setColors] = useState<PickedColor[]>([]); const [next, setNext] = useState<number | null>(null); const [ticked, setTicked] = useState<Set<string>>(new Set()); const [meta, setMeta] = useState<string>('');
  const seq = useRef(0);

  useEffect(() => { get<{ commitDate: string }>('/api/catalog/meta').then((m) => setMeta((m.commitDate || '').slice(0, 10))).catch(() => {}); }, []);
  useEffect(() => {
    const term = q.trim(); if (term.length < 2) { setRes(null); return; }
    const id = ++seq.current; setBusy(true);
    const h = setTimeout(() => { get<Page<PickedLine>>(`/api/catalog/filaments?q=${encodeURIComponent(term)}&pageSize=8&sort=colors`).then((r) => { if (id === seq.current) setRes(r.items); }).catch(() => { if (id === seq.current) setRes([]); }).finally(() => { if (id === seq.current) setBusy(false); }); }, 250);
    return () => clearTimeout(h);
  }, [q]);

  const loadColors = async (key: string, page: number, acc: PickedColor[]) => {
    const r = await get<Page<PickedColor>>(`/api/catalog/filaments/${path(key)}/variants?page=${page}&pageSize=100`);
    const all = [...acc, ...r.items]; setColors(all); setNext(r.nextPage); return all;
  };
  const choose = async (f: PickedLine) => {
    setSel(f); setColors([]); setTicked(new Set()); setNext(null); setBusy(true);
    try { await loadColors(f.key, 1, []); } finally { setBusy(false); }
  };
  const toggle = (id: string) => setTicked((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });

  return (
    <section className="card p-4" data-testid="catalog-picker">
      <h2 className="text-sm font-semibold mb-1">{t('inventory.catPickTitle')}</h2>
      <p className="muted text-xs mb-3">{t('inventory.catPickHint')}</p>
      {linkedName && <p className="text-xs mb-2 flex items-center gap-2" role="status"><span className="badge border-[var(--line)]">{t('inventory.catLinkedTo', { name: linkedName })}</span>{onUnlink && <button type="button" className="btn-ghost btn-sm" onClick={onUnlink}>{t('inventory.catUnlink')}</button>}</p>}
      <input className="input" placeholder={t('inventory.catSearch')} value={q} onChange={(e) => { setQ(e.target.value); setSel(null); }} aria-label={t('inventory.catSearch')} data-testid="catalog-search" />
      {busy && !sel && <p className="muted text-xs mt-2">{t('inventory.catSearching')}</p>}
      {!sel && res && !busy && (res.length === 0 ? <p className="muted text-xs mt-2">{t('inventory.catNoResults')}</p> : (
        <ul className="mt-2 grid gap-1" data-testid="catalog-results">{res.map((f) => (
          <li key={f.key}><button type="button" className="w-full text-left rounded-lg border border-[var(--line)] px-3 py-2 hover:bg-[var(--surface-2)]" onClick={() => choose(f)}>
            <span className="font-medium">{f.brandName}</span> · {f.name} <span className="muted text-xs">({f.material})</span>
            <span className="muted text-xs block">{t('inventory.catColorsCount', { n: f.colorCount })}{f.tempMax != null ? ` · ${t('inventory.catNozzleTemp', { range: tempRange(f.tempMin, f.tempMax) })}` : ''}{f.bedMax != null ? `, ${t('inventory.catBedTemp', { range: tempRange(f.bedMin, f.bedMax) })}` : ''}</span>
          </button></li>))}</ul>))}
      {sel && (
        <div className="mt-3" data-testid="catalog-colors">
          <p className="text-sm font-medium mb-2">{sel.brandName} · {sel.name} — {t('inventory.catColorsTitle')}</p>
          {busy && !colors.length && <p className="muted text-xs">{t('inventory.catLoading')}</p>}
          <div className="flex gap-2 mb-2"><button type="button" className="btn-ghost btn-sm" onClick={() => setTicked(new Set(colors.map((c) => c.id)))}>{t('inventory.catSelectAll')}</button><button type="button" className="btn-ghost btn-sm" onClick={() => setTicked(new Set())}>{t('inventory.catSelectNone')}</button></div>
          <ul className="grid sm:grid-cols-2 lg:grid-cols-3 gap-1 max-h-72 overflow-auto" tabIndex={0}>{colors.map((c) => (
            <li key={c.id}><label className="flex items-center gap-2 rounded-lg border border-[var(--line)] px-2 py-1 cursor-pointer"><input type="checkbox" checked={ticked.has(c.id)} onChange={() => toggle(c.id)} /><span className="inline-block h-4 w-4 rounded-full border border-[var(--line)] shrink-0" style={{ background: c.hexes.length > 1 ? `linear-gradient(90deg, ${c.hexes.join(', ')})` : c.hex }} aria-hidden /><span className="truncate text-sm">{c.name}</span></label></li>))}</ul>
          <div className="flex flex-wrap gap-2 mt-3">
            {next && <button type="button" className="btn-ghost btn-sm" disabled={busy} onClick={async () => { setBusy(true); try { await loadColors(sel.key, next, colors); } finally { setBusy(false); } }}>{t('inventory.catMore')}</button>}
            <button type="button" className="btn-primary btn-sm" onClick={() => { onApply(sel, colors.filter((c) => ticked.has(c.id))); setSel(null); setQ(''); setRes(null); }} data-testid="catalog-apply">{t('inventory.catAddColors', { n: ticked.size })}</button>
          </div>
        </div>)}
      {meta && <p className="muted text-xs mt-3">{t('inventory.catSource', { date: meta })}</p>}
    </section>
  );
}
