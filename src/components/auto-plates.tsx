'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { reprocessVersionAction } from '@/actions/files';
import { useT } from '@/i18n/client';

/**
 * Un 3MF procesado antes de que existiera la detección de placas no las tiene calculadas. Al abrirlo se pide
 * el procesamiento una vez y la ficha se refresca sola hasta que aparecen (máximo ~90 s).
 */
export function AutoPlates({ versionId }: { versionId: string }) {
  const t = useT(); const router = useRouter();
  useEffect(() => {
    let stop = false, timer: ReturnType<typeof setTimeout>; const key = `plates-queued:${versionId}`; const t0 = Date.now();
    (async () => {
      let queued = false; try { queued = !!sessionStorage.getItem(key); } catch { /* sin almacenamiento */ }
      if (!queued) { const r = await reprocessVersionAction(versionId); if (!r.ok || stop) return; try { sessionStorage.setItem(key, '1'); } catch { /* sin almacenamiento */ } }
      const tick = () => { if (stop || Date.now() - t0 > 90_000) return; router.refresh(); timer = setTimeout(tick, 3000); };
      timer = setTimeout(tick, 3000);
    })();
    return () => { stop = true; clearTimeout(timer); };
  }, [versionId, router]);
  return <div role="status" className="card p-3 mb-3 text-sm flex items-center gap-2"><Loader2 className="h-4 w-4 animate-spin" aria-hidden />{t('files.detectingPlates')}</div>;
}
