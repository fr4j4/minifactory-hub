'use client';
import { useState } from 'react';
import { saveSettingsAction } from '@/actions/settings';
import { useAction } from './client';
import { useT } from '@/i18n/client';

/** Activa o desactiva el etiquetado automático de la biblioteca (solo reglas con confianza alta). */
export function AutoTagSetting({ initial }: { initial: boolean }) {
  const t = useT(); const { run, pending } = useAction(); const [on, setOn] = useState(initial);
  return (
    <label className="flex items-start gap-2 text-sm mt-4 pt-3 border-t border-[var(--line)]">
      <input type="checkbox" className="mt-1" checked={on} disabled={pending} data-testid="auto-tag" onChange={(e) => { const v = e.target.checked; setOn(v); run(() => saveSettingsAction({ library: { autoTag: v } }), { ok: t('settings.autoTagSaved') }); }} />
      <span>{t('settings.autoTag')}<span className="muted block text-xs">{t('settings.autoTagHint')}</span></span>
    </label>
  );
}
