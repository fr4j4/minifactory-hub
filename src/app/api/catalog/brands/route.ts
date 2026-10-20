import { listBrands } from '@/lib/catalog/ofd';
import { guard, intParam, json, strParam } from '@/lib/catalog/http';

/** GET /api/catalog/brands?q=&origin=&page=&pageSize= */
export async function GET(req: Request) {
  const g = await guard(); if (g) return g; const u = new URL(req.url);
  return json(req, await listBrands({ q: strParam(u, 'q'), origin: strParam(u, 'origin'), page: intParam(u, 'page'), pageSize: intParam(u, 'pageSize') }));
}
