'use server';
import { revalidatePath } from 'next/cache';
import { requirePerm } from '@/lib/auth';
import { isRemovable, REMOVAL_MODULE } from '@/lib/services/removal';
import { restoreRecord } from '@/lib/services/archive';
import { LocalizedError } from '@/i18n/errors';
import { safe } from './common';

export async function restoreAction(kind: string, id: string) {
  return safe(async () => {
    if (!isRemovable(kind)) throw new LocalizedError('remove.notFound');
    const u = await requirePerm(REMOVAL_MODULE[kind], 'X');
    await restoreRecord(kind, id, u.id);
    revalidatePath('/', 'layout');
  });
}
