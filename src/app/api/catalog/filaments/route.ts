import { listFilaments, type FilamentQuery } from '@/lib/catalog/ofd';
import { guard, intParam, json, strParam } from '@/lib/catalog/http';

const SORTS = ['brand', 'name', 'colors', 'density'] as const;

/** GET /api/catalog/filaments?q=&brand=&material=&trait=&hasTemps=1&sort=&page=&pageSize= */
export async function GET(req: Request) {
  const g = await guard(); if (g) return g; const u = new URL(req.url); const sort = strParam(u, 'sort');
  return json(req, await listFilaments({
    q: strParam(u, 'q'), brand: strParam(u, 'brand'), material: strParam(u, 'material'), trait: strParam(u, 'trait'), hasTemps: u.searchParams.get('hasTemps') === '1',
    sort: SORTS.includes(sort as never) ? (sort as FilamentQuery['sort']) : undefined, page: intParam(u, 'page'), pageSize: intParam(u, 'pageSize'),
  }));
}
