import type { Res } from '@/components/client';
import { revalidatePath } from 'next/cache';
import { getT } from '@/i18n/server';
import { errorText } from '@/i18n/errors';

/** Convierte excepciones en { ok:false, error } para mostrarlas como aviso en la interfaz. */
export async function safe<T>(fn: () => Promise<T>, paths: string[] = []): Promise<Res<T>> {
  try { const data = await fn(); for (const p of paths) revalidatePath(p); return { ok: true, data }; }
  catch (e) { return { ok: false, error: errorText(e, await getT()) }; }
}
