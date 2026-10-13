import Link from 'next/link';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { getDb, s } from '@/db';
import { pagePerm } from '@/lib/auth';
import { can } from '@/lib/perm';
import { PageHeader, Badge, Empty, Card } from '@/components/ui';
import { Uploader } from '@/components/uploader';
import { FavButton } from '@/components/file-bits';
import { formatLabel } from '@/lib/files';
import { num } from '@/lib/format';

export const metadata = { title: 'Archivos 3D' };

export default async function FilesPage({ searchParams }: { searchParams: Promise<{ q?: string; tag?: string; folder?: string; fav?: string }> }) {
  const user = await pagePerm('archivos', 'V'); const sp = await searchParams; const db = await getDb();
  const conds = [isNull(s.modelFiles.deletedAt)];
  if (sp.q) conds.push(or(ilike(s.modelFiles.name, `%${sp.q}%`), ilike(s.modelFiles.origin, `%${sp.q}%`), sql`${s.modelFiles.tags}::text ilike ${'%' + sp.q + '%'}`)!);
  if (sp.tag) conds.push(sql`${s.modelFiles.tags}::text ilike ${'%"' + sp.tag + '"%'}`);
  if (sp.folder) conds.push(eq(s.modelFiles.folder, sp.folder));
  if (sp.fav) conds.push(eq(s.modelFiles.favorite, true));
  const rows = await db.select({ f: s.modelFiles, v: s.fileVersions }).from(s.modelFiles).leftJoin(s.fileVersions, eq(s.fileVersions.id, s.modelFiles.currentVersionId)).where(and(...conds)).orderBy(desc(s.modelFiles.favorite), desc(s.modelFiles.updatedAt)).limit(200);
  const all = await db.select({ tags: s.modelFiles.tags, folder: s.modelFiles.folder }).from(s.modelFiles).where(isNull(s.modelFiles.deletedAt));
  const tags = [...new Set(all.flatMap((a) => a.tags ?? []))].sort(); const folders = [...new Set(all.map((a) => a.folder).filter(Boolean) as string[])].sort();
  return (
    <>
      <PageHeader title="Archivos 3D" subtitle="Biblioteca de modelos con versiones, análisis automático y visor en el navegador." />
      {can(user, 'archivos', 'C') && <Card className="mb-4"><Uploader intent={{ intent: 'model' }} accept=".stl,.3mf,.obj,.ply,.amf,.glb,.step,.stp,.gcode,.gco,.bgcode,.png,.jpg,.jpeg,.webp,.pdf" label="Arrastra tus modelos aquí (STL, 3MF, OBJ, STEP, G-code…)" hint="Hasta 500 MB por archivo, subida por partes con reanudación. Se detectan duplicados por hash." testId="model-uploader" /></Card>}
      <form className="flex flex-wrap gap-2 mb-4" role="search">
        <input name="q" defaultValue={sp.q} placeholder="Buscar por nombre, etiqueta, origen…" className="input sm:max-w-xs" aria-label="Buscar archivos" />
        <select name="tag" defaultValue={sp.tag ?? ''} className="input sm:!w-44" aria-label="Etiqueta"><option value="">Todas las etiquetas</option>{tags.map((t) => <option key={t}>{t}</option>)}</select>
        {folders.length > 0 && <select name="folder" defaultValue={sp.folder ?? ''} className="input sm:!w-44" aria-label="Carpeta"><option value="">Todas las carpetas</option>{folders.map((t) => <option key={t}>{t}</option>)}</select>}
        <label className="flex items-center gap-1.5 text-sm px-1"><input type="checkbox" name="fav" value="1" defaultChecked={!!sp.fav} /> Favoritos</label>
        <button className="btn-ghost">Filtrar</button>
      </form>
      {rows.length === 0 ? <Card><Empty title="No hay archivos" hint="Sube un STL o 3MF para ver el modelo, medirlo y saber si cabe en tus máquinas." /></Card> : (
        <ul className="grid gap-3 grid-cols-2 md:grid-cols-3 xl:grid-cols-5" data-testid="file-grid">
          {rows.map(({ f, v }) => (
            <li key={f.id} className="card overflow-hidden flex flex-col">
              <Link href={`/archivos/${f.id}`} className="block aspect-[4/3] bg-slate-100 dark:bg-slate-800 relative" aria-label={`Abrir ${f.name}`}>
                {v?.thumbKey ? <img src={`/api/files/v/${v.id}/thumb`} alt={`Miniatura de ${f.name}`} className="w-full h-full object-cover" loading="lazy" /> : <div className="w-full h-full grid place-items-center text-slate-400 text-sm">{(v?.meta as any)?.status === 'processing' ? 'Procesando…' : formatLabel(f.format ?? '')}</div>}
                <span className="absolute left-1.5 top-1.5 badge bg-white/90 dark:bg-slate-900/80 border-transparent">{formatLabel(f.format ?? '')}</span>
              </Link>
              <div className="p-3 flex-1 flex flex-col gap-1.5">
                <div className="flex items-start justify-between gap-1"><Link href={`/archivos/${f.id}`} className="font-medium text-sm leading-snug hover:underline line-clamp-2">{f.name}</Link><FavButton id={f.id} fav={f.favorite} /></div>
                <div className="text-xs muted tabular">{f.dimX ? `${num(f.dimX, 1)}×${num(f.dimY, 1)}×${num(f.dimZ, 1)} mm` : '—'}{f.volumeCm3 ? ` · ${num(f.volumeCm3, 1)} cm³` : ''}</div>
                <div className="flex flex-wrap gap-1 mt-auto">{f.closed === false && <Badge tone="amber">Malla abierta</Badge>}{v && v.number > 1 && <Badge>v{v.number}</Badge>}{(f.tags ?? []).slice(0, 3).map((t) => <Badge key={t}>{t}</Badge>)}</div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
