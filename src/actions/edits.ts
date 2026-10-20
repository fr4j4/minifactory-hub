'use server';
import { revalidatePath } from 'next/cache';
import { requirePerm } from '@/lib/auth';
import { editRecord, EDIT_SPEC, isEditable } from '@/lib/services/edits';
import { LocalizedError } from '@/i18n/errors';
import { safe } from './common';

/** Edita campos permitidos de un registro ya creado (ver `EDIT_SPEC`). */
export async function editRecordAction(kind: string, id: string, values: Record<string, unknown>) {
  return safe(async () => {
    if (!isEditable(kind)) throw new LocalizedError('remove.notFound');
    const u = await requirePerm(EDIT_SPEC[kind].module, 'E');
    await editRecord(kind, id, values, u.id);
    revalidatePath('/', 'layout');
  });
}
