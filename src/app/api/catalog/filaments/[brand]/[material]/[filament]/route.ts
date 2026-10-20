import { NextResponse } from 'next/server';
import { getFilament } from '@/lib/catalog/ofd';
import { guard, json } from '@/lib/catalog/http';

type Ctx = { params: Promise<{ brand: string; material: string; filament: string }> };

export async function GET(req: Request, { params }: Ctx) {
  const g = await guard(); if (g) return g; const p = await params;
  const f = await getFilament(`${p.brand}/${p.material}/${p.filament}`);
  return f ? json(req, f) : NextResponse.json({ error: 'not_found' }, { status: 404 });
}
