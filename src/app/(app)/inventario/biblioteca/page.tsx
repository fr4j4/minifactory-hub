import { redirect } from 'next/navigation';

/** La biblioteca de filamentos pasó a /filamentos (sección propia del menú); esta ruta sigue valiendo para enlaces antiguos. */
export default async function Old({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const q = new URLSearchParams(); for (const [k, v] of Object.entries(await searchParams)) for (const x of Array.isArray(v) ? v : v === undefined ? [] : [v]) q.append(k, x);
  redirect(`/filamentos${q.size ? `?${q}` : ''}`);
}
