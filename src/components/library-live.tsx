'use client';
import { useEffect, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

/**
 * Mantiene la lista al día sin recargar: consulta un estado liviano con los mismos filtros de la página y, si cambió
 * (llegó un modelo, terminó de procesarse o avanzó una importación), vuelve a renderizar la página. Como solo se
 * refresca el servidor, la URL, los filtros y la página en la que estás se conservan.
 */
export function LibraryLive({ signature, active }: { signature: string; active: boolean }) {
  const router = useRouter(); const params = useSearchParams(); const query = params.toString();
  const known = useRef(signature); known.current = signature;
  useEffect(() => {
    let stop = false, timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      if (stop) return;
      if (document.visibilityState === 'visible') {
        try {
          const r = await fetch(`/api/library/live?${query}`, { cache: 'no-store' });
          if (r.ok) { const s = await r.json(); if (!stop && s.signature && s.signature !== known.current) { known.current = s.signature; router.refresh(); } }
        } catch { /* sin red: se reintenta */ }
      }
      timer = setTimeout(tick, active ? 3000 : 12000);
    };
    timer = setTimeout(tick, active ? 3000 : 12000);
    const onVisible = () => { if (document.visibilityState === 'visible') { clearTimeout(timer); void tick(); } };
    document.addEventListener('visibilitychange', onVisible);
    return () => { stop = true; clearTimeout(timer); document.removeEventListener('visibilitychange', onVisible); };
  }, [query, active, router]);
  return null;
}
