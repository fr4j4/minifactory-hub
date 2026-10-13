import type { EditField } from '@/components/edit-button';
import type { EditKind } from './services/edits';
import { EDIT_SPEC } from './services/edits';
import { tOr } from '@/i18n/translate';

type TFn = Parameters<typeof tOr>[0];

const REQUIRED = new Set(['task', 'description', 'name', 'summary', 'amount', 'paidAt', 'date']);
const AREAS = new Set(['notes', 'description', 'summary']);
const DATES = new Set(['paidAt', 'dueDate', 'date', 'shipBy', 'boughtAt']);

/** Campos del diálogo de edición de cada tipo, con etiquetas y opciones ya traducidas. */
export function editFields(kind: EditKind, t: TFn): EditField[] {
  const spec = EDIT_SPEC[kind].fields as Record<string, unknown>;
  return Object.entries(spec).map(([key, sp]) => {
    const f: EditField = { key, label: tOr(t, `edit.field.${key}`, key), required: REQUIRED.has(key) };
    if (Array.isArray(sp)) {
      f.type = 'select';
      f.options = sp.map((v: string) => ({ value: v, label: v === '' ? tOr(t, 'edit.opt.none', '—') : tOr(t, `edit.opt.${v}`, tOr(t, `sources.${v}`, tOr(t, `payMethod.${v}`, tOr(t, `taxDoc.${v}`, v)))) }));
    } else if (sp === 'n' || sp === 'N') f.type = 'number';
    else if (DATES.has(key)) f.type = 'date';
    else if (AREAS.has(key)) f.type = 'textarea';
    return f;
  });
}
