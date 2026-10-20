'use client';
import { useEffect, useState } from 'react';
import { useLocale, useT } from '@/i18n/client';
import { isPalette, isThemeMode, PALETTE_IDS, PALETTE_NAMES, PALETTES, type PaletteId, type ThemeMode } from '@/lib/palettes';

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const write = (k: string, v: string | null) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); } catch { /* sin almacenamiento: vale para esta sesión */ } };

/** Elección de paleta y modo claro/oscuro. Se guarda solo en este navegador (localStorage); sin elección rige la paleta del taller. */
export function ThemePicker({ shopPalette = 'capa', compact }: { shopPalette?: string; compact?: boolean }) {
  const t = useT(); const lang = useLocale() === 'en' ? 'en' : 'es';
  const [palette, setPalette] = useState<PaletteId | ''>(''); const [mode, setMode] = useState<ThemeMode>('system');
  useEffect(() => { const p = read('mf_palette'); const m = read('mf_theme'); setPalette(isPalette(p) ? p : ''); setMode(isThemeMode(m) ? m : 'system'); }, []);
  const apply = (p: PaletteId | '', m: ThemeMode) => {
    const d = document.documentElement; const eff = p || (isPalette(shopPalette) ? shopPalette : 'capa');
    if (eff !== 'capa') d.setAttribute('data-palette', eff); else d.removeAttribute('data-palette');
    if (m === 'system') d.removeAttribute('data-theme'); else d.setAttribute('data-theme', m);
    write('mf_palette', p || null); write('mf_theme', m === 'system' ? null : m);
  };
  const pickP = (p: PaletteId | '') => { setPalette(p); apply(p, mode); }; const pickM = (m: ThemeMode) => { setMode(m); apply(palette, m); };
  const sw = (id: PaletteId) => <span className="inline-flex h-4 w-8 overflow-hidden rounded-full border border-black/20" aria-hidden><span className="w-1/2" style={{ background: PALETTES[id].light.bg }} /><span className="w-1/2" style={{ background: PALETTES[id].accent }} /></span>;
  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'} data-testid="theme-picker">
      <div role="group" aria-label={t('theme.mode')} className="flex gap-1">{(['system', 'light', 'dark'] as const).map((m) => <button key={m} type="button" aria-pressed={mode === m} onClick={() => pickM(m)} data-testid={`theme-${m}`} className={`btn-sm px-2.5 rounded-lg border text-xs ${mode === m ? 'border-[var(--accent)] font-semibold' : 'btn-ghost'}`}>{t(`theme.mode_${m}` as 'theme.mode_system')}</button>)}</div>
      <div role="group" aria-label={t('theme.palette')} className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={palette === ''} onClick={() => pickP('')} data-testid="palette-shop" className={`btn-sm px-2.5 rounded-lg border text-xs ${palette === '' ? 'border-[var(--accent)] font-semibold' : 'btn-ghost'}`}>{t('theme.useShop')}</button>
        {PALETTE_IDS.map((id) => <button key={id} type="button" aria-pressed={palette === id} onClick={() => pickP(id)} data-testid={`palette-${id}`} className={`btn-sm px-2 rounded-lg border text-xs inline-flex items-center gap-1.5 ${palette === id ? 'border-[var(--accent)] font-semibold' : 'btn-ghost'}`}>{sw(id)}{PALETTE_NAMES[id][lang]}</button>)}
      </div>
    </div>
  );
}
