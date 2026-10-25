import { redirect } from 'next/navigation';

/** Enlace antiguo a una línea de la biblioteca: se redirige a la sección /filamentos. */
export default async function Old({ params, searchParams }: { params: Promise<{ brand: string; material: string; filament: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const p = await params; const q = new URLSearchParams(); for (const [k, v] of Object.entries(await searchParams)) for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) q.append(k, x);
  redirect(`/filamentos/${p.brand}/${p.material}/${p.filament}${q.size ? `?${q}` : ''}`);
}
