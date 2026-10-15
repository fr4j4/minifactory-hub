'use server';
import { requirePerm } from '@/lib/auth';
import { retryJob } from '@/lib/jobs';
import { safe } from './common';

/** Reintenta un trabajo en segundo plano que se quedó en error. */
export async function retryJobAction(id: string) {
  return safe(async () => { await requirePerm('config', 'E'); await retryJob(id); }, ['/configuracion']);
}
