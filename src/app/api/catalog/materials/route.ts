import { listMaterials } from '@/lib/catalog/ofd';
import { guard, json } from '@/lib/catalog/http';

export async function GET(req: Request) { const g = await guard(); if (g) return g; return json(req, { items: await listMaterials() }); }
