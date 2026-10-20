import { NextResponse } from 'next/server';
import { listVariants } from '@/lib/catalog/ofd';
import { guard, intParam, json, strParam } from '@/lib/catalog/http';

type Ctx = { params: Promise<{ brand: string; material: string; filament: string }> };

/** Colores de una línea con hex, rasgos, tamaños y GTIN. GET ...?q=&page=&pageSize= */
export async function GET(req: Request, { params }: Ctx) {
  const g = await guard(); if (g) return g; const p = await params; const u = new URL(req.url);
  const r = await listVariants(`${p.brand}/${p.material}/${p.filament}`, { q: strParam(u, 'q'), page: intParam(u, 'page'), pageSize: intParam(u, 'pageSize') });
  return r ? json(req, r) : NextResponse.json({ error: 'not_found' }, { status: 404 });
}
