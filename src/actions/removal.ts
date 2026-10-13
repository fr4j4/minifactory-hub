'use server';
import { revalidatePath } from 'next/cache';
import { requirePerm } from '@/lib/auth';
import { isRemovable, removalInfo, removeRecord, REMOVAL_MODULE } from '@/lib/services/removal';
import { getT } from '@/i18n/server';
import { LocalizedError } from '@/i18n/errors';
import { safe } from './common';

/** Pregunta si un registro se puede eliminar; si no, devuelve el motivo ya traducido. */
export async function removalInfoAction(kind: string, id: string) {
  return safe(async () => {
    if (!isRemovable(kind)) throw new LocalizedError('remove.notFound');
    const u = await requirePerm(REMOVAL_MODULE[kind], 'X');
    const info = await removalInfo(kind, id, u.id); const t = await getT();
    return { canDelete: info.canDelete, reason: info.block ? t(info.block.key, info.block.params) : null };
  });
}

export async function removeAction(kind: string, id: string) {
  return safe(async () => {
    if (!isRemovable(kind)) throw new LocalizedError('remove.notFound');
    const u = await requirePerm(REMOVAL_MODULE[kind], 'X');
    await removeRecord(kind, id, u.id);
    revalidatePath('/', 'layout');
  });
}
